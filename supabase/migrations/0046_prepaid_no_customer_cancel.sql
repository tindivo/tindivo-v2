-- 0046_prepaid_no_customer_cancel.sql
-- #1 (defensa en profundidad): los pedidos PREPAGADOS no se cancelan desde la app del
-- cliente. La UI ya oculta el botón, pero el RPC también lo rechaza para que un POST
-- directo a la API no pueda autocancelar un pedido ya pagado (la devolución de un prepago
-- se resuelve por soporte/admin, no con autocancelación libre).
-- Instrucción explícita del usuario; reemplaza el supuesto de "cancelación libre si
-- prepago" de DECISIONS §5. CREATE OR REPLACE preserva los grants; se re-aplican igual.
-- Idempotente.

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
