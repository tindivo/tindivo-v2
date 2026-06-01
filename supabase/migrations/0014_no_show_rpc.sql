-- =============================================================================
-- 0014 · No-show + guard de contraentrega bloqueada (usa el enum/helper de 0013)
-- advance_order gana la acción 'no_show' (cancela + registra strike anclado a
-- número/dirección + refleja el bloqueo, todo atómico con outbox/auditoría).
-- create_customer_order rechaza pago-contra-entrega si el número/dirección ya
-- está bloqueado por strikes (Documento Maestro §4). Mismas firmas => conserva
-- los grants existentes.
-- =============================================================================

create or replace function public.advance_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_action text,
  p_params jsonb default '{}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_business public.businesses;
  v_driver_id uuid;
  v_new_status public.order_status;
  v_band public.distance_band;
  v_commission numeric;
  v_commissions jsonb;
  v_prep int;
  v_blocked boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;

  select * into v_business from public.businesses where id = v_order.business_id;

  -- Resolución/propiedad del actor.
  if p_actor_role = 'business' then
    if v_business.user_id <> p_actor_user_id then
      raise exception 'No autorizado sobre este pedido' using errcode = 'P0001';
    end if;
  elsif p_actor_role = 'driver' then
    select id into v_driver_id from public.drivers where user_id = p_actor_user_id;
    if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;
  end if;

  case p_action
    when 'accept' then
      if p_actor_role <> 'business' then raise exception 'Acción solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'pending_acceptance' then raise exception 'El pedido no esta pendiente de aceptacion' using errcode = 'P0001'; end if;
      v_new_status := 'confirmed';
    when 'preparing' then
      if p_actor_role <> 'business' then raise exception 'Accion solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'confirmed' then raise exception 'El pedido no esta confirmado' using errcode = 'P0001'; end if;
      v_prep := greatest(1, coalesce((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';
    when 'ready' then
      if p_actor_role <> 'business' then raise exception 'Accion solo del negocio' using errcode = 'P0001'; end if;
      if v_order.status <> 'preparing' then raise exception 'El pedido no esta en preparacion' using errcode = 'P0001'; end if;
      v_new_status := 'waiting_driver';
    when 'take' then
      if p_actor_role <> 'driver' then raise exception 'Accion solo del motorizado' using errcode = 'P0001'; end if;
      if v_order.status not in ('preparing', 'waiting_driver') then raise exception 'El pedido no esta disponible para tomar' using errcode = 'P0001'; end if;
      if v_order.driver_id is not null and v_order.driver_id <> v_driver_id then raise exception 'El pedido ya tiene motorizado' using errcode = 'P0001'; end if;
      v_new_status := 'heading_to_restaurant';
    when 'arrived' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'heading_to_restaurant' then raise exception 'El motorizado no va al local' using errcode = 'P0001'; end if;
      v_new_status := 'waiting_at_restaurant';
    when 'pickup' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'waiting_at_restaurant' then raise exception 'El pedido no esta listo para recoger' using errcode = 'P0001'; end if;
      v_band := (p_params ->> 'band')::public.distance_band;
      if v_order.delivery_method = 'delivery' and v_band is null then
        raise exception 'Declara la banda (cerca/lejos)' using errcode = 'P0001';
      end if;
      v_new_status := 'picked_up';
    when 'deliver' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'picked_up' then raise exception 'El pedido no esta recogido' using errcode = 'P0001'; end if;
      v_new_status := 'delivered';
    when 'no_show' then
      if p_actor_role <> 'driver' or v_order.driver_id <> v_driver_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
      if v_order.status <> 'picked_up' then raise exception 'Solo se reporta no-show con el pedido en reparto' using errcode = 'P0001'; end if;
      v_new_status := 'cancelled';
    when 'cancel' then
      if p_actor_role not in ('business', 'admin') then raise exception 'No autorizado para cancelar' using errcode = 'P0001'; end if;
      if v_order.status in ('delivered', 'cancelled') then raise exception 'El pedido ya esta cerrado' using errcode = 'P0001'; end if;
      v_new_status := 'cancelled';
    else
      raise exception 'Accion desconocida: %', p_action using errcode = 'P0001';
  end case;

  -- Efectos por acción.
  if p_action = 'take' then
    update public.orders set status = v_new_status, driver_id = v_driver_id where id = p_order_id;
  elsif p_action = 'preparing' then
    update public.orders
      set status = v_new_status, prep_time_minutes = v_prep,
          estimated_ready_at = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - 10) || ' minutes')::interval
      where id = p_order_id;
  elsif p_action = 'pickup' then
    select value into v_commissions from public.app_settings where key = 'commissions';
    if v_order.delivery_method = 'pickup' then
      v_commission := coalesce(v_business.commission_override_pickup, (v_commissions ->> 'pickup')::numeric, 0.50);
    elsif v_band = 'near' then
      v_commission := coalesce(v_business.commission_override_near, (v_commissions ->> 'near')::numeric, 3.00);
    else
      v_commission := coalesce(v_business.commission_override_far, (v_commissions ->> 'far')::numeric, 3.50);
    end if;
    update public.orders
      set status = v_new_status, delivery_distance_band = v_band, tindivo_commission = v_commission
      where id = p_order_id;
  elsif p_action = 'deliver' then
    update public.orders
      set status = v_new_status,
          payment_real = coalesce((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
      where id = p_order_id;
  elsif p_action = 'no_show' then
    update public.orders
      set status = v_new_status, cancel_reason = 'no_show', cancelled_by = p_actor_user_id
      where id = p_order_id;
    -- Strike anclado a número + dirección (atómico con la cancelación).
    insert into public.customer_strikes (
      customer_user_id, phone, delivery_reference,
      delivery_coordinates_lat, delivery_coordinates_lng, order_id, reason, reported_by
    ) values (
      v_order.customer_user_id, v_order.customer_phone, v_order.delivery_reference,
      v_order.delivery_coordinates_lat, v_order.delivery_coordinates_lng, p_order_id, 'no_show', p_actor_user_id
    );
    v_blocked := public.customer_contraentrega_blocked(v_order.customer_phone, v_order.delivery_reference);
    -- Si supera el umbral, refleja el bloqueo en el perfil registrado (si existe).
    if v_blocked and v_order.customer_user_id is not null then
      update public.customer_profiles
        set contraentrega_blocked = true,
            strikes = (select count(*) from public.customer_strikes where phone = v_order.customer_phone)
        where user_id = v_order.customer_user_id;
    end if;
    -- Evento específico para la bandeja del admin (§5).
    insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    values ('order', p_order_id, 'CustomerNoShow', jsonb_build_object(
      'phone', v_order.customer_phone, 'reference', v_order.delivery_reference, 'blocked', v_blocked
    ));
  elsif p_action = 'cancel' then
    update public.orders
      set status = v_new_status,
          cancel_reason = coalesce((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled'),
          cancelled_by = p_actor_user_id
      where id = p_order_id;
  else
    update public.orders set status = v_new_status where id = p_order_id;
  end if;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);

  return (
    select jsonb_build_object(
      'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
      'band', delivery_distance_band, 'tindivoCommission', tindivo_commission,
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes,
      'cancelReason', cancel_reason
    ) from public.orders where id = p_order_id
  );
end;
$$;

revoke execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) from public, anon, authenticated;
grant execute on function public.advance_order(uuid, uuid, public.user_role, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- create_customer_order: guard de contraentrega bloqueada.
-- ---------------------------------------------------------------------------
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

  -- Anti-fraude (Maestro §4): número/dirección con strikes -> SOLO prepago.
  if p_payment_intent <> 'prepaid'
     and public.customer_contraentrega_blocked(p_customer_phone, p_delivery_reference) then
    raise exception 'Este número/dirección debe pagar por adelantado (Yape/Plin)' using errcode = 'P0001';
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
