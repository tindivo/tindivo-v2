-- =============================================================================
-- 0106 · El pedido manual nace en 'preparing', no en 'confirmed'
-- =============================================================================
--
-- QUÉ HACE
-- create_business_manual_order insertaba el pedido con status = 'confirmed' y
-- solo prep_time_minutes, sin estimated_ready_at ni appears_in_queue_at. Esta
-- migración lo hace nacer en 'preparing' con los dos relojes calculados.
--
-- POR QUÉ
-- El pedido manual sufría el mismo defecto que el prepago: se guardaba el
-- tiempo de cocción y no se arrancaba el reloj. Consecuencias medidas:
--
--   1. La tarjeta de `negocios` mostraba "Cocinando · 0m restantes", porque
--      getUiState mapea 'confirmed' a 'cooking' y minutesLeft cae a null.
--   2. La RLS del motorizado exige 'waiting_driver', así que el pedido nunca
--      era visible en el pool.
--   3. No había salida: la UI de /nuevo hace UNA sola llamada y redirige, y
--      no existe ningún botón que lleve un 'confirmed' a 'preparing'. La
--      acción 'preparing' de advance_order existe pero nadie la invoca fuera
--      del handler de aceptación de contraentrega. El pedido quedaba muerto,
--      solo cancelable.
--
-- La cajera crea y acepta en el mismo acto, así que no hay estado intermedio
-- que representar: 'preparing' es el estado correcto desde el INSERT.
-- p_prep_time_minutes ya viajaba como parámetro (default 20, acotado 5..120).
--
-- preparing_at lo puebla el trigger orders_before_write, que ya contempla
-- 'preparing' en su CASE y dispara también en INSERT.
--
-- Con esto, los escritores de orders.status = 'confirmed' que quedan son los
-- de advance_order y validate_order, que se cierran en su propia parte.
--
-- El cuerpo se reproduce desde la definición viva; el único cambio es el
-- INSERT y el status devuelto.

CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_order_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- 3. Validar blacklist de teléfonos de prueba
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

  v_prep := greatest(5, least(COALESCE(p_prep_time_minutes, 20), 120));

  IF p_delivery_method = 'pickup' THEN
    v_delivery_fee := 0;
  ELSE
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
    v_delivery_fee := COALESCE((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  END IF;

  IF p_payment_intent = 'pending_mixed' THEN
    v_cash_part := COALESCE(p_cash_amount, 0);
    IF COALESCE(p_yape_amount, 0) + v_cash_part <> p_order_amount + v_delivery_fee THEN
      RAISE EXCEPTION 'La suma de Yape y Efectivo debe ser igual al total' USING errcode = 'P0001';
    END IF;
  ELSE
    v_cash_part := CASE WHEN p_payment_intent = 'pending_cash' THEN p_order_amount + v_delivery_fee ELSE 0 END;
  END IF;

  IF (p_payment_intent = 'pending_cash' OR p_payment_intent = 'pending_mixed') AND p_client_pays_with IS NOT NULL THEN
    IF p_client_pays_with < v_cash_part THEN
      RAISE EXCEPTION 'El monto con el que pagará el cliente debe cubrir la parte en efectivo' USING errcode = 'P0001';
    END IF;
    v_change := round(p_client_pays_with - v_cash_part, 2);
  ELSE
    v_change := 0;
  END IF;

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, prep_time_minutes,
    estimated_ready_at, appears_in_queue_at,
    client_pays_with, yape_amount, cash_amount
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''), v_clean_phone,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Recojo en tienda' ELSE 'Pedido manual' END,
    CASE WHEN p_delivery_method = 'pickup' THEN NULL ELSE NULLIF(trim(COALESCE(p_delivery_reference, '')), '') END,
    p_order_amount, v_delivery_fee, 'preparing', v_prep,
    -- El reloj arranca aquí: la cajera crea y acepta en el mismo acto.
    now() + (v_prep || ' minutes')::interval,
    -- Ventana de cola: se abre cuando quedan 10 minutos RESTANTES.
    -- El 10 sale literal, igual que en advance_order; se centraliza en app_settings después.
    now() + (greatest(0, v_prep - 10) || ' minutes')::interval,
    p_client_pays_with, p_yape_amount, p_cash_amount
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id,
    'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'source', 'business_manual', 'prepTimeMinutes', v_prep,
    'clientPaysWith', p_client_pays_with, 'yapeAmount', p_yape_amount, 'cashAmount', p_cash_amount
  ));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created_manual', 'business', p_business_user_id,
    jsonb_build_object('deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent, 'amount', p_order_amount));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'preparing',
    'total', p_order_amount + v_delivery_fee,
    'change', v_change
  );
END;
$function$

;

-- Los grants se re-aplican por seguridad: CREATE OR REPLACE los preserva, pero
-- dejarlo explícito hace la migración reproducible desde cero.
REVOKE EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text,
  integer, text, text, numeric, numeric, numeric
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text,
  integer, text, text, numeric, numeric, numeric
) TO service_role;
