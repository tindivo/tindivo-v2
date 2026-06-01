-- =============================================================================
-- 0011 · RPC de creación de pedido del cliente (atómica + transaccional)
-- El pedido, sus ítems (con snapshots), el evento de outbox y la auditoría se
-- escriben en UNA sola transacción (DECISIONS §11). El short_id lo genera el
-- trigger orders_before_write. Enforce server-side del umbral de prepago.
-- Solo service_role la ejecuta (apps/api con la identidad del cliente validada).
-- Params opcionales con DEFAULT al final (regla SQL: los defaults van al final).
-- Idempotente (drop del signature previo + create).
-- =============================================================================

-- Quitar cualquier versión previa (firma con params requeridos).
drop function if exists public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, text, text,
  numeric, numeric, jsonb, public.order_source
);
drop function if exists public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source
);

create or replace function public.create_customer_order(
  p_customer_user_id uuid,
  p_business_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_reference text default null,
  p_delivery_lat numeric default null,
  p_delivery_lng numeric default null,
  p_source public.order_source default 'customer_pwa'
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
  v_menu_item public.menu_items;
  v_item jsonb;
  v_qty int;
  v_line_total numeric;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_order_amount numeric := 0;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_threshold numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then
    raise exception 'Negocio no existe' using errcode = 'P0002';
  end if;
  if not (v_business.is_active and not v_business.is_blocked and v_business.publishes_catalog) then
    raise exception 'Negocio no disponible' using errcode = 'P0001';
  end if;

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
  else
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    order_amount, delivery_fee, status
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    0, v_delivery_fee, 'pending_acceptance'
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then
      raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001';
    end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));
    v_line_total := round(v_menu_item.base_price * v_qty, 2);
    v_order_amount := v_order_amount + v_line_total;
    insert into public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.base_price,
      v_qty, v_menu_item.base_price, v_line_total, nullif(v_item ->> 'note', '')
    );
  end loop;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  if v_order_amount >= coalesce(v_threshold, 100) and p_payment_intent <> 'prepaid' then
    raise exception 'Los pedidos de S/% a mas se pagan por adelantado (Yape/Plin)', coalesce(v_threshold, 100)
      using errcode = 'P0001';
  end if;

  update public.orders set order_amount = v_order_amount where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'cliente', p_customer_user_id,
    jsonb_build_object('itemCount', jsonb_array_length(p_items)));

  return jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'pending_acceptance',
    'orderAmount', v_order_amount,
    'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee
  );
end;
$$;

revoke execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source
) from public, anon, authenticated;
grant execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source
) to service_role;
