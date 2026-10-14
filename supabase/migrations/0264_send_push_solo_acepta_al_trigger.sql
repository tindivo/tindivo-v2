-- 0264 · send-push solo acepta al trigger: `dispatch_event` manda un secreto de despacho propio
--
-- Hallazgo de seguridad: send-push recibía `{event_type, aggregate_id, payload}` sin autorización
-- propia y resolvía destinatarios con service role. El trigger le mandaba la CLAVE ANÓNIMA, que
-- viaja en los bundles web: cualquiera podía hacer POST con un event_type real y el UUID de un
-- pedido y mandar pushes falsos al cliente, al negocio o al motorizado.
--
-- Arreglo: el trigger añade la cabecera `x-push-dispatch-secret`, con un secreto que vive en
-- Supabase Vault (nombre `push_dispatch_secret`) y que send-push compara en tiempo constante
-- con su variable de entorno `PUSH_DISPATCH_SECRET`.
--
-- Por qué Vault y no `app_settings`: `as_admin_all` deja a todo admin autenticado leer cualquier
-- fila de app_settings (ya guarda la clave anónima, y un secreto ahí quedaría a un token robado de
-- distancia). `vault.secrets` / `vault.decrypted_secrets` no tienen grants ni schema usage para
-- anon ni authenticated (medido en la 0264). El valor NO va en esta migración: se crea a mano
-- (`select vault.create_secret('<valor>', 'push_dispatch_secret')`), igual que push_dispatch.
--
-- Compatibilidad: sin el secreto en el Vault el trigger sigue despachando como antes (sin la
-- cabecera); la función vieja ignora la cabecera. Orden de despliegue: Docs/operacion/deploy.md §2.2.
--
-- `dispatch_event` idéntica a la 0238 (misma firma, misma lista de eventos, mismo cuerpo, el tag lo
-- arma send-push) salvo la lectura del secreto y la cabecera nueva. Idempotente.

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
  v_secret text;
  v_headers jsonb;
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

  -- Secreto de despacho (Vault). Ausente = la función desplegada aún no lo exige: se despacha sin él.
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_dispatch_secret' limit 1;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_key
  );
  if v_secret is not null and v_secret <> '' then
    v_headers := v_headers || jsonb_build_object('x-push-dispatch-secret', v_secret);
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'event_type', new.event_type,
      'aggregate_id', new.aggregate_id,
      'payload', new.payload
    ),
    headers := v_headers
  );
  return new;
end;
$$;
revoke all on function public.dispatch_event() from public, anon, authenticated;
