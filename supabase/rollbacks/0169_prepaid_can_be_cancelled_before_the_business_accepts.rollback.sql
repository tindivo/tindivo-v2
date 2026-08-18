-- ROLLBACK de 0169 — el prepago vuelve a no cancelarse en NINGUN estado.
--
-- Devuelve `cancel_customer_order` a la definicion de 0046. Con esto, un cliente
-- con un prepago en `pending_acceptance` —donde todavia no ha pagado nada— vuelve
-- a quedarse sin forma de deshacerlo desde la app.
--
-- El front (`isCancellable`) tambien pregunta por el estado desde 0169: si se
-- revierte esto sin revertir el front, el boton de cancelar aparecera en prepago
-- y la RPC lo rechazara con un error. Revertir los dos o ninguno.

create or replace function public.cancel_customer_order(
  p_order_id uuid,
  p_customer_user_id uuid
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  if v_order.customer_user_id is null or v_order.customer_user_id <> p_customer_user_id then
    raise exception 'No autorizado para cancelar este pedido' using errcode = 'P0001';
  end if;
  -- Ventana de cancelación: solo mientras el restaurante aún no acepta (DECISIONS §estados).
  if v_order.status not in ('validando', 'pending_acceptance') then
    raise exception 'Tu pedido ya fue aceptado por el restaurante y no puede cancelarse' using errcode = 'P0001';
  end if;
  -- Prepago: no se autocancela desde la app (#1).
  if v_order.payment_intent = 'prepaid' then
    raise exception 'Los pedidos pagados por adelantado no se cancelan desde la app; escríbenos por soporte'
      using errcode = 'P0001';
  end if;

  update public.orders
    set status = 'cancelled', cancel_reason = 'customer_cancelled', cancelled_by = p_customer_user_id
    where id = p_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderStatusChanged',
    jsonb_build_object('action', 'cancel', 'status', 'cancelled', 'reason', 'customer_cancelled'));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.cancel', 'cliente', p_customer_user_id,
    jsonb_build_object('reason', 'customer_cancelled'));

  return jsonb_build_object('id', p_order_id, 'status', 'cancelled', 'cancelReason', 'customer_cancelled');
end;
$$;

-- Endurecimiento: solo service_role puede ejecutar la cancelación (la API valida el rol).
revoke all on function public.cancel_customer_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_customer_order(uuid, uuid) to service_role;
