-- 0062_fix_create_customer_order_prepaid_status.sql
-- Corregir el estado inicial de pedidos prepago en create_customer_order.
-- Anteriormente p_payment_intent = 'prepaid' asignaba v_status := 'validando'.
-- Ahora asigna v_status := 'pending_acceptance' para que el restaurante primero acepte disponibilidad.

DROP FUNCTION IF EXISTS public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text
);

CREATE OR REPLACE FUNCTION public.create_customer_order(
  p_business_id uuid,
  p_customer_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb,
  p_delivery_address text,
  p_delivery_reference text,
  p_delivery_lat numeric default null::numeric,
  p_delivery_lng numeric default null::numeric,
  p_source public.order_source default 'customer_pwa'::public.order_source,
  p_client_pays_with numeric default null::numeric,
  p_customer_gps_lat double precision default null::double precision,
  p_customer_gps_lng double precision default null::double precision,
  p_customer_gps_accuracy_m double precision default null::double precision,
  p_customer_gps_distance_to_center_km numeric default null::numeric,
  p_customer_gps_method text default null::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_order_id uuid;
  v_short_id text;
  v_order_number int;
  v_delivery_fee numeric;
  v_order_amount numeric := 0;
  v_menu_item record;
  v_business record;
  v_coi_id uuid;
  v_item jsonb;
  v_optid text;
  v_qty int;
  v_unit numeric;
  v_mods jsonb;
  v_opt record;
  v_line_total numeric;
  v_mod jsonb;
  v_status public.order_status := 'pending_acceptance';
  v_requires_validation boolean := false;
  v_validation_reason text := null;
  v_threshold numeric;
  v_vthreshold numeric;
  v_location jsonb;
  v_risk_flags jsonb := '{}'::jsonb;
  v_bands jsonb;
  v_max_accuracy numeric := 150;
  
  -- Burst detection
  v_same_phone_window int;
  v_same_phone_threshold int;
  v_same_phone_count int;
  
  v_nearby_window int;
  v_nearby_radius_m numeric;
  v_nearby_threshold int;
  v_nearby_count int;
  
  v_high_ticket_amount numeric;
  v_high_ticket_threshold int;
  v_new_high_ticket_count int;
  v_night_start timestamptz;
  
  -- Spike detection
  v_recent_hour_count int;
  v_avg_hourly numeric;
  v_spike_days int;
  v_spike_multiplier numeric;
  v_spike_min int;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;

  if public.customer_is_blocked(p_customer_user_id, p_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE TELÉFONO VERIFICADO (WhatsApp OTP)
  if not exists (
    select 1 from public.customer_profiles
    where user_id = p_customer_user_id
    and phone_verified_at is not null
  ) then
    raise exception 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE CONTRAENTREGA: solo para usuarios con historial (al menos 1 entregado)
  if p_payment_intent in ('pending_cash', 'pending_yape') then
    if not exists (
      select 1 from public.orders
      where customer_user_id = p_customer_user_id
      and status = 'delivered'
      limit 1
    ) then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    end if;
  end if;

  if p_delivery_method = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Coordenadas de entrega obligatorias para delivery' using errcode = 'P0001';
    end if;

    -- Validar cobertura
    if not public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) then
      raise exception 'Dirección fuera de la zona de reparto establecida para San Jacinto' using errcode = 'P0001';
    end if;

    -- Validar GPS vs Dirección
    if p_customer_gps_method is not null and p_customer_gps_method <> 'failed' then
      if p_customer_gps_lat is null or p_customer_gps_lng is null then
        raise exception 'Coordenadas GPS del cliente incompletas' using errcode = 'P0001';
      end if;

      if public.geo_distance_km(p_customer_gps_lat, p_customer_gps_lng, p_delivery_lat::double precision, p_delivery_lng::double precision) > 0.4 then
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'gps_warning_zone');
        v_risk_flags := v_risk_flags || jsonb_build_object('gpsWarningZone', true);
      end if;
    end if;

    if p_customer_gps_method in ('failed', 'manual_skip_prepaid') then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsFallbackPrepaid', true);
    elsif p_customer_gps_accuracy_m is not null and p_customer_gps_accuracy_m > v_max_accuracy then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsLowAccuracy', true);
    end if;
  end if;

  select nextval('public.order_number_seq') into v_order_number;
  v_order_id := gen_random_uuid();
  v_short_id := upper(substring(replace(v_order_id::text, '-', '') from 1 for 8));

  if p_delivery_method = 'delivery' then
    v_delivery_fee := coalesce(v_business.delivery_fee, 0);
  else
    v_delivery_fee := 0;
  end if;

  insert into public.orders (
    id, short_id, order_number, business_id, customer_user_id, status, delivery_method,
    payment_intent, customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng, source, order_amount, delivery_fee,
    pending_acceptance_at
  ) values (
    v_order_id, v_short_id, v_order_number, p_business_id, p_customer_user_id, 'pending_acceptance', p_delivery_method,
    p_payment_intent, p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng, p_source, 0, v_delivery_fee,
    now()
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_menu_item from public.menu_items
    where id = (v_item ->> 'menuItemId')::uuid and business_id = p_business_id;

    if not found then
      raise exception 'Item % no existe en el negocio', (v_item ->> 'menuItemId') using errcode = 'P0002';
    end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;

    v_qty := greatest(1, (v_item ->> 'quantity')::int);
    v_unit := v_menu_item.price;

    v_coi_id := gen_random_uuid();
    insert into public.customer_order_items (
      id, order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity, line_total
    ) values (
      v_coi_id, v_order_id, v_menu_item.id, v_menu_item.name, v_unit, v_qty, 0
    );

    v_line_total := v_unit * v_qty;
    v_mods := v_item -> 'modifiers';

    if v_mods is not null and jsonb_typeof(v_mods) = 'array' then
      for v_mod in select * from jsonb_array_elements(v_mods) loop
        v_optid := v_mod ->> 'optionId';
        if v_optid is not null then
          select o.name as option_name, o.additional_price, g.name as group_name
          into v_opt
          from public.menu_item_modifier_options o
          join public.menu_item_modifier_groups g on g.id = o.group_id
          where o.id = v_optid::uuid and g.business_id = p_business_id;

          if found then
            insert into public.customer_order_item_modifiers (
              item_id, option_id, group_name_snapshot, option_name_snapshot, additional_price_snapshot
            ) values (
              v_coi_id, v_optid::uuid, v_opt.group_name, v_opt.option_name, coalesce(v_opt.additional_price, 0)
            );

            v_line_total := v_line_total + (coalesce(v_opt.additional_price, 0) * v_qty);
          end if;
        end if;
      end loop;
    end if;

    update public.customer_order_items
    set line_total = v_line_total
    where id = v_coi_id;

    v_order_amount := v_order_amount + v_line_total;
  end loop;

  -- BIFURCACIÓN CORRECTA DE ESTADO INICIAL
  if p_payment_intent = 'prepaid' then
    v_status := 'pending_acceptance';
  else
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = p_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = p_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'standard_validation_rule');
    end if;

    if v_requires_validation then
      v_status := 'validando';
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then greatest(0, round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2))
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method,
    'requiresValidation', v_requires_validation, 'riskFlags', v_risk_flags
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'cliente', p_customer_user_id,
    jsonb_build_object(
      'itemCount', jsonb_array_length(p_items),
      'status', v_status,
      'requiresValidation', v_requires_validation,
      'validationReasonCode', v_validation_reason,
      'riskFlags', v_risk_flags
    ));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', v_status, 'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee
  );
end;
$function$;

revoke execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text
) from public, anon, authenticated;

grant execute on function public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text
) to service_role;
