-- 0163 · Permitir pedidos manuales a negocios desactivados (inactivos).
--
-- Un negocio "Desactivado" (is_active = false) no aparece ni acepta pedidos
-- de clientes en la app web de cara al público (customer), pero la cajera
-- del restaurante SÍ puede seguir creando sus pedidos manuales (por teléfono / mostrador)
-- en el dashboard de negocios. Solo se bloquea si está suspendido (is_blocked = true).

CREATE OR REPLACE FUNCTION public.create_business_manual_order(
  p_business_user_id uuid,
  p_delivery_method public.delivery_method,
  p_payment_intent public.payment_intent,
  p_total_amount numeric,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_prep_time_minutes integer DEFAULT 20,
  p_delivery_reference text DEFAULT NULL,
  p_client_pays_with numeric DEFAULT NULL,
  p_yape_amount numeric DEFAULT NULL,
  p_cash_amount numeric DEFAULT NULL,
  p_delivery_distance_band public.distance_band DEFAULT NULL,
  p_address_directory_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_business public.businesses%ROWTYPE;
  v_order_id uuid;
  v_short_id text;
  v_order_number int;
  v_delivery_fee numeric;
  v_order_amount numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
  v_clean_phone text;
  v_band public.distance_band;
  v_fee_source text;
  -- 0145 · directorio
  v_ref_clean text;
  v_ref_norm text;
  v_dir_id uuid;
  v_dir_lat double precision;
  v_dir_lng double precision;
  v_dir_created boolean := false;
  v_has_default boolean;
BEGIN
  SELECT * INTO v_business FROM public.businesses WHERE user_id = p_business_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no encontrado' USING errcode = 'P0002'; END IF;
  -- Solo se bloquea si la cuenta está suspendida por administración
  IF v_business.is_blocked THEN RAISE EXCEPTION 'Tu cuenta esta suspendida' USING errcode = 'P0001'; END IF;

  -- Guard de entrada. El que de verdad importa —que quede comida después de
  -- restar el envío— no puede evaluarse todavía: la banda aún no se resolvió.
  -- Va más abajo, justo después del envío.
  IF COALESCE(p_total_amount, 0) <= 0 THEN RAISE EXCEPTION 'Monto invalido' USING errcode = 'P0001'; END IF;

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
    v_band := NULL;
    v_fee_source := 'system';
    v_delivery_fee := 0;
  ELSE
    IF p_delivery_distance_band IS NULL THEN
      v_band := 'near'::public.distance_band;
      v_fee_source := 'system';
    ELSE
      v_band := p_delivery_distance_band;
      v_fee_source := 'business';
    END IF;

    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
    v_delivery_fee := COALESCE(
      (v_bands ->> v_band::text)::numeric,
      v_business.delivery_fee,
      2.00
    );
  END IF;

  -- 0129 · Aquí se invierte el cálculo: la comida se DEDUCE del total.
  v_order_amount := round(p_total_amount - v_delivery_fee, 2);

  IF v_order_amount <= 0 THEN
    RAISE EXCEPTION 'El total (S/ %) debe ser mayor que el envío (S/ %)',
      to_char(p_total_amount, 'FM999999990.00'), to_char(v_delivery_fee, 'FM999999990.00')
      USING errcode = 'P0001';
  END IF;

  IF p_payment_intent = 'pending_mixed' THEN
    v_cash_part := COALESCE(p_cash_amount, 0);
    IF COALESCE(p_yape_amount, 0) + v_cash_part <> p_total_amount THEN
      RAISE EXCEPTION 'La suma de Yape y Efectivo debe ser igual al total' USING errcode = 'P0001';
    END IF;
  ELSE
    v_cash_part := CASE WHEN p_payment_intent = 'pending_cash' THEN p_total_amount ELSE 0 END;
  END IF;

  IF (p_payment_intent = 'pending_cash' OR p_payment_intent = 'pending_mixed') AND p_client_pays_with IS NOT NULL THEN
    IF p_client_pays_with < v_cash_part THEN
      RAISE EXCEPTION 'El monto con el que pagará el cliente debe cubrir la parte en efectivo' USING errcode = 'P0001';
    END IF;
    v_change := round(p_client_pays_with - v_cash_part, 2);
  ELSE
    v_change := 0;
  END IF;

  -- ═══ 0145 · Resolver la fila del directorio ════════════════════════════════
  v_ref_clean := NULLIF(trim(COALESCE(p_delivery_reference, '')), '');

  IF p_delivery_method = 'delivery'
     AND v_clean_phone IS NOT NULL
     AND v_ref_clean IS NOT NULL THEN

    IF p_address_directory_id IS NOT NULL THEN
      SELECT ad.id, ad.lat, ad.lng INTO v_dir_id, v_dir_lat, v_dir_lng
        FROM public.address_directory ad
       WHERE ad.id = p_address_directory_id
         AND ad.phone = v_clean_phone;
    END IF;

    IF v_dir_id IS NULL THEN
      v_ref_norm := lower(btrim(regexp_replace(v_ref_clean, '\s+', ' ', 'g')));

      SELECT ad.id, ad.lat, ad.lng INTO v_dir_id, v_dir_lat, v_dir_lng
        FROM public.address_directory ad
       WHERE ad.phone = v_clean_phone
         AND lower(btrim(regexp_replace(ad.reference, '\s+', ' ', 'g'))) = v_ref_norm
       ORDER BY ad.is_default DESC, ad.last_used_at DESC NULLS LAST
       LIMIT 1;
    END IF;

    IF v_dir_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.address_directory
         WHERE phone = v_clean_phone AND is_default
      ) INTO v_has_default;

      INSERT INTO public.address_directory (
        phone, customer_name, reference, source, is_default, updated_by
      ) VALUES (
        v_clean_phone,
        NULLIF(trim(COALESCE(p_customer_name, '')), ''),
        v_ref_clean,
        'business_created',
        NOT v_has_default,
        p_business_user_id
      ) RETURNING id INTO v_dir_id;

      v_dir_created := true;
    END IF;

    UPDATE public.address_directory
       SET times_used = times_used + 1,
           last_used_at = now()
     WHERE id = v_dir_id;
  END IF;

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, prep_time_minutes,
    estimated_ready_at, appears_in_queue_at,
    client_pays_with, yape_amount, cash_amount, change_to_give,
    delivery_distance_band, delivery_fee_source,
    address_directory_id, delivery_coordinates_lat, delivery_coordinates_lng
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''), v_clean_phone,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Recojo en tienda' ELSE 'Pedido manual' END,
    CASE WHEN p_delivery_method = 'pickup' THEN NULL ELSE NULLIF(trim(COALESCE(p_delivery_reference, '')), '') END,
    v_order_amount, v_delivery_fee, 'preparing', v_prep,
    now() + (v_prep || ' minutes')::interval,
    now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
    p_client_pays_with, p_yape_amount, p_cash_amount,
    CASE WHEN p_client_pays_with IS NOT NULL AND v_cash_part > 0 THEN v_change ELSE NULL END,
    v_band, v_fee_source,
    v_dir_id,
    v_dir_lat::numeric, v_dir_lng::numeric
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id,
    'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'totalCharged', p_total_amount,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'source', 'business_manual', 'prepTimeMinutes', v_prep,
    'clientPaysWith', p_client_pays_with, 'yapeAmount', p_yape_amount, 'cashAmount', p_cash_amount,
    'band', v_band, 'deliveryFeeSource', v_fee_source,
    'addressDirectoryId', v_dir_id, 'addressCreated', v_dir_created,
    'hasGps', (v_dir_lat IS NOT NULL)
  ));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created_manual', 'business', p_business_user_id,
    jsonb_build_object(
      'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
      'amount', v_order_amount, 'totalCharged', p_total_amount, 'band', v_band,
      'deliveryFee', v_delivery_fee, 'deliveryFeeSource', v_fee_source,
      'addressDirectoryId', v_dir_id, 'addressCreated', v_dir_created
    ));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'preparing',
    'total', p_total_amount,
    'change', v_change,
    'addressDirectoryId', v_dir_id,
    'addressCreated', v_dir_created
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text,
  integer, text, numeric, numeric, numeric, public.distance_band, uuid
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text,
  integer, text, numeric, numeric, numeric, public.distance_band, uuid
) TO service_role;

-- ─── Guards ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count int;
  v_def text;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_count <> 1 THEN
    RAISE EXCEPTION '0163 abortada: hay % firmas de create_business_manual_order, debe haber 1', v_count
      USING errcode = 'P0001';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_def NOT LIKE '%change_to_give%' THEN
    RAISE EXCEPTION '0163 abortada: la definición no escribe change_to_give' USING errcode = 'P0001';
  END IF;

  IF v_def NOT LIKE '%address_directory_id%' THEN
    RAISE EXCEPTION '0163 abortada: la definición no escribe address_directory_id' USING errcode = 'P0001';
  END IF;

  IF v_def NOT LIKE '%delivery_coordinates_lat%' THEN
    RAISE EXCEPTION '0163 abortada: la definición no copia las coordenadas' USING errcode = 'P0001';
  END IF;
END $$;
