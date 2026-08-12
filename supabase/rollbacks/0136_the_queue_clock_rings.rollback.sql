-- Rollback de 0136_the_queue_clock_rings.sql
--
-- Retira el cron de la cola, la función que emite `OrderQueued` y la entrada de
-- ese evento en la lista blanca de `dispatch_event`. Deja `dispatch_event`
-- exactamente como la dejó la 0134.
--
-- Aviso: NO se borra la columna `queue_notified_at` ni sus sellos. Borrarla
-- perdería el dato y la re-aplicación de la 0136 volvería a anunciar pedidos ya
-- anunciados. Si de verdad quieres empezar de cero:
--   alter table public.orders drop column if exists queue_notified_at;
--
-- El aviso de pedido nuevo a la cajera vive solo en send-push, así que revertir
-- esta migración no lo toca: para quitarlo hay que desplegar la Edge Function
-- anterior.

select cron.unschedule('announce-queued-orders')
 where exists (select 1 from cron.job where jobname = 'announce-queued-orders');

drop function if exists public.enqueue_queued_orders();

drop index if exists public.orders_queue_pending_idx;

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  if new.event_type not in (
    'OrderStatusChanged',
    'OrderExpired',
    'OrderCreated',
    'OrderReleased',
    'OrderOverdue',
    'TransferRequested',
    'TransferResolved',
    'CashDelivered',
    'CashConfirmed',
    'CashDisputed',
    'CashResolved'
  ) then
    return new;
  end if;

  select value into v_cfg from public.app_settings where key = 'push_dispatch';
  v_url := v_cfg ->> 'url';
  v_key := v_cfg ->> 'anonKey';
  if v_url is null then
    return new;
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

revoke all on function public.dispatch_event() from public, anon, authenticated;
