-- =============================================================================
-- 0082 · Corte de recepción de pedidos a las 22:30 y guard en create_customer_order
-- =============================================================================

-- 1. Seed de la configuración de horario de corte (order_intake_cutoff)
INSERT INTO public.app_settings (key, value)
VALUES ('order_intake_cutoff', '"22:30"'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 2. Limpieza dinámica por catálogo de firmas a actualizar
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname IN ('create_business_manual_order', 'create_customer_order', 'is_within_order_intake_window')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- 3. Función helper public.is_within_order_intake_window() con zona horaria America/Lima y mapeo isodow determinista
CREATE OR REPLACE FUNCTION public.is_within_order_intake_window(p_custom_time timestamptz DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_schedule jsonb;
  v_cutoff jsonb;
  v_now_lima timestamp;
  v_day text;
  v_time text;
  v_start text;
  v_cutoff_time text;
  v_days jsonb;
BEGIN
  v_now_lima := timezone('America/Lima', COALESCE(p_custom_time, now()));
  
  -- Mapeo de día independiente del locale NLS del servidor (1=mon, ..., 7=sun)
  v_day := CASE extract(isodow from v_now_lima)::int
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    WHEN 7 THEN 'sun'
  END;

  v_time := to_char(v_now_lima, 'HH24:MI');

  SELECT value INTO v_schedule FROM public.app_settings WHERE key = 'platform_schedule';
  SELECT value INTO v_cutoff FROM public.app_settings WHERE key = 'order_intake_cutoff';

  IF v_schedule IS NULL THEN RETURN true; END IF;

  v_days := v_schedule -> 'days';
  v_start := COALESCE(v_schedule ->> 'startHHMM', '18:00');
  v_cutoff_time := COALESCE(v_cutoff #>> '{}', '22:30');

  -- 1. Día de atención activo
  IF NOT (v_days @> jsonb_build_array(v_day)) THEN
    RETURN false;
  END IF;

  -- 2. Rango estricto de recepción de pedidos [startHHMM, cutoff]
  RETURN v_time >= v_start AND v_time <= v_cutoff_time;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_within_order_intake_window(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_within_order_intake_window(timestamptz) TO service_role, anon, authenticated;


-- 4. Actualizar create_business_manual_order con is_within_order_intake_window()
CREATE OR REPLACE FUNCTION public.create_business_manual_order(
  p_business_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_order_amount numeric,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_prep_time_minutes int DEFAULT 20,
  p_delivery_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_client_pays_with numeric DEFAULT NULL,
  p_yape_amount numeric DEFAULT NULL,
  p_cash_amount numeric DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_business public.businesses;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
  v_clean_phone text;
  v_cutoff jsonb;
  v_cutoff_time text;
BEGIN
  SELECT * INTO v_business FROM public.businesses WHERE user_id = p_business_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no encontrado' USING errcode = 'P0002'; END IF;
  IF v_business.is_blocked THEN RAISE EXCEPTION 'Tu cuenta esta suspendida' USING errcode = 'P0001'; END IF;
  IF NOT v_business.is_active THEN RAISE EXCEPTION 'Negocio inactivo' USING errcode = 'P0001'; END IF;
  IF COALESCE(p_order_amount, 0) <= 0 THEN RAISE EXCEPTION 'Monto invalido' USING errcode = 'P0001'; END IF;

  -- 1. Ventana de recepción de pedidos a domicilio (corte 22:30)
  IF p_delivery_method = 'delivery' AND NOT public.is_within_order_intake_window() THEN
    SELECT value INTO v_cutoff FROM public.app_settings WHERE key = 'order_intake_cutoff';
    v_cutoff_time := COALESCE(v_cutoff #>> '{}', '22:30');
    RAISE EXCEPTION 'Ya no se reciben pedidos. El horario de atención termina a las %.', v_cutoff_time USING errcode = 'P0001';
  END IF;

  -- 2. Validar referencia condicional a delivery_method
  IF p_delivery_method = 'delivery' AND length(trim(COALESCE(p_delivery_reference, ''))) < 5 THEN
    RAISE EXCEPTION 'La dirección o referencia de entrega debe tener al menos 5 caracteres' USING errcode = 'P0001';
  END IF;

  -- 3. Normalizar teléfono (dígitos limpios) y validar formato
  v_clean_phone := NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g'), '');
  IF v_clean_phone IS NOT NULL AND v_clean_phone !~ '^9\d{8}$' THEN
    RAISE EXCEPTION 'Formato de teléfono inválido' USING errcode = 'P0001';
  END IF;

  -- 4. Validar blacklist de teléfonos de prueba (Ref: BLACKLISTED_PHONES en @tindivo/contracts)
  IF v_clean_phone IS NOT NULL AND v_clean_phone IN (
    '999999999', '987654321', '912345678', '955555555', '900000000', '911111111', '123456789'
  ) THEN
    RAISE EXCEPTION 'Número de teléfono de prueba no permitido' USING errcode = 'P0001';
  END IF;

  -- 5. Antifraude del cliente
  IF v_clean_phone IS NOT NULL AND public.customer_is_blocked(NULL, v_clean_phone) THEN
    RAISE EXCEPTION 'Cliente temporalmente bloqueado por incidentes reiterados de entrega.'
      USING errcode = 'P0001';
  END IF;

  IF p_payment_intent <> 'prepaid'
     AND public.customer_requires_prepayment(NULL, v_clean_phone, NULLIF(p_delivery_reference, '')) THEN
    RAISE EXCEPTION 'Este cliente requiere pago anticipado por politicas del servicio.'
      USING errcode = 'P0001';
  END IF;

  -- 6. Validación de pago mixto con aritmética entera en centavos
  IF p_payment_intent = 'pending_mixed' THEN
    IF round(COALESCE(p_yape_amount, 0) * 100) + round(COALESCE(p_cash_amount, 0) * 100) <> round(p_order_amount * 100) THEN
      RAISE EXCEPTION 'La suma de billetera y efectivo debe ser igual al total del pedido' USING errcode = 'P0001';
    END IF;
  END IF;

  v_prep := greatest(1, COALESCE(p_prep_time_minutes, 20));

  IF p_delivery_method = 'pickup' THEN
    v_delivery_fee := 0;
  ELSE
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
    v_delivery_fee := COALESCE((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  END IF;

  v_cash_part := CASE
    WHEN p_payment_intent = 'pending_cash' THEN p_order_amount
    WHEN p_payment_intent = 'pending_mixed' THEN COALESCE(p_cash_amount, 0)
    ELSE 0 END;

  -- 7. Validar vuelto suficiente sin absorber el error
  IF p_client_pays_with IS NOT NULL AND v_cash_part > 0
     AND round(p_client_pays_with * 100) < round(v_cash_part * 100) THEN
    RAISE EXCEPTION 'El monto con que paga el cliente es menor al efectivo a cobrar' USING errcode = 'P0001';
  END IF;

  v_change := CASE
    WHEN p_client_pays_with IS NOT NULL AND v_cash_part > 0
      THEN round(p_client_pays_with - v_cash_part, 2)
    ELSE NULL END;

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, business_notes,
    prep_time_minutes, confirmed_at, preparing_at, estimated_ready_at,
    appears_in_queue_at, client_pays_with, change_to_give, yape_amount, cash_amount
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(p_customer_name, ''), v_clean_phone, NULL, p_delivery_reference,
    p_order_amount, v_delivery_fee, 'preparing', p_notes,
    v_prep, now(), now(), now() + make_interval(mins => v_prep),
    now() + make_interval(mins => greatest(0, v_prep - 10)),
    p_client_pays_with, v_change,
    CASE WHEN p_payment_intent = 'pending_mixed' THEN p_yape_amount ELSE NULL END,
    CASE WHEN p_payment_intent IN ('pending_cash', 'pending_mixed') THEN v_cash_part ELSE NULL END
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  INSERT INTO public.customer_order_items (
    order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
    quantity, unit_price, line_total, note
  ) VALUES (
    v_order_id, NULL, 'Pedido por telefono', p_order_amount, 1, p_order_amount, p_order_amount, p_notes
  );

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id, 'manual', true,
    'orderAmount', p_order_amount, 'deliveryMethod', p_delivery_method, 'status', 'preparing'));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created', 'business', p_business_user_id,
    jsonb_build_object('manual', true, 'prepMinutes', v_prep));

  RETURN jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', 'preparing', 'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'total', p_order_amount + v_delivery_fee);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, int,
  text, text, numeric, numeric, numeric) TO service_role;


-- 5. Actualizar create_customer_order con is_within_order_intake_window()
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
  p_delivery_lat numeric DEFAULT NULL::numeric,
  p_delivery_lng numeric DEFAULT NULL::numeric,
  p_source public.order_source DEFAULT 'customer_pwa'::public.order_source,
  p_client_pays_with numeric DEFAULT NULL::numeric,
  p_customer_gps_lat double precision DEFAULT NULL::double precision,
  p_customer_gps_lng double precision DEFAULT NULL::double precision,
  p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision,
  p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric,
  p_customer_gps_method text DEFAULT NULL::text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
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
  v_cutoff jsonb;
  v_cutoff_time text;
  
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
  
  v_recent_hour_count int;
  v_avg_hourly numeric;
  v_spike_days int;
  v_spike_multiplier numeric;
  v_spike_min int;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El pedido no tiene items' USING errcode = 'P0001';
  END IF;

  -- 1. Ventana de recepción de pedidos a domicilio (corte 22:30)
  IF p_delivery_method = 'delivery' AND NOT public.is_within_order_intake_window() THEN
    SELECT value INTO v_cutoff FROM public.app_settings WHERE key = 'order_intake_cutoff';
    v_cutoff_time := COALESCE(v_cutoff #>> '{}', '22:30');
    RAISE EXCEPTION 'Ya no se reciben pedidos. El horario de atención termina a las %.', v_cutoff_time USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_business FROM public.businesses WHERE id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no existe' USING errcode = 'P0002'; END IF;

  IF public.customer_is_blocked(p_customer_user_id, p_customer_phone) THEN
    RAISE EXCEPTION 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      USING errcode = 'P0001';
  END IF;

  -- GUARD DE TELÉFONO VERIFICADO (WhatsApp OTP)
  IF NOT EXISTS (
    SELECT 1 FROM public.customer_profiles
    WHERE user_id = p_customer_user_id
    AND phone_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      USING errcode = 'P0001';
  END IF;

  -- GUARD DE CONTRAENTREGA
  IF p_payment_intent IN ('pending_cash', 'pending_yape') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE customer_user_id = p_customer_user_id
      AND status = 'delivered'
      LIMIT 1
    ) THEN
      RAISE EXCEPTION 'Pago adelantado requerido para primer pedido.'
        USING errcode = 'P0001';
    END IF;
  END IF;

  IF p_delivery_method = 'delivery' THEN
    IF p_delivery_lat IS NULL OR p_delivery_lng IS NULL THEN
      RAISE EXCEPTION 'Coordenadas de entrega obligatorias para delivery' USING errcode = 'P0001';
    END IF;

    IF NOT public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) THEN
      RAISE EXCEPTION 'Dirección fuera de la zona de reparto establecida para San Jacinto' USING errcode = 'P0001';
    END IF;

    IF p_customer_gps_method IS NOT NULL AND p_customer_gps_method <> 'failed' THEN
      IF p_customer_gps_lat IS NULL OR p_customer_gps_lng IS NULL THEN
        RAISE EXCEPTION 'Coordenadas GPS del cliente incompletas' USING errcode = 'P0001';
      END IF;

      IF public.geo_distance_km(p_customer_gps_lat, p_customer_gps_lng, p_delivery_lat::double precision, p_delivery_lng::double precision) > 0.4 THEN
        v_requires_validation := true;
        v_validation_reason := COALESCE(v_validation_reason, 'gps_warning_zone');
        v_risk_flags := v_risk_flags || jsonb_build_object('gpsWarningZone', true);
      END IF;
    END IF;

    IF p_customer_gps_method IN ('failed', 'manual_skip_prepaid') THEN
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsFallbackPrepaid', true);
    ELSIF p_customer_gps_accuracy_m IS NOT NULL AND p_customer_gps_accuracy_m > v_max_accuracy THEN
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsLowAccuracy', true);
    END IF;
  END IF;

  IF p_delivery_method = 'pickup' THEN
    v_delivery_fee := 0;
  ELSE
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
    v_delivery_fee := COALESCE((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  END IF;

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m,
    customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method,
    order_amount, delivery_fee, status
  ) VALUES (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    CASE WHEN p_customer_gps_method IS NOT NULL THEN now() ELSE NULL END,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance'
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_menu_item FROM public.menu_items
      WHERE id = (v_item ->> 'menu_item_id')::uuid AND business_id = p_business_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un item no pertenece a este negocio' USING errcode = 'P0001'; END IF;
    IF NOT v_menu_item.is_available THEN
      RAISE EXCEPTION 'El item "%" no esta disponible', v_menu_item.name USING errcode = 'P0001';
    END IF;
    v_qty := greatest(1, COALESCE((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    FOR v_optid IN SELECT value FROM jsonb_array_elements_text(COALESCE(v_item -> 'modifiers', '[]'::jsonb))
    LOOP
      SELECT o.name AS oname, o.additional_price AS oprice, g.name AS gname INTO v_opt
        FROM public.menu_modifier_options o
        JOIN public.menu_modifier_groups g ON g.id = o.group_id
        WHERE o.id = v_optid::uuid AND o.is_available
          AND EXISTS (
            SELECT 1 FROM public.menu_item_modifier_groups mig
            WHERE mig.item_id = v_menu_item.id AND mig.group_id = o.group_id
          );
      IF NOT FOUND THEN RAISE EXCEPTION 'Modificador no valido para este item' USING errcode = 'P0001'; END IF;
      v_unit := v_unit + v_opt.oprice;
      v_mods := v_mods || jsonb_build_object('g', v_opt.gname, 'n', v_opt.oname, 'p', v_opt.oprice);
    END LOOP;

    v_line_total := round(v_unit * v_qty, 2);
    v_order_amount := v_order_amount + v_line_total;

    INSERT INTO public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) VALUES (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.base_price,
      v_qty, v_unit, v_line_total, NULLIF(v_item ->> 'note', '')
    ) RETURNING id INTO v_coi_id;

    FOR v_mod IN SELECT * FROM jsonb_array_elements(v_mods)
    LOOP
      INSERT INTO public.customer_order_item_modifiers (
        item_id, group_name_snapshot, option_name_snapshot, additional_price_snapshot
      ) VALUES (v_coi_id, v_mod ->> 'g', v_mod ->> 'n', (v_mod ->> 'p')::numeric);
    END LOOP;
  END LOOP;

  SELECT (value #>> '{}')::numeric INTO v_threshold FROM public.app_settings WHERE key = 'prepay_threshold';
  v_threshold := COALESCE(v_threshold, 80);
  IF v_order_amount + v_delivery_fee > v_threshold AND p_payment_intent <> 'prepaid' THEN
    RAISE EXCEPTION 'Pedidos mayores a S/% requieren pago adelantado.', v_threshold
      USING errcode = 'P0001';
  END IF;

  IF p_payment_intent = 'pending_cash' AND p_client_pays_with IS NOT NULL
     AND p_client_pays_with < v_order_amount + v_delivery_fee THEN
    RAISE EXCEPTION 'El monto con el que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      USING errcode = 'P0001';
  END IF;

  SELECT value INTO v_location FROM public.app_settings WHERE key = 'validation';
  v_vthreshold := COALESCE((v_location ->> 'amountThreshold')::numeric, 80);
  v_same_phone_window := COALESCE((v_location ->> 'samePhoneWindowMinutes')::int, 30);
  v_same_phone_threshold := COALESCE((v_location ->> 'samePhoneThreshold')::int, 3);
  v_nearby_window := COALESCE((v_location ->> 'nearbyAddressWindowMinutes')::int, 60);
  v_nearby_radius_m := COALESCE((v_location ->> 'nearbyAddressRadiusM')::numeric, 200);
  v_nearby_threshold := COALESCE((v_location ->> 'nearbyAddressThreshold')::int, 3);
  v_high_ticket_amount := COALESCE((v_location ->> 'newPhoneHighTicketAmount')::numeric, 50);
  v_high_ticket_threshold := COALESCE((v_location ->> 'newPhoneHighTicketThreshold')::int, 3);
  v_spike_days := COALESCE((v_location ->> 'spikeLookbackDays')::int, 14);
  v_spike_multiplier := COALESCE((v_location ->> 'spikeMultiplier')::numeric, 2);
  v_spike_min := COALESCE((v_location ->> 'spikeMinimumOrdersPerHour')::int, 6);

  IF v_order_amount + v_delivery_fee > v_vthreshold THEN
    v_requires_validation := true;
    v_validation_reason := COALESCE(v_validation_reason, 'amount_threshold');
    v_risk_flags := v_risk_flags || jsonb_build_object('amountThreshold', true);
  END IF;

  SELECT count(*) INTO v_same_phone_count FROM public.orders
    WHERE customer_phone = p_customer_phone
      AND created_at >= now() - (v_same_phone_window || ' minutes')::interval
      AND id <> v_order_id;
  IF v_same_phone_count >= v_same_phone_threshold THEN
    v_requires_validation := true;
    v_validation_reason := COALESCE(v_validation_reason, 'burst_same_phone');
    v_risk_flags := v_risk_flags || jsonb_build_object('burstSamePhone', v_same_phone_count);
  END IF;

  IF p_delivery_lat IS NOT NULL AND p_delivery_lng IS NOT NULL THEN
    SELECT count(*) INTO v_nearby_count FROM public.orders
      WHERE delivery_coordinates_lat IS NOT NULL AND delivery_coordinates_lng IS NOT NULL
        AND public.geo_distance_km(delivery_coordinates_lat, delivery_coordinates_lng, p_delivery_lat, p_delivery_lng) <= (v_nearby_radius_m / 1000.0)
        AND created_at >= now() - (v_nearby_window || ' minutes')::interval
        AND id <> v_order_id;
    IF v_nearby_count >= v_nearby_threshold THEN
      v_requires_validation := true;
      v_validation_reason := COALESCE(v_validation_reason, 'burst_nearby_address');
      v_risk_flags := v_risk_flags || jsonb_build_object('burstNearbyAddress', v_nearby_count);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE customer_phone = p_customer_phone AND id <> v_order_id)
     AND v_order_amount + v_delivery_fee >= v_high_ticket_amount THEN
    SELECT count(*) INTO v_new_high_ticket_count FROM public.orders o
      WHERE o.created_at >= now() - '24 hours'::interval
        AND o.order_amount + o.delivery_fee >= v_high_ticket_amount
        AND NOT EXISTS (SELECT 1 FROM public.orders o2 WHERE o2.customer_phone = o.customer_phone AND o2.created_at < o.created_at);
    IF v_new_high_ticket_count >= v_high_ticket_threshold THEN
      v_requires_validation := true;
      v_validation_reason := COALESCE(v_validation_reason, 'burst_new_phone_high_ticket');
      v_risk_flags := v_risk_flags || jsonb_build_object('burstNewPhoneHighTicket', v_new_high_ticket_count);
    END IF;
  END IF;

  v_night_start := date_trunc('day', now()) + '22 hours'::interval;
  IF now() >= v_night_start OR now() < date_trunc('day', now()) + '6 hours'::interval THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE customer_phone = p_customer_phone AND id <> v_order_id) THEN
      v_requires_validation := true;
      v_validation_reason := COALESCE(v_validation_reason, 'night_new_customer');
      v_risk_flags := v_risk_flags || jsonb_build_object('nightNewCustomer', true);
    END IF;
  END IF;

  SELECT count(*) INTO v_recent_hour_count FROM public.orders
    WHERE created_at >= now() - '1 hour'::interval AND id <> v_order_id;
  SELECT COALESCE(count(*) / (v_spike_days * 24.0), 0) INTO v_avg_hourly FROM public.orders
    WHERE created_at >= now() - (v_spike_days || ' days')::interval AND id <> v_order_id;

  IF v_recent_hour_count >= v_spike_min AND v_recent_hour_count >= (v_avg_hourly * v_spike_multiplier) THEN
    v_requires_validation := true;
    v_validation_reason := COALESCE(v_validation_reason, 'spike_orders_per_hour');
    v_risk_flags := v_risk_flags || jsonb_build_object('spikeOrdersPerHour', v_recent_hour_count, 'avgHourly', v_avg_hourly);
  END IF;

  UPDATE public.orders
    SET order_amount = v_order_amount,
        risk_flags = v_risk_flags,
        requires_validation = v_requires_validation,
        validation_reason = v_validation_reason,
        status = CASE
          WHEN v_requires_validation THEN 'validando'::public.order_status
          WHEN p_payment_intent = 'prepaid' THEN 'awaiting_payment'::public.order_status
          ELSE 'pending_acceptance'::public.order_status
        END
    WHERE id = v_order_id;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'customerUserId', p_customer_user_id,
    'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'requiresValidation', v_requires_validation, 'validationReason', v_validation_reason,
    'status', CASE
      WHEN v_requires_validation THEN 'validando'
      WHEN p_payment_intent = 'prepaid' THEN 'awaiting_payment'
      ELSE 'pending_acceptance'
    END));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created', 'customer', p_customer_user_id,
    jsonb_build_object('source', p_source, 'paymentIntent', p_payment_intent));

  RETURN (
    SELECT jsonb_build_object(
      'id', id, 'shortId', short_id, 'orderNumber', order_number, 'status', status,
      'requiresValidation', requires_validation, 'validationReason', validation_reason,
      'orderAmount', order_amount, 'deliveryFee', delivery_fee, 'total', order_amount + delivery_fee
    ) FROM public.orders WHERE id = v_order_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb, text, text,
  numeric, numeric, public.order_source, numeric, double precision, double precision,
  double precision, numeric, text) TO service_role;
