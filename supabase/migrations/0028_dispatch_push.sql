-- 0028_dispatch_push.sql
-- Fase G: el outbox dispara push. Trigger AFTER INSERT en domain_events que llama
-- al Edge Function send-push vía pg_net. Solo eventos accionables (doc 11 §7.2 ignora
-- OrderCreated y demás de auditoría). La URL + anon key se leen de app_settings.push_dispatch
-- (insertado fuera de migración para no commitear llaves). Idempotente.

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  -- Eventos que NO disparan push (solo auditoría/analytics).
  if new.event_type not in ('OrderStatusChanged', 'OrderExpired', 'CashDelivered') then
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

drop trigger if exists trg_dispatch_event on public.domain_events;
create trigger trg_dispatch_event
  after insert on public.domain_events
  for each row execute function public.dispatch_event();

-- La función de trigger no debe ser invocable vía REST API (el trigger la ejecuta como owner).
revoke all on function public.dispatch_event() from public, anon, authenticated;
