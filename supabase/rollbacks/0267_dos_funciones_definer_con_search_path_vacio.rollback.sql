-- ROLLBACK de la 0267 · devuelve las dos funciones DEFINER a su search_path anterior
--
-- Restaura los cuerpos y el `SET search_path` exactos que dejaron la 0090 (`handle_new_user`:
-- `public, pg_catalog`) y la 0190 (`create_business_manual_order`: `public, pg_temp`).
-- OJO: esto REABRE el incumplimiento del invariante 3 (search_path con `public` en una
-- función SECURITY DEFINER). Úsese solo si la 0267 rompe algo y mientras se corrige.
-- Misma firma (CREATE OR REPLACE, sin sobrecargas) y mismos permisos: postgres y service_role.


CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_total_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric, p_delivery_distance_band distance_band DEFAULT NULL::distance_band, p_address_directory_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'

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
  v_money jsonb;
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

  -- 0190 · La partición del total y la cadena de efectivo viven en UN solo
  -- sitio, compartido con `update_business_manual_order`. Si esta función y la
  -- de edición validaran por separado, la vía de edición acabaría aceptando lo
  -- que la de creación rechaza, y en silencio. Ver la cabecera de 0190.
  --
  -- El envío NO entra en el helper: aquí sale de la banda que se acaba de
  -- resolver, y en la edición sale de la fila (la cajera no puede cambiarlo).
  -- Esa es justo la diferencia entre las dos vías, y por eso es un parámetro.
  v_money := public.manual_order_money(
    p_total_amount, v_delivery_fee, p_payment_intent,
    p_client_pays_with, p_yape_amount, p_cash_amount
  );
  v_order_amount := (v_money ->> 'orderAmount')::numeric;
  v_cash_part    := (v_money ->> 'cashPart')::numeric;
  -- Ya viene resuelto a NULL cuando no hay vuelto que dar: la regla de cuándo
  -- se guarda y cuándo no también vive en el helper, no repartida por aquí.
  v_change       := (v_money ->> 'changeToGive')::numeric;

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
    v_change,
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'

AS $function$
DECLARE
  v_raw text;
  v_role public.user_role;
  v_email text;
  v_full_name text;
BEGIN
  v_raw := new.raw_app_meta_data ->> 'primary_role';
  IF v_raw IS NULL OR v_raw NOT IN ('customer', 'business', 'driver', 'admin') THEN
    v_role := 'customer'::public.user_role;
  ELSE
    v_role := v_raw::public.user_role;
  END IF;

  v_email := new.email;
  v_full_name := COALESCE(new.raw_user_meta_data ->> 'full_name', v_email, 'Usuario');

  IF v_email IS NOT NULL THEN
    INSERT INTO public.users (id, email, full_name, primary_role, is_active)
    VALUES (new.id, v_email, v_full_name, v_role, true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, v_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, integer, text,
  numeric, numeric, numeric, public.distance_band, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text, text, integer, text,
  numeric, numeric, numeric, public.distance_band, uuid
) TO service_role;

DO $check$
DECLARE
  v_name text;
  n int;
  v_cfg text[];
BEGIN
  FOREACH v_name IN ARRAY ARRAY['handle_new_user', 'create_business_manual_order'] LOOP
    SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
     WHERE s.nspname = 'public' AND p.proname = v_name;
    IF n <> 1 THEN
      RAISE EXCEPTION 'rollback 0267 abortado: se esperaba UNA sola % y hay %', v_name, n;
    END IF;
  END LOOP;
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = 'public.handle_new_user()'::regprocedure;
  IF v_cfg IS DISTINCT FROM ARRAY['search_path=public, pg_catalog'] THEN
    RAISE EXCEPTION 'rollback 0267 abortado: handle_new_user con proconfig %', v_cfg;
  END IF;
END
$check$;
