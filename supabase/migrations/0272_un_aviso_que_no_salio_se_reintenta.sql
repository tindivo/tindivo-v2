-- ============================================================================
-- 0272 — Un aviso que no salió se reintenta (MV7c, primer lote)
-- ============================================================================
--
-- Hasta la 0271 un aviso se perdía entero, sin que nadie se enterara, si la llamada
-- `net.http_post` del trigger fallaba, si `send-push` arrancaba mal o si caía después de
-- reclamar el evento (el reclamo de la 0264 era definitivo). Esta migración:
--
-- 1. Da al reclamo un plazo (`leaseSeconds`): un evento reclamado que no terminó en ese
--    plazo se puede volver a reclamar. `send-push` marca el final con `complete_push_event`.
-- 2. Añade un cron por minuto (`retry_push_dispatch`) que vuelve a llamar a `send-push`
--    por los eventos que nadie reclamó o que no terminaron: hasta `maxAttempts` veces, con
--    las esperas de `backoffMinutes`, y nunca pasados `ttlMinutes` desde el evento.
-- 3. Un evento que agota los intentos (o el plazo) queda marcado (`push_dead_at`) y el cron
--    escribe UN evento `PushDeliveryFailed` por corrida (`record_push_undelivered`;
--    payload: `count` y `eventTypes`, tipos separados por comas), que viaja como cualquier otro
--    aviso: `send-push` lo manda al admin con texto fijo. El freno está aquí, en quien lo
--    produce: como mucho uno cada `alertWindowMinutes` (30). Así la base no necesita el
--    secreto de `OpsAlert`, y un `send-push` que cae no gasta un turno que nadie usa.
--    Dos corridas del cron no se solapan (candado consultivo de transacción).
--
-- Decisiones de Jesús (2026-10-20): solo el aviso entero en este lote (el reintento por
-- destinatario, después y si la bitácora lo justifica); 3 reintentos y 15 minutos; alerta
-- al admin con freno; y, ante un fallo al marcar el final, mejor un aviso duplicado que
-- uno perdido («al menos una vez»: `send-push` reintenta la marca antes de rendirse).
--
-- Por qué columnas nuevas y no `published_at`/`retry_count`: el cron de la 0007 borra los
-- `domain_events` de más de 90 días con `published_at` escrito. Hoy nadie lo escribe, así
-- que no borra nada; escribirlo activaría esa purga, y eso no está decidido.
--
-- DESPLIEGUE: los reintentos nacen APAGADOS. `push_retry` no trae `since`, y sin un `since`
-- válido el cron no hace nada (fallo cerrado, como `push_claim_since` en la 0264). Orden:
-- `db push` → deploy de `send-push` (la que llama a `complete_push_event`) → poner
-- `push_retry.since` a la hora de ese deploy. Si se encendiera antes, la función vieja
-- reclamaría sin marcar el final y el cron repetiría avisos ya entregados.
--
-- Sin datos personales nuevos: las columnas son horas y contadores; `PushDeliveryFailed`
-- lleva solo cuántos eventos y de qué tipos. Idempotente.
-- ============================================================================

-- `domain_events` es el outbox en caliente: si no se consigue el bloqueo en 5 s, la migración
-- falla en vez de dejar en cola las escrituras de los pedidos. Sin transacción no tiene efecto.
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.domain_events
  add column if not exists push_attempts int not null default 0,
  add column if not exists push_last_dispatch_at timestamptz,
  add column if not exists push_done_at timestamptz,
  add column if not exists push_dead_at timestamptz;

comment on column public.domain_events.push_attempts is
  'Reintentos de envío hechos por retry_push_dispatch (el disparo del trigger no cuenta).';
comment on column public.domain_events.push_last_dispatch_at is
  'Último reintento de retry_push_dispatch; nulo si solo hubo el disparo del trigger (occurred_at).';
comment on column public.domain_events.push_done_at is
  'Cuándo send-push terminó de procesar el evento (complete_push_event). No implica que cada destinatario lo recibiera.';
comment on column public.domain_events.push_dead_at is
  'Cuándo retry_push_dispatch dio el aviso por perdido (sin intentos o fuera de plazo).';

-- Solo los eventos sin terminar ni perder: el cron los busca por hora.
create index if not exists de_push_pending_idx on public.domain_events (occurred_at)
  where push_done_at is null and push_dead_at is null;

insert into public.app_settings (key, value)
values (
  'push_retry',
  '{"maxAttempts": 3, "ttlMinutes": 15, "leaseSeconds": 180, "backoffMinutes": [1, 2, 4], "alertWindowMinutes": 30}'::jsonb
)
on conflict (key) do nothing;

-- ── Lista única de eventos que avisan a una persona ─────────────────────────
-- La usan el trigger y el cron. Misma lista que la 0264 más `PushDeliveryFailed`.
create or replace function public.push_event_types()
  returns text[]
  language sql immutable set search_path = ''
as $$
  select array[
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
    'CourierStepped',       -- Tindivo Entregas (motorizados y cliente)
    'PushDeliveryFailed'    -- avisos que se dieron por perdidos (admin), 0272
  ]::text[];
$$;
revoke all on function public.push_event_types() from public, anon, authenticated, service_role;

-- ── La llamada a send-push, en un solo sitio ────────────────────────────────
-- Devuelve false si el push no está configurado (dev): entonces no llama a nadie.
create or replace function public.post_push_dispatch(
  p_event_id uuid, p_event_type text, p_aggregate_id uuid, p_payload jsonb
)
  returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  select value into v_cfg from public.app_settings where key = 'push_dispatch';
  v_url := v_cfg ->> 'url';
  v_key := v_cfg ->> 'anonKey';
  if v_url is null then
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object(
      'event_id', p_event_id,
      'event_type', p_event_type,
      'aggregate_id', p_aggregate_id,
      'payload', p_payload
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );
  return true;
end;
$$;
revoke all on function public.post_push_dispatch(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;

-- El trigger hace lo mismo que en la 0264 (lista, config, cuerpo y cabeceras), ahora
-- con la lista y la llamada compartidas.
create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if new.event_type <> all (public.push_event_types()) then
    return new; -- auditoría: se queda en el outbox y no viaja
  end if;
  perform public.post_push_dispatch(new.id, new.event_type, new.aggregate_id, new.payload);
  return new;
end;
$$;
revoke all on function public.dispatch_event() from public, anon, authenticated;

-- ── Configuración de los reintentos ─────────────────────────────────────────
-- Lee `push_retry`. `p_require_since`: el cron exige `since` (si falta, no reintenta);
-- el reclamo no lo necesita y usa los valores por defecto si algo no es válido.
create or replace function public.push_retry_settings(
  p_require_since boolean,
  out ok boolean,
  out since timestamptz,
  out max_attempts int,
  out ttl interval,
  out lease interval,
  out backoff int[],
  out alert_window interval
)
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_raw jsonb;
begin
  ok := false;
  max_attempts := 3;
  ttl := interval '15 minutes';
  lease := interval '180 seconds';
  backoff := array[1, 2, 4];
  alert_window := interval '30 minutes';

  select s.value into v_raw from public.app_settings as s where s.key = 'push_retry';
  if v_raw is null or jsonb_typeof(v_raw) <> 'object' then
    return;
  end if;

  -- Cada valor se toma solo si tiene la forma y el rango esperados; si no, se queda el
  -- valor por defecto. Rangos: 0-10 intentos, 1-60 min de vida, 30-900 s de plazo, esperas
  -- de 1-60 min, 1-1440 min entre alertas. La forma (1 a 4 dígitos) se comprueba ANTES de
  -- convertir a int: un número enorme no desborda, se ignora.
  if jsonb_typeof(v_raw -> 'maxAttempts') = 'number'
     and (v_raw ->> 'maxAttempts') ~ '^[0-9]{1,4}$'
     and (v_raw ->> 'maxAttempts')::int between 0 and 10 then
    max_attempts := (v_raw ->> 'maxAttempts')::int;
  end if;
  if jsonb_typeof(v_raw -> 'ttlMinutes') = 'number'
     and (v_raw ->> 'ttlMinutes') ~ '^[0-9]{1,4}$'
     and (v_raw ->> 'ttlMinutes')::int between 1 and 60 then
    ttl := make_interval(mins => (v_raw ->> 'ttlMinutes')::int);
  end if;
  if jsonb_typeof(v_raw -> 'leaseSeconds') = 'number'
     and (v_raw ->> 'leaseSeconds') ~ '^[0-9]{1,4}$'
     and (v_raw ->> 'leaseSeconds')::int between 30 and 900 then
    lease := make_interval(secs => (v_raw ->> 'leaseSeconds')::int);
  end if;
  if jsonb_typeof(v_raw -> 'backoffMinutes') = 'array'
     and jsonb_array_length(v_raw -> 'backoffMinutes') between 1 and 10
     and not exists (
       select 1 from jsonb_array_elements(v_raw -> 'backoffMinutes') as b(v)
        where jsonb_typeof(b.v) <> 'number' or (b.v #>> '{}') !~ '^[0-9]{1,4}$'
           or (b.v #>> '{}')::int not between 1 and 60
     ) then
    select array_agg((b.v #>> '{}')::int order by b.n) into backoff
      from jsonb_array_elements(v_raw -> 'backoffMinutes') with ordinality as b(v, n);
  end if;
  if jsonb_typeof(v_raw -> 'alertWindowMinutes') = 'number'
     and (v_raw ->> 'alertWindowMinutes') ~ '^[0-9]{1,4}$'
     and (v_raw ->> 'alertWindowMinutes')::int between 1 and 1440 then
    alert_window := make_interval(mins => (v_raw ->> 'alertWindowMinutes')::int);
  end if;

  if not p_require_since then
    ok := true;
    return;
  end if;

  -- `since`: misma forma que `push_claim_since` (0264). Sin él, el cron no hace nada.
  if jsonb_typeof(v_raw -> 'since') <> 'string'
     or (v_raw ->> 'since') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then
    return;
  end if;
  begin
    since := (v_raw ->> 'since')::timestamptz;
  exception when others then
    return;
  end;
  if since is null or not isfinite(since) then
    return;
  end if;
  ok := true;
end;
$$;
revoke all on function public.push_retry_settings(boolean) from public, anon, authenticated, service_role;

-- ── El reclamo, ahora con plazo ─────────────────────────────────────────────
-- Igual que la 0264 (corte `push_claim_since` con fallo cerrado, ventana de vida) más:
-- un evento terminado o perdido no se reclama, y uno reclamado se puede volver a reclamar
-- cuando pasa `lease` sin terminar. El UPDATE bloquea la fila: de dos reclamos a la vez,
-- el segundo vuelve a evaluar el WHERE con la hora nueva y no casa.
create or replace function public.claim_push_event(p_event_id uuid)
  returns table (event_type text, aggregate_id uuid, payload jsonb)
  language plpgsql security definer set search_path = ''
as $$
declare
  v_raw jsonb;
  v_since timestamptz;
  v_cfg record;
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

  select * into v_cfg from public.push_retry_settings(false);

  return query
    update public.domain_events as e
       set push_claimed_at = now()
     where e.id = p_event_id
       and e.push_done_at is null
       and e.push_dead_at is null
       and (e.push_claimed_at is null or e.push_claimed_at < now() - v_cfg.lease)
       and e.occurred_at >= v_since
       and e.occurred_at > now() - v_cfg.ttl
    returning e.event_type, e.aggregate_id, e.payload;
end;
$$;
revoke all on function public.claim_push_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_push_event(uuid) to service_role;

-- ── send-push marca el final ────────────────────────────────────────────────
-- Solo un evento reclamado y sin terminar. Devuelve true si lo marcó.
create or replace function public.complete_push_event(p_event_id uuid)
  returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  n int;
begin
  update public.domain_events as e
     set push_done_at = now()
   where e.id = p_event_id
     and e.push_claimed_at is not null
     and e.push_done_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
revoke all on function public.complete_push_event(uuid) from public, anon, authenticated;
grant execute on function public.complete_push_event(uuid) to service_role;

-- ── El aviso de fallo, en una función aparte ────────────────────────────────
-- Sin bucles y con parámetros escalares, para que el inventario de productores del borrado
-- de cuenta (account-deletion-coverage) pueda leer qué guarda: solo cuántos y de qué tipos.
create or replace function public.record_push_undelivered(
  p_first_event_id uuid, p_count int, p_event_types text
)
  returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values (
    'push_outbox', p_first_event_id, 'PushDeliveryFailed',
    jsonb_build_object('count', p_count, 'eventTypes', p_event_types)
  );
end;
$$;
revoke all on function public.record_push_undelivered(uuid, int, text) from public, anon, authenticated, service_role;

-- ── El cron: reintenta lo pendiente y da por perdido lo que no salió ─────────
-- Devuelve cuántos eventos reintentó. Sin `since` válido o sin push configurado, 0.
create or replace function public.retry_push_dispatch()
  returns int
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg record;
  v_types text[] := public.push_event_types();
  v_ev record;
  v_retried int := 0;
  v_dead_n int;
  v_dead_first uuid;
  v_dead_types text;
begin
  select * into v_cfg from public.push_retry_settings(true);
  if not v_cfg.ok then
    return 0;
  end if;
  -- Una corrida a la vez: si otra tiene el candado (hasta su commit), esta no hace nada.
  if not pg_try_advisory_xact_lock(hashtext('tindivo.retry_push_dispatch')) then
    return 0;
  end if;
  if not exists (
    select 1 from public.app_settings
     where key = 'push_dispatch' and value ->> 'url' is not null
  ) then
    return 0; -- push no configurado (dev)
  end if;

  -- 1. Perdidos: fuera de plazo, o sin intentos y con el último ya vencido.
  with dead as (
    update public.domain_events as e
       set push_dead_at = now()
     where e.push_done_at is null
       and e.push_dead_at is null
       and e.event_type = any (v_types)
       and e.occurred_at >= v_cfg.since
       and (e.push_claimed_at is null or e.push_claimed_at < now() - v_cfg.lease)
       and (
         e.occurred_at <= now() - v_cfg.ttl
         or (e.push_attempts >= v_cfg.max_attempts
             and coalesce(e.push_last_dispatch_at, e.occurred_at) < now() - v_cfg.lease)
       )
    returning e.id, e.event_type, e.occurred_at
  )
  select count(*)::int,
         (array_agg(d.id order by d.occurred_at))[1],
         string_agg(distinct d.event_type, ',' order by d.event_type)
    into v_dead_n, v_dead_first, v_dead_types
    from dead as d
   where d.event_type <> 'PushDeliveryFailed'; -- un aviso de fallo perdido no genera otro

  -- Freno: como mucho un aviso de fallo por ventana. Los perdidos quedan marcados igual.
  if v_dead_n > 0 and not exists (
    select 1 from public.domain_events as f
     where f.event_type = 'PushDeliveryFailed'
       and f.occurred_at > now() - v_cfg.alert_window
  ) then
    perform public.record_push_undelivered(v_dead_first, v_dead_n, v_dead_types);
  end if;

  -- 2. Reintentos: nadie lo reclamó, o lo reclamó y no terminó en el plazo; y ya pasó la
  --    espera que toca a este intento. `skip locked`: dos corridas no toman el mismo.
  for v_ev in
    select e.id, e.event_type, e.aggregate_id, e.payload
      from public.domain_events as e
     where e.push_done_at is null
       and e.push_dead_at is null
       and e.event_type = any (v_types)
       and e.occurred_at >= v_cfg.since
       and e.occurred_at > now() - v_cfg.ttl
       and e.push_attempts < v_cfg.max_attempts
       and (e.push_claimed_at is null or e.push_claimed_at < now() - v_cfg.lease)
       and coalesce(e.push_last_dispatch_at, e.occurred_at)
             <= now() - make_interval(mins => v_cfg.backoff[
                  least(e.push_attempts + 1, array_length(v_cfg.backoff, 1))])
     order by e.occurred_at
     limit 50
     for update of e skip locked
  loop
    update public.domain_events
       set push_attempts = push_attempts + 1,
           push_last_dispatch_at = now()
     where id = v_ev.id;
    perform public.post_push_dispatch(v_ev.id, v_ev.event_type, v_ev.aggregate_id, v_ev.payload);
    v_retried := v_retried + 1;
  end loop;

  return v_retried;
end;
$$;
revoke all on function public.retry_push_dispatch() from public, anon, authenticated, service_role;

select cron.schedule('retry-push-dispatch', '* * * * *', $cron$
  select public.retry_push_dispatch();
$cron$);

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  v_fn      text;
  n         int;
  v_secdef  boolean;
  v_cfg     text[];
begin
  foreach v_fn in array array[
    'push_event_types', 'post_push_dispatch', 'dispatch_event', 'push_retry_settings',
    'claim_push_event', 'complete_push_event', 'record_push_undelivered', 'retry_push_dispatch'
  ] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_fn;
    if n <> 1 then
      raise exception '0272: se esperaba UNA sola % y hay %', v_fn, n;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_fn;
    if v_fn <> 'push_event_types' and not v_secdef then
      raise exception '0272: % no es SECURITY DEFINER', v_fn;
    end if;
    if v_cfg is distinct from array['search_path=""'] then
      raise exception '0272: % no quedó con search_path vacío (%)', v_fn, v_cfg;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_fn
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
    ) then
      raise exception '0272: anon o authenticated pueden ejecutar %', v_fn;
    end if;
  end loop;

  foreach v_fn in array array['claim_push_event', 'complete_push_event'] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_fn
         and has_function_privilege('service_role', p.oid, 'execute')
    ) then
      raise exception '0272: service_role no puede ejecutar %', v_fn;
    end if;
  end loop;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'domain_events'
     and column_name in ('push_attempts', 'push_last_dispatch_at', 'push_done_at', 'push_dead_at');
  if n <> 4 then
    raise exception '0272: faltan columnas de reintento en domain_events (%/4)', n;
  end if;
  if not exists (select 1 from public.app_settings where key = 'push_retry') then
    raise exception '0272: falta app_settings.push_retry';
  end if;
  if not exists (select 1 from cron.job where jobname = 'retry-push-dispatch') then
    raise exception '0272: falta el job retry-push-dispatch';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'domain_events' and t.tgname = 'trg_dispatch_event' and not t.tgisinternal
  ) then
    raise exception '0272: falta el trigger trg_dispatch_event';
  end if;
end
$check$;
