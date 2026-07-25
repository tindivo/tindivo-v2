-- =============================================================================
-- 0080 · Validaciones de pedido manual (blacklist, referencia, formato de teléfono y pago en enteros)
-- =============================================================================

-- 1. Limpieza dinámica por catálogo para evitar sobrecarga de firmas antiguas en pg_proc
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'create_business_manual_order'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

-- 2. Definición limpia de RPC create_business_manual_order
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
BEGIN
  SELECT * INTO v_business FROM public.businesses WHERE user_id = p_business_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no encontrado' USING errcode = 'P0002'; END IF;
  IF v_business.is_blocked THEN RAISE EXCEPTION 'Tu cuenta esta suspendida' USING errcode = 'P0001'; END IF;
  IF NOT v_business.is_active THEN RAISE EXCEPTION 'Negocio inactivo' USING errcode = 'P0001'; END IF;
  IF COALESCE(p_order_amount, 0) <= 0 THEN RAISE EXCEPTION 'Monto invalido' USING errcode = 'P0001'; END IF;

  -- 1. Validar referencia condicional a delivery_method
  IF p_delivery_method = 'delivery' AND length(trim(COALESCE(p_delivery_reference, ''))) < 5 THEN
    RAISE EXCEPTION 'La dirección o referencia de entrega debe tener al menos 5 caracteres' USING errcode = 'P0001';
  END IF;

  -- 2. Normalizar teléfono (dígitos limpios) y validar formato
  v_clean_phone := NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g'), '');
  IF v_clean_phone IS NOT NULL AND v_clean_phone !~ '^9\d{8}$' THEN
    RAISE EXCEPTION 'Formato de teléfono inválido' USING errcode = 'P0001';
  END IF;

  -- 3. Validar blacklist de teléfonos de prueba (Ref: BLACKLISTED_PHONES en @tindivo/contracts)
  IF v_clean_phone IS NOT NULL AND v_clean_phone IN (
    '999999999', '987654321', '912345678', '955555555', '900000000', '911111111', '123456789'
  ) THEN
    RAISE EXCEPTION 'Número de teléfono de prueba no permitido' USING errcode = 'P0001';
  END IF;

  -- 4. Antifraude del cliente
  IF v_clean_phone IS NOT NULL AND public.customer_is_blocked(NULL, v_clean_phone) THEN
    RAISE EXCEPTION 'Cliente temporalmente bloqueado por incidentes reiterados de entrega.'
      USING errcode = 'P0001';
  END IF;

  IF p_payment_intent <> 'prepaid'
     AND public.customer_requires_prepayment(NULL, v_clean_phone, NULLIF(p_delivery_reference, '')) THEN
    RAISE EXCEPTION 'Este cliente requiere pago anticipado por politicas del servicio.'
      USING errcode = 'P0001';
  END IF;

  -- 5. Validación de pago mixto con aritmética entera en centavos
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

  -- 6. Validar vuelto suficiente sin absorber el error
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
