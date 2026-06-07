-- =============================================================================
-- 0032 · Pedido manual: nombre y teléfono del cliente OPCIONALES.
-- Reordena la firma de create_business_manual_order para que los parámetros con
-- DEFAULT (incl. nombre/teléfono) vayan después de los obligatorios (regla de
-- Postgres). El cuerpo es idéntico al de 0031. Idempotente.
-- =============================================================================

drop function if exists public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, text, text, numeric, int,
  text, text, text, numeric, numeric, numeric);

create function public.create_business_manual_order(
  p_business_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_order_amount numeric,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_prep_time_minutes int default 20,
  p_delivery_reference text default null,
  p_notes text default null,
  p_client_pays_with numeric default null,
  p_yape_amount numeric default null,
  p_cash_amount numeric default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
begin
  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;
  if v_business.is_blocked then raise exception 'Tu cuenta está suspendida' using errcode = 'P0001'; end if;
  if not v_business.is_active then raise exception 'Negocio inactivo' using errcode = 'P0001'; end if;
  if coalesce(p_order_amount, 0) <= 0 then raise exception 'Monto inválido' using errcode = 'P0001'; end if;

  v_prep := greatest(1, coalesce(p_prep_time_minutes, 20));

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
  else
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  end if;

  v_cash_part := case
    when p_payment_intent = 'pending_cash' then p_order_amount
    when p_payment_intent = 'pending_mixed' then coalesce(p_cash_amount, 0)
    else 0 end;
  v_change := case
    when p_client_pays_with is not null and v_cash_part > 0
      then greatest(0, round(p_client_pays_with - v_cash_part, 2))
    else null end;

  insert into public.orders (
    business_id, customer_user_id, source, is_manual, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, business_notes,
    prep_time_minutes, confirmed_at, preparing_at, estimated_ready_at,
    appears_in_queue_at, client_pays_with, change_to_give, yape_amount, cash_amount
  ) values (
    v_business.id, null, 'business_manual', true, p_delivery_method, p_payment_intent,
    nullif(p_customer_name, ''), nullif(p_customer_phone, ''), null, p_delivery_reference,
    p_order_amount, v_delivery_fee, 'preparing', p_notes,
    v_prep, now(), now(), now() + make_interval(mins => v_prep),
    now() + make_interval(mins => greatest(0, v_prep - 10)),
    p_client_pays_with, v_change,
    case when p_payment_intent = 'pending_mixed' then p_yape_amount else null end,
    case when p_payment_intent in ('pending_cash', 'pending_mixed') then v_cash_part else null end
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  insert into public.customer_order_items (
    order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
    quantity, unit_price, line_total, note
  ) values (
    v_order_id, null, 'Pedido por teléfono', p_order_amount, 1, p_order_amount, p_order_amount, p_notes
  );

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id, 'manual', true,
    'orderAmount', p_order_amount, 'deliveryMethod', p_delivery_method, 'status', 'preparing'));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'business', p_business_user_id,
    jsonb_build_object('manual', true, 'prepMinutes', v_prep));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', 'preparing', 'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'total', p_order_amount + v_delivery_fee);
end;
$$;

revoke execute on function public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric) to service_role;
