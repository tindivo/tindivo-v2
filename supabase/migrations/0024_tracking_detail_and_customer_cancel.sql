-- 0024_tracking_detail_and_customer_cancel.sql
-- Fase C (cierre visual del tracking):
--   1) get_tracking ahora expone paymentIntent, cancelReason, total e items (para el
--      detalle y la pantalla de cancelado con copy según motivo). Sigue siendo público
--      por short_id, ventana 24h. CREATE OR REPLACE preserva los grants (anon).
--   2) cancel_customer_order: el cliente cancela su propio pedido SOLO antes de la
--      aceptación (`validando`/`pending_acceptance`). Aislado del advance_order de staff.
-- Idempotente.

create or replace function public.get_tracking(p_short_id text)
  returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'shortId', o.short_id, 'orderNumber', o.order_number, 'businessName', b.name,
    'businessAccentColor', b.accent_color, 'status', o.status, 'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent, 'cancelReason', o.cancel_reason,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object('name', i.item_name_snapshot, 'qty', i.quantity, 'lineTotal', i.line_total)
        order by i.created_at
      )
      from public.customer_order_items i where i.order_id = o.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.orders o
  join public.businesses b on b.id = o.business_id
  left join public.drivers d on d.id = o.driver_id
  where o.short_id = p_short_id
    and (o.delivered_at is null or o.delivered_at > now() - interval '24 hours');
  return v_result;
end;
$$;

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
