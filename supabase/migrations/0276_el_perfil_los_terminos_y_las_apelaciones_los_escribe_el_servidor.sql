-- =============================================================================
-- 0276 · El perfil, los términos y las apelaciones los escribe el servidor
--
-- El cliente puede leer sus datos, pero no fabricar verificación ni sanciones,
-- borrar aceptaciones o resolver su propia apelación. La API fija el dueño con
-- la sesión y escribe con service_role; las RPC conservan sus permisos actuales.
-- Solo cambia el origen del teléfono: nunca los cálculos ni los importes.
-- =============================================================================

-- 1 · La RLS de lectura sigue aislando los datos de cada cliente.
drop policy if exists cp_self_all on public.customer_profiles;
drop policy if exists cp_self_read on public.customer_profiles;
create policy cp_self_read on public.customer_profiles for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists ta_self_all on public.terms_acceptance;
drop policy if exists ta_self_read on public.terms_acceptance;
create policy ta_self_read on public.terms_acceptance for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists rep_insert_auth on public.reports;
-- cp_admin_read, ta_admin_read, las lecturas de reports y rep_admin_all se conservan.
-- Sin privilegios de escritura, rep_admin_all solo permite lectura efectiva.
revoke insert, update, delete, truncate on table
  public.customer_profiles, public.terms_acceptance, public.reports from anon, authenticated;

-- Revocar la tabla NO revoca los grants de columna. Se cubren todas las columnas,
-- también las incorporadas después de los grants originales de 0004.
do $$
declare
  v_table text;
  v_columns text;
begin
  foreach v_table in array array['customer_profiles', 'terms_acceptance', 'reports'] loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_columns
    from pg_attribute a
    where a.attrelid = format('public.%I', v_table)::regclass
      and a.attnum > 0 and not a.attisdropped;
    execute format('revoke insert (%s), update (%s) on table public.%I from anon, authenticated',
      v_columns, v_columns, v_table);
  end loop;
end;
$$;

-- 2 · Misma firma que 0275. p_customer_phone queda sin uso por compatibilidad
-- con REST v1 y con las llamadas ya instaladas (API-3).
CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text, p_customer_notes text DEFAULT NULL::text, p_delivery_accuracy_m integer DEFAULT NULL::integer, p_delivery_confirmed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_pickup_timing text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Promo de lanzamiento «envío gratis» (0187)
  v_promo jsonb;
  v_promo_code text;
  v_promo_active boolean;
  v_promo_max int;
  v_promo_taken int;
  v_prior_delivered int;
  v_had_history boolean;
  v_verified_phone text;
  v_customer_phone text;
  v_phone_verified_at timestamptz;
  v_redemption_id uuid;
  v_promo_applied boolean := false;
  v_fee_source text := 'system';
  -- Promo de envío gratis por plato (0227: calendario semanal; 0230: fecha de corte)
  v_item_promo_distinct int;
  v_item_promo_days smallint[];
  v_item_free_delivery_until date;
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
  v_group record;
  v_selection_count int;
  v_selection_min int;
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
  v_band public.distance_band;
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

  -- Guard de pedido activo (instrumentación del bloqueo)
  v_active_id uuid;
  v_active_short_id text;
  v_active_status public.order_status;

  -- B.3: Umbrales de efectivo (R2, R3)
  v_max_bill numeric;
  v_max_change numeric;

  -- 0211: motivo detrás del guard de contraentrega (trusted | risk_blocked | no_history)
  v_contraentrega_decision text;

  -- 0220: cuándo dijo el cliente que pasa por su recojo, y el atajo booleano.
  v_pickup_timing text;
  v_pickup_now boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  v_pickup_timing := case
    when p_delivery_method <> 'pickup' then null
    when p_pickup_timing in ('now', 'later') then p_pickup_timing
    else 'later'
  end;
  v_pickup_now := (v_pickup_timing = 'now');

  if p_payment_intent = 'pending_mixed' then
    raise exception 'El pago mixto no está disponible en el canal de cliente. Elige efectivo, Yape/Plin o prepago.'
      using errcode = 'P0001';
  end if;

  select o.id, o.short_id, o.status into v_active_id, v_active_short_id, v_active_status
  from public.orders o
  where o.customer_user_id = p_customer_user_id
    and o.business_id = p_business_id
    and o.status in (
      'validando', 'pending_acceptance', 'awaiting_payment', 'confirmed', 'preparing',
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up',
      'ready_for_pickup'
    )
  order by o.created_at desc
  limit 1;

  if v_active_short_id is not null then
    raise exception 'Ya tienes un pedido activo en este restaurante. Espera a que termine antes de hacer uno nuevo.'
      using errcode = 'P0001',
            detail = 'active_order_block:' || v_active_id::text || ':' || v_active_short_id
                     || ':' || v_active_status::text;
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;

  -- El número sellado vive en E.164; la operación y el antifraude usan 9 dígitos.
  select cp.phone, cp.phone_verified_at into v_customer_phone, v_phone_verified_at
  from public.customer_profiles cp where cp.user_id = p_customer_user_id;
  if v_phone_verified_at is null then
    raise exception 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      using errcode = 'P0001';
  end if;
  v_customer_phone := regexp_replace(v_customer_phone, '^[+]51', '');
  if v_customer_phone is null or v_customer_phone !~ '^9[0-9]{8}$' then
    raise exception 'El número de WhatsApp verificado no es válido.' using errcode = 'P0001';
  end if;

  if public.customer_is_blocked(p_customer_user_id, v_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  if p_payment_intent in ('pending_cash', 'pending_yape') then
    v_contraentrega_decision := public.customer_contraentrega_decision(p_customer_user_id);

    if v_contraentrega_decision = 'risk_blocked' then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    elsif v_contraentrega_decision = 'no_history' then
      if v_pickup_now then
        v_risk_flags := v_risk_flags || jsonb_build_object('pickupNowPresence', true);
      elsif not public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method) then
        raise exception 'Pago adelantado requerido para primer pedido.'
          using errcode = 'P0001';
      else
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'new_customer_local_gps');
        v_risk_flags := v_risk_flags || jsonb_build_object('newCustomerLocalGps', true);
      end if;
    end if;
  end if;

  if p_delivery_method = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Coordenadas de entrega obligatorias para delivery' using errcode = 'P0001';
    end if;

    if not public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) then
      raise exception 'Dirección fuera de la zona de reparto establecida para San Jacinto' using errcode = 'P0001';
    end if;

    if p_customer_gps_method is not null
       and p_customer_gps_method not in ('failed', 'manual_skip_prepaid') then
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

  if p_delivery_method = 'pickup' then
    v_delivery_fee := 0;
    v_band := null;
  else
    v_band := public.delivery_band_for_point(p_delivery_lat, p_delivery_lng);
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> v_band::text)::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m,
    customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method,
    order_amount, delivery_fee, status,
    delivery_distance_band, delivery_fee_source,
    customer_notes,
    delivery_coordinates_accuracy_m, delivery_location_confirmed_at,
    pickup_timing
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, v_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system',
    left(nullif(btrim(regexp_replace(coalesce(p_customer_notes, ''), '\s+', ' ', 'g')), ''), 200),
    nullif(greatest(coalesce(p_delivery_accuracy_m, 0), 0), 0),
    p_delivery_confirmed_at,
    v_pickup_timing
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;

    if p_source = 'customer_pwa'
       and not public.menu_item_orderable_now(
             v_menu_item.available_days,
             v_menu_item.available_from,
             v_menu_item.available_to) then
      raise exception 'El item "%" no se sirve en este turno', v_menu_item.name
        using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    -- Una repetida es un error: deduplicarla cambiaría el precio visto.
    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb)) as selected(option_id)
      group by selected.option_id::uuid
      having count(*) > 1
    ) then
      raise exception 'Hay una opción repetida en «%».', v_menu_item.name
        using errcode = 'P0001';
    end if;

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
      if not found then raise exception 'Modificador no valido para este item' using errcode = 'P0001'; end if;
      v_unit := v_unit + v_opt.oprice;
      v_mods := v_mods || jsonb_build_object('g', v_opt.gname, 'n', v_opt.oname, 'p', v_opt.oprice);
    end loop;

    -- Revisa también los grupos sin selección: pueden ser obligatorios.
    for v_group in
      select g.id, g.name, g.selection_type, g.is_required, g.min_selections, g.max_selections
      from public.menu_item_modifier_groups mig
      join public.menu_modifier_groups g on g.id = mig.group_id
      where mig.item_id = v_menu_item.id
      order by mig.display_order, g.id
    loop
      select count(*) into v_selection_count
      from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb)) as selected(option_id)
      join public.menu_modifier_options o on o.id = selected.option_id::uuid
      where o.group_id = v_group.id;

      if v_group.selection_type = 'single' then
        if v_selection_count > 1 then
          raise exception 'En «%» de «%» solo puedes elegir una opción.', v_group.name, v_menu_item.name
            using errcode = 'P0001';
        end if;
        if v_group.is_required and v_selection_count = 0 then
          raise exception 'Elige una opción de «%» en «%».', v_group.name, v_menu_item.name
            using errcode = 'P0001';
        end if;
      else
        if v_group.max_selections is not null and v_selection_count > v_group.max_selections then
          raise exception 'En «%» de «%» puedes elegir hasta % %.', v_group.name, v_menu_item.name,
            v_group.max_selections, case when v_group.max_selections = 1 then 'opción' else 'opciones' end
            using errcode = 'P0001';
        end if;
        v_selection_min := greatest(1, v_group.min_selections);
        if v_group.is_required and v_selection_count < v_selection_min then
          raise exception 'Elige al menos % % de «%» en «%».', v_selection_min,
            case when v_selection_min = 1 then 'opción' else 'opciones' end, v_group.name, v_menu_item.name
            using errcode = 'P0001';
        end if;
      end if;
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

  if p_delivery_method = 'delivery' and v_delivery_fee > 0 then
    select value into v_promo
      from public.app_settings
     where key = 'promo_free_delivery'
       for update;

    if found then
      v_promo_code   := v_promo ->> 'code';
      v_promo_active := coalesce((v_promo ->> 'active')::boolean, false);
      v_promo_max    := (v_promo ->> 'max_redemptions')::int;

      if v_promo_active
         and v_promo_code is not null
         and v_promo_max is not null
         and public.current_service_date()
               between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date
      then
        select count(*) into v_promo_taken
          from public.promo_redemptions
         where promo_code = v_promo_code
           and status in ('reserved', 'redeemed');

        if v_promo_taken < v_promo_max then
          select cp.phone into v_verified_phone
            from public.customer_profiles cp
           where cp.user_id = p_customer_user_id
             and cp.phone_verified_at is not null;

          if v_verified_phone is not null then
            select count(*) into v_prior_delivered
              from public.orders o
             where o.status = 'delivered'
               and (o.customer_user_id = p_customer_user_id
                    or o.customer_phone = v_verified_phone);

            v_had_history := public.customer_trusted_for_contraentrega(p_customer_user_id);

            insert into public.promo_redemptions (
              promo_code, customer_user_id, verified_phone, order_id,
              status, waived_amount, distance_band,
              prior_delivered_count, had_delivery_history
            ) values (
              v_promo_code, p_customer_user_id, v_verified_phone, v_order_id,
              'reserved', v_delivery_fee, v_band,
              v_prior_delivered, v_had_history
            )
            on conflict do nothing
            returning id into v_redemption_id;

            if v_redemption_id is not null then
              v_promo_applied := true;
              v_delivery_fee  := 0;
              v_fee_source    := 'promo';
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  -- ── PROMO DE ENVÍO GRATIS POR PLATO (0227: días de semana; 0230: fecha de
  -- corte) ─────────────────────────────────────────────────────────────────
  -- Mismo sitio y mismo criterio que siempre: hay que decidir antes de las
  -- validaciones de pago, que leen `v_delivery_fee`. `v_delivery_fee > 0` hace
  -- que si la promo de lanzamiento (arriba) ya dejó el envío en 0, este bloque
  -- no tenga nada que hacer.
  if p_source = 'customer_pwa'
     and p_delivery_method = 'delivery'
     and v_delivery_fee > 0
  then
    -- "Únicamente ese plato": el carrito no puede tener más de un menu_item_id
    -- distinto. La cantidad de ese plato no importa, ni si lleva modificadores.
    select count(distinct (elem ->> 'menu_item_id')) into v_item_promo_distinct
      from jsonb_array_elements(p_items) elem;

    if v_item_promo_distinct = 1 then
      select mi.free_delivery_days, mi.free_delivery_until
        into v_item_promo_days, v_item_free_delivery_until
        from public.menu_items mi
       where mi.id = (p_items -> 0 ->> 'menu_item_id')::uuid
         and mi.business_id = p_business_id;

      -- Las dos condiciones se combinan por "o": basta con que una aplique.
      if public.menu_item_free_delivery_day(v_item_promo_days)
         or public.menu_item_free_delivery_until(v_item_free_delivery_until)
      then
        v_delivery_fee := 0;
        v_fee_source   := 'promo';
      end if;
    end if;
  end if;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount + v_delivery_fee > v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'El total con envio (S/ %) pasa de S/ %, asi que el pago debe ser adelantado.',
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00'),
      to_char(v_threshold, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null then
    select (value #>> '{}')::numeric into v_max_bill from public.app_settings where key = 'max_cash_bill';
    v_max_bill := coalesce(v_max_bill, 100);

    v_max_change := public.effective_max_change(p_business_id);

    if p_client_pays_with > v_max_bill then
      raise exception 'El billete máximo aceptado es S/%. Usa un billete menor o paga con Yape/Plin.', v_max_bill
        using errcode = 'P0001';
    end if;

    if p_client_pays_with - (v_order_amount + v_delivery_fee) > v_max_change then
      raise exception 'El vuelto requerido (S/%) supera el vuelto disponible esta noche (S/%). Paga con un billete menor o usa Yape/Plin.',
        to_char(p_client_pays_with - (v_order_amount + v_delivery_fee), 'FM999990.00'),
        v_max_change
        using errcode = 'P0001';
    end if;
  end if;

  select value into v_location from public.app_settings where key = 'validation';
  v_vthreshold := coalesce((v_location ->> 'amountThreshold')::numeric, 80);
  v_same_phone_window := coalesce((v_location ->> 'samePhoneWindowMinutes')::int, 30);
  v_same_phone_threshold := coalesce((v_location ->> 'samePhoneThreshold')::int, 3);
  v_nearby_window := coalesce((v_location ->> 'nearbyAddressWindowMinutes')::int, 60);
  v_nearby_radius_m := coalesce((v_location ->> 'nearbyAddressRadiusM')::numeric, 200);
  v_nearby_threshold := coalesce((v_location ->> 'nearbyAddressThreshold')::int, 3);
  v_high_ticket_amount := coalesce((v_location ->> 'newPhoneHighTicketAmount')::numeric, 50);
  v_high_ticket_threshold := coalesce((v_location ->> 'newPhoneHighTicketThreshold')::int, 3);
  v_spike_days := coalesce((v_location ->> 'spikeLookbackDays')::int, 14);
  v_spike_multiplier := coalesce((v_location ->> 'spikeMultiplier')::numeric, 2);
  v_spike_min := coalesce((v_location ->> 'spikeMinimumOrdersPerHour')::int, 6);

  select count(*) into v_same_phone_count
  from public.orders o
  where o.customer_phone = v_customer_phone
    and o.created_at >= now() - make_interval(mins => v_same_phone_window)
    and o.status <> 'cancelled';
  if v_same_phone_count >= v_same_phone_threshold then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'same_phone_burst');
    v_risk_flags := v_risk_flags || jsonb_build_object('samePhoneBurst', true);
  end if;

  if p_delivery_lat is not null and p_delivery_lng is not null then
    select count(*) into v_nearby_count
    from public.orders o
    where o.business_id = p_business_id
      and o.delivery_coordinates_lat is not null
      and o.delivery_coordinates_lng is not null
      and o.created_at >= now() - make_interval(mins => v_nearby_window)
      and o.status <> 'cancelled'
      and public.geo_distance_km(
        o.delivery_coordinates_lat::double precision,
        o.delivery_coordinates_lng::double precision,
        p_delivery_lat::double precision,
        p_delivery_lng::double precision
      ) <= (v_nearby_radius_m / 1000.0);
    if v_nearby_count >= v_nearby_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'nearby_address_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('nearbyAddressBurst', true);
    end if;
  end if;

  v_night_start := (date_trunc('day', now() at time zone 'America/Lima') + interval '18 hours') at time zone 'America/Lima';
  if now() < v_night_start then
    v_night_start := v_night_start - interval '1 day';
  end if;

  if v_order_amount >= v_high_ticket_amount then
    with nightly_orders as (
      select o.*
      from public.orders o
      where o.business_id = p_business_id
        and o.created_at >= v_night_start
        and o.order_amount >= v_high_ticket_amount
        and o.status <> 'cancelled'
        and o.customer_phone is not null
    ),
    new_phones as (
      select distinct no.customer_phone
      from nightly_orders no
      where not exists (
        select 1
        from public.orders prior
        where prior.customer_phone = no.customer_phone
          and prior.id <> no.id
          and prior.created_at < v_night_start
          and prior.status <> 'cancelled'
      )
    )
    select count(*) into v_new_high_ticket_count from new_phones;

    if v_new_high_ticket_count >= v_high_ticket_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'new_phone_high_ticket_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('newPhoneHighTicketBurst', true);
    end if;
  end if;

  select count(*) into v_recent_hour_count
  from public.orders o
  where o.business_id = p_business_id
    and o.created_at >= now() - interval '1 hour'
    and o.status <> 'cancelled';

  select avg(hour_count)::numeric into v_avg_hourly
  from (
    select date_trunc('hour', o.created_at) as bucket, count(*) as hour_count
    from public.orders o
    where o.business_id = p_business_id
      and o.created_at >= now() - make_interval(days => v_spike_days)
      and o.created_at < now() - interval '1 hour'
      and o.status <> 'cancelled'
    group by 1
  ) h;

  if v_recent_hour_count >= v_spike_min
     and v_avg_hourly is not null
     and v_recent_hour_count > (v_avg_hourly * v_spike_multiplier) then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'order_spike');
    v_risk_flags := v_risk_flags || jsonb_build_object('orderSpike', true);
    if not exists (
      select 1 from public.admin_alerts
      where type = 'fraud_order_spike'
        and created_at >= now() - interval '1 hour'
        and resolved_at is null
    ) then
      insert into public.admin_alerts (type, payload)
      values ('fraud_order_spike', jsonb_build_object(
        'businessId', p_business_id,
        'recentHourCount', v_recent_hour_count,
        'averageHourlyCount', v_avg_hourly,
        'orderId', v_order_id
      ));
    end if;
  end if;

  if p_payment_intent = 'prepaid' then
    v_status := 'pending_acceptance';
  else
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = v_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = v_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'standard_validation_rule');
    end if;

    if v_requires_validation then
      if v_pickup_now then
        v_risk_flags := v_risk_flags || jsonb_build_object('resolvedAtCounter', true);
      else
        v_status := 'validando';
      end if;
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    delivery_fee = v_delivery_fee,
    delivery_fee_source = v_fee_source,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2)
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method,
    'pickupTiming', v_pickup_timing,
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
    'total', v_order_amount + v_delivery_fee,
    'promoApplied', v_promo_applied,
    'pickupTiming', v_pickup_timing
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz, text) TO service_role;

-- 3 · Misma firma y permisos que 0240; operación conserva el teléfono del cuerpo.
create or replace function public.create_courier_order(
  p_customer_user_id uuid,
  p_requester_name text,
  p_requester_phone text,
  p_directory_business_id uuid,
  p_origin_name text,
  p_origin_phone text,
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_origin_reference_text text,
  p_destination_name text,
  p_destination_phone text,
  p_destination_lat numeric,
  p_destination_lng numeric,
  p_destination_reference_text text,
  p_item_description text,
  p_is_fragile boolean,
  p_ready_in_min int,
  p_payer public.courier_payer,
  p_weight_confirmed boolean,
  p_prepaid_confirmed boolean,
  p_utm_source text default null,
  p_driver_note text default null
) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v_max_active int;
  v_fee numeric(10,2);
  v_distance_m numeric(10,2);
  v_short_id text;
  v_id uuid;
  v_order_number bigint;
  v_active_count int;
  v_unlimited boolean;
  v_requester_phone text;
  v_phone_verified_at timestamptz;
begin
  -- 0235: `is not true` y no `not`: con NULL, `if not null` no entra y la
  -- confirmación se saltaría (auditoría de Codex).
  if p_weight_confirmed is not true then
    raise exception 'Falta confirmar que lo que envías está permitido' using errcode = 'P0001';
  end if;
  if p_prepaid_confirmed is not true then
    raise exception 'Falta confirmar que ya pagaste tu pedido' using errcode = 'P0001';
  end if;

  select value into v_courier from public.app_settings where key = 'courier';
  if v_courier is null or coalesce((v_courier ->> 'enabled')::boolean, false) = false then
    raise exception 'courier_disabled' using errcode = 'P0001';
  end if;

  if not public.is_within_courier_schedule() then
    raise exception 'courier_closed' using errcode = 'P0001';
  end if;

  -- 0240: ya NO se exige un motorizado «disponible». La solicitud se crea y
  -- avisa por push a todos los motorizados activos (notificar no es asignar);
  -- si nadie la toma en `courierAcceptMinutes`, se cancela sola sin cobro.

  if not public.point_in_coverage_polygon(p_origin_lat, p_origin_lng) then
    raise exception 'courier_out_of_zone:origin' using errcode = 'P0001';
  end if;
  if not public.point_in_coverage_polygon(p_destination_lat, p_destination_lng) then
    raise exception 'courier_out_of_zone:destination' using errcode = 'P0001';
  end if;

  -- 0235: la cuenta con la que Jesús carga los pedidos de WhatsApp no tiene
  -- límite. Cada pedido suyo es de un cliente distinto; con el límite, solo
  -- podría atender uno a la vez.
  v_unlimited := coalesce(v_courier -> 'unlimitedRequesterUserIds', '[]'::jsonb)
    ? p_customer_user_id::text;

  -- Operación carga pedidos de terceros; los demás usan su número verificado.
  v_requester_phone := p_requester_phone;
  if not v_unlimited then
    select cp.phone, cp.phone_verified_at into v_requester_phone, v_phone_verified_at
    from public.customer_profiles cp where cp.user_id = p_customer_user_id;
    v_requester_phone := regexp_replace(v_requester_phone, '^[+]51', '');
    if v_phone_verified_at is null or v_requester_phone is null
       or v_requester_phone !~ '^9[0-9]{8}$' then
      raise exception 'courier_phone_not_verified' using errcode = 'P0001';
    end if;

    -- 0235: serializa por celular ANTES de contar. Sin esto, dos solicitudes
    -- simultáneas del mismo celular cuentan 0 cada una y entran las dos.
    perform pg_advisory_xact_lock(hashtext('courier_phone:' || v_requester_phone));
    v_max_active := coalesce((v_courier ->> 'maxActivePerPhone')::int, 1);
    select count(*) into v_active_count
      from public.courier_orders
      where requester_phone = v_requester_phone
        and status not in ('delivered', 'cancelled');
    if v_active_count >= v_max_active then
      raise exception 'courier_active_limit' using errcode = 'P0001';
    end if;
  end if;

  v_fee := coalesce((v_courier -> 'pricing' ->> 'basePrice')::numeric, 3.00);
  v_distance_m := public.geo_distance_km(
    p_origin_lat::double precision, p_origin_lng::double precision,
    p_destination_lat::double precision, p_destination_lng::double precision
  ) * 1000;
  v_short_id := public.generate_courier_short_id();

  -- 0235: «listo y pagado» significa listo AHORA. `p_ready_in_min` se ignora:
  -- un pedido «para dentro de dos horas» bloquearía al motorizado.
  insert into public.courier_orders (
    short_id, customer_user_id, requester_name, requester_phone,
    directory_business_id,
    origin_name, origin_phone, origin_lat, origin_lng, origin_reference_text,
    destination_name, destination_phone, destination_lat, destination_lng, destination_reference_text,
    item_description, is_fragile, ready_in_min, ready_at,
    payer, fee_amount, distance_m, weight_confirmed, prepaid_confirmed,
    utm_source, driver_note
  ) values (
    v_short_id, p_customer_user_id, p_requester_name, v_requester_phone,
    p_directory_business_id,
    p_origin_name, p_origin_phone, p_origin_lat, p_origin_lng, p_origin_reference_text,
    p_destination_name, p_destination_phone, p_destination_lat, p_destination_lng, p_destination_reference_text,
    p_item_description, p_is_fragile, 0, now(),
    p_payer, v_fee, v_distance_m, p_weight_confirmed, p_prepaid_confirmed,
    p_utm_source, nullif(btrim(p_driver_note), '')
  )
  returning id, order_number into v_id, v_order_number;

  insert into public.courier_order_events (courier_order_id, event_type, actor_role, actor_user_id, data)
  values (v_id, 'courier.requested', 'customer', p_customer_user_id,
    jsonb_build_object('feeAmount', v_fee, 'distanceM', v_distance_m));

  return jsonb_build_object(
    'id', v_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'requested',
    'feeAmount', v_fee,
    'distanceM', v_distance_m
  );
end;
$$;

-- Permisos de la 0233, repetidos: `create or replace` los devuelve a anon.
revoke execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.create_courier_order(
  uuid, text, text, uuid, text, text, numeric, numeric, text, text, text, numeric, numeric, text,
  text, boolean, int, public.courier_payer, boolean, boolean, text, text
) to service_role;

-- 4 · Fallar antes del commit si queda una vía de escritura o una sobrecarga.
do $$
declare
  v_table text;
  v_role text;
  v_function text;
begin
  foreach v_table in array array['customer_profiles', 'terms_acceptance', 'reports'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.' || v_table, 'INSERT')
         or has_table_privilege(v_role, 'public.' || v_table, 'UPDATE')
         or has_table_privilege(v_role, 'public.' || v_table, 'DELETE')
         or has_table_privilege(v_role, 'public.' || v_table, 'TRUNCATE')
         or has_any_column_privilege(v_role, 'public.' || v_table, 'INSERT')
         or has_any_column_privilege(v_role, 'public.' || v_table, 'UPDATE') then
        raise exception 'Quedan permisos de escritura para % en %', v_role, v_table;
      end if;
    end loop;
  end loop;
  foreach v_function in array array['create_customer_order', 'create_courier_order'] loop
    if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_function) <> 1 then
      raise exception 'La función % debe tener exactamente una firma', v_function;
    end if;
  end loop;
end;
$$;
