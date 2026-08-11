-- Rollback de 0134_the_driver_finds_out.sql
--
-- Devuelve `dispatch_event` a la lista blanca de tres eventos, `TransferResolved`
-- del rechazo a su payload corto, y retira el cron de urgencia.
--
-- Aviso: revertir NO deshace los `urgent_since` ya sellados. Si se vuelve a
-- aplicar la 0134 después, esos pedidos no volverán a avisar (el sello es
-- justamente lo que impide el reaviso). Para limpiarlos:
--   update public.orders set urgent_since = null where urgent_since is not null;

create or replace function public.dispatch_event()
  returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_url text;
  v_key text;
begin
  if new.event_type not in ('OrderStatusChanged', 'OrderExpired', 'CashDelivered') then
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

create or replace function public.respond_order_transfer(
  p_request_id uuid,
  p_responder_user_id uuid,
  p_accept boolean
)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.order_transfer_requests;
  v_order public.orders;
  v_driver_id uuid;
  v_transferred boolean;
begin
  select id into v_driver_id from public.drivers where user_id = p_responder_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

  select o.* into v_order
    from public.orders o
    join public.order_transfer_requests r on r.order_id = o.id
    where r.id = p_request_id
    for update of o;
  if not found then raise exception 'Solicitud no existe' using errcode = 'P0002'; end if;

  select * into v_req from public.order_transfer_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'La solicitud ya fue resuelta' using errcode = 'P0001';
  end if;
  if v_req.from_driver_id <> v_driver_id then
    raise exception 'No eres el motorizado de este pedido' using errcode = 'P0001';
  end if;

  if v_order.driver_id is distinct from v_req.from_driver_id
     or v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
    update public.order_transfer_requests set status = 'invalidated', resolved_at = now() where id = p_request_id;
    return jsonb_build_object('id', p_request_id, 'status', 'invalidated', 'transferred', false);
  end if;

  if v_req.expires_at is not null and v_req.expires_at <= now() then
    v_transferred := public.apply_order_transfer(v_req, 'expired');
    return jsonb_build_object('id', p_request_id, 'status', 'expired', 'transferred', v_transferred);
  end if;

  if p_accept then
    v_transferred := public.apply_order_transfer(v_req, 'accepted');
    return jsonb_build_object('id', p_request_id, 'status', 'accepted', 'transferred', v_transferred);
  end if;

  update public.order_transfer_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_req.order_id, 'TransferResolved',
          jsonb_build_object('requestId', p_request_id, 'resolution', 'rejected'));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_req.order_id, 'order.transfer_rejected', 'driver', p_responder_user_id,
          jsonb_build_object('requestId', p_request_id));
  return jsonb_build_object('id', p_request_id, 'status', 'rejected', 'transferred', false);
end;
$$;

select cron.unschedule('flag-overdue-orders')
 where exists (select 1 from cron.job where jobname = 'flag-overdue-orders');

drop function if exists public.enqueue_overdue_orders();
