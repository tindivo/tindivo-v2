-- 0264 · send-push reclama el evento en la base: el cuerpo ya no se cree
--
-- Hallazgo de seguridad: send-push recibía `{event_type, aggregate_id, payload}` sin autorización
-- propia y resolvía destinatarios con service role. El trigger le manda la CLAVE ANÓNIMA, que
-- viaja en los bundles web: cualquiera podía hacer POST con un event_type real y el UUID de un
-- pedido y mandar pushes falsos al cliente, al negocio o al motorizado.
--
-- Arreglo: el cuerpo lleva además el `event_id` del evento recién insertado en `domain_events`, y
-- send-push lo reclama con `claim_push_event` (service_role): un solo uso por evento y solo si es
-- de los últimos 15 minutos. Lo que notifica sale de la base, no del cuerpo. Un POST con la clave
-- anónima no tiene un `event_id` reclamable (los UUID no se adivinan, `domain_events` solo la
-- lee un admin y no hay Realtime) y recibe 409 sin push.
--
-- Por qué NO un secreto compartido en una cabecera: pg_net guarda las cabeceras en CLARO en
-- `net.http_request_queue`, y el esquema `net` es de supabase_admin con USAGE/SELECT para PUBLIC:
-- ninguna migración (rol postgres) puede revocarlo. Un secreto ahí sería legible.
--
-- Corte `push_claim_since` (cierra el hallazgo CAX-001): mientras la función VIEJA sigue viva,
-- notifica eventos sin escribir `push_claimed_at`; tras desplegar la nueva, quien conociera ese
-- `event_id` podría reclamarlo otra vez (< 15 min) y provocar un segundo envío. Por eso
-- `claim_push_event` reclama además SOLO eventos con `occurred_at >= app_settings.push_claim_since`
-- (timestamptz como cadena ISO en el jsonb, igual que `order_intake_cutoff` guarda un escalar).
-- La fija el operador DESPUÉS del deploy de la función (Docs/operacion/deploy.md §2.2); todo evento
-- anterior queda no reclamable. FALLO CERRADO: sin fila, valor nulo, no-cadena, formato que no sea
-- ISO o no convertible a timestamptz => no se reclama nada. Esta migración NO inserta la fila.
-- Escribirla pueden el rol de servicio y un admin (policy as_admin_all); el PATCH de ajustes de la
-- API no la expone (no está en su lista blanca) y `as_public_read` no la lee.
--
-- Transición sin ventana: el cuerpo conserva `event_type`, `aggregate_id` y `payload`, así que la
-- función hoy desplegada sigue funcionando entre el `db push` y el deploy, y redesplegar la
-- anterior sirve de rollback. Mientras no exista el corte la función nueva responde 409 a todo
-- (avisos perdidos, aceptado por el dueño; ver Docs/operacion/deploy.md §2.2).
--
-- `dispatch_event` idéntica a la 0238 (firma, lista de eventos, config, Authorization, SECURITY
-- DEFINER, search_path, revokes) salvo `event_id` en el cuerpo. Idempotente.

alter table public.domain_events add column if not exists push_claimed_at timestamptz;
comment on column public.domain_events.push_claimed_at is
  'Cuándo send-push reclamó este evento (claim_push_event). Un evento se reclama una sola vez.';

create or replace function public.claim_push_event(p_event_id uuid)
  returns table (event_type text, aggregate_id uuid, payload jsonb)
  language plpgsql security definer set search_path = ''
as $$
declare
  v_raw jsonb;
  v_since timestamptz;
begin
  select s.value into v_raw from public.app_settings as s where s.key = 'push_claim_since';
  -- Fallo cerrado: sin fila, nulo, no-cadena o sin forma ISO => nada se reclama.
  if v_raw is null or jsonb_typeof(v_raw) <> 'string'
     or (v_raw #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then
    return;
  end if;
  begin
    v_since := (v_raw #>> '{}')::timestamptz;
  exception when others then
    return;
  end;
  if v_since is null or not isfinite(v_since) then
    return;
  end if;

  return query
    update public.domain_events as e
       set push_claimed_at = now()
     where e.id = p_event_id
       and e.push_claimed_at is null
       and e.occurred_at >= v_since
       and e.occurred_at > now() - interval '15 minutes'
    returning e.event_type, e.aggregate_id, e.payload;
end;
$$;
revoke all on function public.claim_push_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_push_event(uuid) to service_role;

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  -- Eventos con destinatario humano. El resto (`BusinessBlocked`,
  -- `CustomerNoShow`, `OrderPrepExtended`, `order/appeal.created`) es
  -- auditoria: se queda en el outbox y no viaja.
  if new.event_type not in (
    'OrderStatusChanged',   -- ciclo del pedido (cliente, negocio y motorizado)
    'OrderExpired',         -- prepago sin comprobante (cliente)
    'OrderCreated',         -- pedido nuevo (negocio) + aviso anticipado (motorizado)
    'OrderQueued',          -- entro a la bandeja por reloj (motorizados)
    'OrderReleased',        -- el pedido vuelve a la bolsa (resto de motorizados)
    'OrderOverdue',         -- nadie lo ha tomado y se enfria (motorizados)
    'OrderProofVerified',   -- la cajera aprobo el comprobante (cliente)
    'OrderValidated',       -- el pedido paso el antifraude (cliente)
    'TransferRequested',    -- te piden tu pedido (dueño)
    'TransferResolved',     -- aceptado / rechazado / vencido (uno o los dos)
    'CashDelivered',        -- el motorizado declara efectivo (negocio)
    'CashConfirmed',        -- el negocio confirma (motorizado)
    'CashDisputed',         -- el negocio reporta diferencia (motorizado)
    'CashResolved',         -- Tindivo cierra el caso (motorizado)
    'CourierStepped'        -- Tindivo Entregas (motorizados y cliente)
  ) then
    return new;
  end if;

  select value into v_cfg from public.app_settings where key = 'push_dispatch';
  v_url := v_cfg ->> 'url';
  v_key := v_cfg ->> 'anonKey';
  if v_url is null then
    return new; -- push no configurado (dev): no-op
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'event_id', new.id,
      'event_type', new.event_type,
      'aggregate_id', new.aggregate_id,
      'payload', new.payload
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
  return new;
end;
$$;
revoke all on function public.dispatch_event() from public, anon, authenticated;
