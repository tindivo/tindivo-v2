-- =============================================================================
-- ROLLBACK 0212 · vuelve la lista blanca de `dispatch_event` a la de la 0136
-- =============================================================================
--
-- Saca `OrderProofVerified` y `OrderValidated` del despacho. A partir de aqui
-- los dos vuelven a quedarse en el outbox y el cliente deja de enterarse de que
-- su comprobante fue aprobado o de que su pedido paso el antifraude.
--
-- La rama que los atiende en `send-push` puede quedarse: sin eventos que le
-- lleguen, es codigo inalcanzable, no un error.
-- =============================================================================

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
    'OrderQueued',
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
