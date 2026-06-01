-- =============================================================================
-- 0019 · Operaciones del negocio: pedido manual, bloqueo/desbloqueo, extender prep
-- create_business_manual_order: el negocio crea un pedido por teléfono (is_manual
-- generado de source='business_manual'). Acepta ítems de menú {menu_item_id} o
-- libres {name, unitPrice}. Nace 'confirmed' (el negocio ya lo aceptó al crearlo).
-- block/unblock_business: el admin suspende/reactiva con motivo.
-- extend_order_prep: el negocio extiende el tiempo de preparación (tope en settings).
-- Solo service_role.
-- =============================================================================

create or replace function public.create_business_manual_order(
  p_business_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_reference text default null,
  p_notes text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_business public.businesses;
  v_item jsonb;
  v_qty int;
  v_name text;
  v_price numeric;
  v_mi_id uuid;
  v_menu_item public.menu_items;
  v_line numeric;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_order_amount numeric := 0;
  v_delivery_fee numeric;
  v_bands jsonb;
begin
  select * into v_business from public.businesses where user_id = p_business_user_id;
  if not found then raise exception 'Negocio no encontrado' using errcode = 'P0002'; end if;
  if v_business.is_blocked then raise exception 'Tu cuenta está suspendida' using errcode = 'P0001'; end if;
  if not v_business.is_active then raise exception 'Negocio inactivo' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Items inválidos' using errcode = 'P0001'; end if;

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
  else
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, business_notes
  ) values (
    v_business.id, null, 'business_manual', p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    0, v_delivery_fee, 'confirmed', p_notes
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));
    if nullif(v_item ->> 'menu_item_id', '') is not null then
      select * into v_menu_item from public.menu_items
        where id = (v_item ->> 'menu_item_id')::uuid and business_id = v_business.id;
      if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
      v_name := v_menu_item.name;
      v_price := v_menu_item.base_price;
      v_mi_id := v_menu_item.id;
    else
      v_name := coalesce(nullif(v_item ->> 'name', ''), 'Ítem');
      v_price := coalesce((v_item ->> 'unitPrice')::numeric, 0);
      v_mi_id := null;
    end if;
    v_line := round(v_price * v_qty, 2);
    v_order_amount := v_order_amount + v_line;
    insert into public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) values (
      v_order_id, v_mi_id, v_name, v_price, v_qty, v_price, v_line, nullif(v_item ->> 'note', '')
    );
  end loop;

  update public.orders set order_amount = v_order_amount where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id, 'manual', true,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'business', p_business_user_id, jsonb_build_object('manual', true));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', 'confirmed', 'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee
  );
end;
$$;

create or replace function public.block_business(p_id uuid, p_reason text, p_by uuid)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.businesses
    set is_blocked = true, block_reason = p_reason, updated_at = now()
    where id = p_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('business', p_id, 'BusinessBlocked', jsonb_build_object('reason', p_reason, 'by', p_by));
  return jsonb_build_object('blocked', true);
end;
$$;

create or replace function public.unblock_business(p_id uuid, p_by uuid)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
begin
  update public.businesses
    set is_blocked = false, blocked_for_debt = false, block_reason = null, updated_at = now()
    where id = p_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('business', p_id, 'BusinessUnblocked', jsonb_build_object('by', p_by));
  return jsonb_build_object('blocked', false);
end;
$$;

-- El negocio extiende el tiempo de preparación (tope app_settings.timers).
create or replace function public.extend_order_prep(p_order_id uuid, p_business_user_id uuid)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_order public.orders;
  v_business public.businesses;
  v_timers jsonb;
  v_minutes int;
  v_max int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no existe' using errcode = 'P0002'; end if;
  select * into v_business from public.businesses where id = v_order.business_id;
  if v_business.user_id <> p_business_user_id then raise exception 'No autorizado' using errcode = 'P0001'; end if;
  if v_order.status <> 'preparing' then raise exception 'El pedido no está en preparación' using errcode = 'P0001'; end if;

  select value into v_timers from public.app_settings where key = 'timers';
  v_minutes := coalesce((v_timers ->> 'prepExtensionMinutes')::int, 10);
  v_max := coalesce((v_timers ->> 'maxPrepExtensions')::int, 2);

  if v_order.prep_extension_count >= v_max then
    raise exception 'Ya alcanzaste el máximo de extensiones' using errcode = 'P0001';
  end if;

  update public.orders
    set prep_extension_count = prep_extension_count + 1,
        prep_extended_at = now(),
        estimated_ready_at = coalesce(estimated_ready_at, now()) + (v_minutes || ' minutes')::interval,
        prep_time_minutes = coalesce(prep_time_minutes, 0) + v_minutes
    where id = p_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_order_id, 'OrderPrepExtended', jsonb_build_object('minutes', v_minutes));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_order_id, 'order.prep_extended', 'business', p_business_user_id, jsonb_build_object('minutes', v_minutes));

  return jsonb_build_object('extended', true, 'minutes', v_minutes, 'count', v_order.prep_extension_count + 1);
end;
$$;

revoke execute on function public.create_business_manual_order(uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text, text) from public, anon, authenticated;
revoke execute on function public.block_business(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.unblock_business(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.extend_order_prep(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_business_manual_order(uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text, text) to service_role;
grant execute on function public.block_business(uuid, text, uuid) to service_role;
grant execute on function public.unblock_business(uuid, uuid) to service_role;
grant execute on function public.extend_order_prep(uuid, uuid) to service_role;
