-- =============================================================================
-- ROLLBACK de la migración 0129
-- =============================================================================
--
-- 0129 · La cajera teclea el TOTAL, y la comida se deduce.
--
-- Devuelve la firma que tomaba la COMIDA (`p_order_amount`) y le volvía a sumar
-- el envío por dentro. El cuerpo que restaura este archivo es, línea por línea,
-- el que dejó la 0127.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ PASO 1 — PRIMERO EL CÓDIGO, Y AQUÍ EL ORDEN NO ES NEGOCIABLE
--
--       git revert <sha-del-commit-de-0129>
--
--   Cubre:
--       supabase/migrations/0129_the_cashier_types_the_total.sql
--       apps/api/app/api/v1/business/orders/route.ts
--       apps/negocios/features/nuevo/**  (formulario, selector de banda, hook)
--       packages/supabase/src/database.types.ts
--
--   POR QUÉ IMPORTA MÁS QUE EN 0127 O 0128: aquí un número cambia de
--   SIGNIFICADO, no de nombre. Si se revierte solo la base y el frontend sigue
--   mandando el total, la llamada falla en seco —`p_total_amount` ya no existe y
--   supabase-js llama por nombre de argumento— y la cajera no puede crear
--   pedidos. Es ruidoso, que es lo bueno; pero es una caída de servicio.
--
--   El escenario silencioso, y el que de verdad hay que evitar, es el inverso:
--   revertir el frontend a mano dejando la base en 0129 haría que un monto de
--   comida entrara como total y el pedido saliera S/2 BARATO, sin error ninguno.
--   Reviértanse los dos, en este orden, o ninguno.
--
-- PASO 2 — el SQL de abajo, en una sola transacción.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ PASA CON LOS PEDIDOS YA CREADOS BAJO LA 0129
--
--   NADA, y por diseño. La 0129 no cambió ni una columna ni un dato: en
--   `public.orders` siguen viviendo `order_amount` y `delivery_fee` por separado,
--   con la misma semántica de siempre. Lo único que cambió fue de dónde salía el
--   número de la comida —tecleado antes, deducido después—, y eso se decide en
--   el momento de crear el pedido y ya no vuelve a mirarse.
--
--   Así que las filas creadas bajo la 0129 son indistinguibles de las de antes y
--   este rollback NO tiene que tocarlas. El ledger, las apelaciones y los
--   reportes leen las mismas dos columnas que leían.
--
--   Lo ÚNICO que se pierde es `totalCharged` en los payloads de los pedidos
--   futuros (`domain_events` y `order_event_log`). Los eventos ya escritos lo
--   conservan; ningún consumidor lo lee todavía, se añadió para auditoría.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ LO QUE VUELVE A ROMPERSE AL REVERTIR — DICHO SIN ADORNOS
--
--   Estos dos defectos son ANTERIORES a la 0129 y se arreglaron de rebote al
--   invertir el cálculo. Revertir los devuelve:
--
--   1. El PAGO MIXTO vuelve a ser imposible de enviar: la pantalla exige
--      `billetera + efectivo = monto tecleado` y la función `= comida + envío`.
--      Ningún número satisface a las dos.
--
--   2. El VUELTO vuelve a mostrarse S/2 (o S/2.50) INFLADO, y un "paga con"
--      entre comida y comida+envío vuelve a reventar el POST.
--
--   Si se llega aquí por un problema con el envío deducido y NO por estos dos,
--   conviene preguntarse si el arreglo correcto no es hacia adelante.
--
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band);

CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_order_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric, p_delivery_distance_band public.distance_band DEFAULT NULL::public.distance_band)
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
  v_band public.distance_band;
  v_fee_source text;
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
    client_pays_with, yape_amount, cash_amount,
    delivery_distance_band, delivery_fee_source
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''), v_clean_phone,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Recojo en tienda' ELSE 'Pedido manual' END,
    CASE WHEN p_delivery_method = 'pickup' THEN NULL ELSE NULLIF(trim(COALESCE(p_delivery_reference, '')), '') END,
    p_order_amount, v_delivery_fee, 'preparing', v_prep,
    now() + (v_prep || ' minutes')::interval,
    now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
    p_client_pays_with, p_yape_amount, p_cash_amount,
    v_band, v_fee_source
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id,
    'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'source', 'business_manual', 'prepTimeMinutes', v_prep,
    'clientPaysWith', p_client_pays_with, 'yapeAmount', p_yape_amount, 'cashAmount', p_cash_amount,
    'band', v_band, 'deliveryFeeSource', v_fee_source
  ));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created_manual', 'business', p_business_user_id,
    jsonb_build_object(
      'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
      'amount', p_order_amount, 'band', v_band,
      'deliveryFee', v_delivery_fee, 'deliveryFeeSource', v_fee_source
    ));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'preparing',
    'total', p_order_amount + v_delivery_fee,
    'change', v_change
  );
END;
$function$;

-- La ACL no sobrevive al DROP. Misma lista de tipos que en 0127 y 0129.
REVOKE ALL ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band)
  TO service_role;

-- Guard: exactamente una sobrecarga viva.
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      'rollback 0129 abortado: quedan % sobrecargas de create_business_manual_order, se esperaba exactamente 1',
      v_n USING errcode = 'P0001';
  END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '0129';

COMMIT;
