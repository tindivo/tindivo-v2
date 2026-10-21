-- ROLLBACK de la 0272 · vuelve al reclamo definitivo de la 0264 y quita los reintentos
--
-- Qué hace: apaga el cron `retry-push-dispatch`, restaura `claim_push_event` y `dispatch_event`
-- EXACTAMENTE como estaban en la 0264 (copiadas tal cual, con sus revokes y grants) y borra lo que
-- creó la 0272: `retry_push_dispatch`, `complete_push_event`, `push_retry_settings`,
-- `post_push_dispatch`, `push_event_types`, el índice `de_push_pending_idx` y la fila
-- `app_settings.push_retry`.
--
-- Qué NO hace: NO borra las columnas nuevas de `domain_events` (`push_attempts`,
-- `push_last_dispatch_at`, `push_done_at`, `push_dead_at`). Sin ellas no se podría auditar qué
-- pasó con los avisos mientras los reintentos estuvieron encendidos, y son inocuas (horas y un
-- contador, sin uso tras el rollback).
--
-- OJO: tras el rollback un evento reclamado vuelve a ser definitivo (un aviso que no salió se
-- pierde otra vez) y los `PushDeliveryFailed` ya escritos quedan en el outbox sin viajar
-- (`dispatch_event` de la 0264 no los despacha). Si `send-push` ya llama a `complete_push_event`,
-- desplegar antes su versión anterior: la nueva registra un error por llamada, sin otro efecto.

select cron.unschedule('retry-push-dispatch')
 where exists (select 1 from cron.job where jobname = 'retry-push-dispatch');

-- claim_push_event y dispatch_event, tal como en la 0264.
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

drop function if exists public.retry_push_dispatch();
drop function if exists public.complete_push_event(uuid);
drop function if exists public.push_retry_settings(boolean);
drop function if exists public.post_push_dispatch(uuid, text, uuid, jsonb);
drop function if exists public.push_event_types();
drop index if exists public.de_push_pending_idx;
delete from public.app_settings where key = 'push_retry';

do $check$
declare
  n int;
begin
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public'
                and p.proname in ('retry_push_dispatch', 'complete_push_event', 'push_retry_settings',
                                  'post_push_dispatch', 'push_event_types'))
     or exists (select 1 from cron.job where jobname = 'retry-push-dispatch')
     or exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'de_push_pending_idx')
     or exists (select 1 from public.app_settings where key = 'push_retry') then
    raise exception 'rollback 0272 abortado: quedan objetos de la 0272';
  end if;

  -- Una sola claim_push_event y una sola dispatch_event, la de la 0264.
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname in ('claim_push_event', 'dispatch_event');
  if n <> 2 then
    raise exception 'rollback 0272 abortado: se esperaban claim_push_event y dispatch_event (hay %)', n;
  end if;
  if (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = 'claim_push_event') ~ 'push_done_at|push_retry'
     or (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
          where s.nspname = 'public' and p.proname = 'dispatch_event') ~ 'push_event_types|post_push_dispatch' then
    raise exception 'rollback 0272 abortado: claim_push_event o dispatch_event conservan código de la 0272';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public' and p.proname = 'claim_push_event'
                and (has_function_privilege('anon', p.oid, 'execute')
                  or has_function_privilege('authenticated', p.oid, 'execute')
                  or not has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception 'rollback 0272 abortado: permisos de claim_push_event incorrectos';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public' and p.proname = 'dispatch_event'
                and (has_function_privilege('anon', p.oid, 'execute')
                  or has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception 'rollback 0272 abortado: anon o authenticated pueden ejecutar dispatch_event';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'domain_events' and t.tgname = 'trg_dispatch_event' and not t.tgisinternal) then
    raise exception 'rollback 0272 abortado: falta el trigger trg_dispatch_event';
  end if;
end
$check$;
