-- 0042_cash_pays_with.sql
-- "¿Con cuánto pagas?" for the customer checkout (cash on delivery):
-- 1) create_customer_order gains p_client_pays_with (default null, appended LAST).
--    Adding a param via CREATE OR REPLACE would create an OVERLOAD, so the old
--    12-arg signature is dropped first and grants re-applied (pattern of 0020).
--    Rule: for pending_cash, p_client_pays_with must cover the order total
--    (validated after the items loop, when v_order_amount is known). The change
--    is persisted in orders.client_pays_with / change_to_give — the same columns
--    create_manual_order (negocios) already uses, so the business dashboard
--    shows "Cliente paga con" with zero changes.
-- 2) get_tracking now exposes paysWith / changeToGive (base = 0041; CREATE OR
--    REPLACE preserves the anon/authenticated grants from 0003).
-- Idempotente.

drop function if exists public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source);

create or replace function public.create_customer_order(
  p_customer_user_id uuid, p_business_id uuid, p_delivery_method delivery_method,
  p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb,
  p_delivery_address text default null, p_delivery_reference text default null,
  p_delivery_lat numeric default null, p_delivery_lng numeric default null,
  p_source order_source default 'customer_pwa'::order_source,
  p_client_pays_with numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_business public.businesses;
  v_menu_item public.menu_items;
  v_item jsonb;
  v_qty int;
  v_unit numeric;
  v_line_total numeric;
  v_coi_id uuid;
  v_optid text;
  v_opt record;
  v_mods jsonb;
  v_mod jsonb;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_order_amount numeric := 0;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_threshold numeric;
  v_status public.order_status := 'pending_acceptance';
  v_vthreshold numeric;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;
  if not (v_business.is_active and not v_business.is_blocked and v_business.publishes_catalog) then
    raise exception 'Negocio no disponible' using errcode = 'P0001';
  end if;

  -- Bloqueo total temporal por strikes (3 -> 30 días). Reemplaza el viejo escalón
  -- 2 strikes -> prepago obligatorio. Aplica a cualquier método de pago.
  if public.customer_is_blocked(p_customer_user_id, p_customer_phone) then
    raise exception 'Tu cuenta está temporalmente bloqueada por incidentes reiterados de entrega. Escríbenos para regularizar.'
      using errcode = 'P0001';
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
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    for v_optid in select value from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb))
    loop
      select o.name as oname, o.additional_price as oprice, g.name as gname into v_opt
        from public.menu_modifier_options o
        join public.menu_modifier_groups g on g.id = o.group_id
        where o.id = v_optid::uuid and o.is_available
          and exists (
            select 1 from public.menu_item_modifier_groups mig
            where mig.item_id = v_menu_item.id and mig.group_id = o.group_id
          );
      if not found then raise exception 'Modificador no válido para este ítem' using errcode = 'P0001'; end if;
      v_unit := v_unit + v_opt.oprice;
      v_mods := v_mods || jsonb_build_object('g', v_opt.gname, 'n', v_opt.oname, 'p', v_opt.oprice);
    end loop;

    v_line_total := round(v_unit * v_qty, 2);
    v_order_amount := v_order_amount + v_line_total;

    insert into public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.base_price,
      v_qty, v_unit, v_line_total, nullif(v_item ->> 'note', '')
    ) returning id into v_coi_id;

    for v_mod in select * from jsonb_array_elements(v_mods)
    loop
      insert into public.customer_order_item_modifiers (
        item_id, group_name_snapshot, option_name_snapshot, additional_price_snapshot
      ) values (v_coi_id, v_mod ->> 'g', v_mod ->> 'n', (v_mod ->> 'p')::numeric);
    end loop;
  end loop;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  if v_order_amount >= coalesce(v_threshold, 100) and p_payment_intent <> 'prepaid' then
    raise exception 'Los pedidos de S/% a mas se pagan por adelantado (Yape/Plin)', coalesce(v_threshold, 100)
      using errcode = 'P0001';
  end if;

  -- Cash must cover the total (order_amount is known only after the items loop).
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con el que pagarás (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- Estado inicial: prepago -> validando (espera comprobante + validación del negocio).
  -- Contraentrega de número nuevo / con strike / monto grande -> validando.
  if p_payment_intent = 'prepaid' then
    v_status := 'validando';
  else
    select (value ->> 'amountThreshold')::numeric into v_vthreshold from public.app_settings where key = 'validation';
    v_vthreshold := coalesce(v_vthreshold, 80);
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = p_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = p_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_status := 'validando';
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    status = v_status,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then greatest(0, round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2))
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'cliente', p_customer_user_id,
    jsonb_build_object('itemCount', jsonb_array_length(p_items), 'status', v_status));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', v_status, 'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee
  );
end;
$function$;

-- Re-apply grants: the DROP removed them and CREATE re-grants EXECUTE to public.
revoke execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric
) from public, anon, authenticated;
grant execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric
) to service_role;

-- get_tracking: base = 0041, adding paysWith / changeToGive at the order level.
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
    'paysWith', o.client_pays_with, 'changeToGive', o.change_to_give,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', i.item_name_snapshot, 'qty', i.quantity, 'lineTotal', i.line_total,
          'modifiers', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'group', m.group_name_snapshot,
                'name', m.option_name_snapshot,
                'price', m.additional_price_snapshot
              )
              order by m.created_at
            )
            from public.customer_order_item_modifiers m where m.item_id = i.id
          ), '[]'::jsonb)
        )
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
