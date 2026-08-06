-- =============================================================================
-- ROLLBACK de la migración 0127
-- =============================================================================
--
-- 0127 · Fuera `p_notes`, que nunca hizo nada.
--
-- Devuelve la firma de 13 argumentos con `p_notes` en su sitio. El cuerpo es el
-- mismo en las dos versiones: lo único que 0127 cambió fue la línea de la firma.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — PRIMERO EL CÓDIGO, DESPUÉS LA BASE
--
--       git revert <sha-del-commit-de-0127>
--
--   Cubre:
--       supabase/migrations/0127_p_notes_never_did_anything.sql
--       apps/api/app/api/v1/business/orders/route.ts
--       packages/supabase/src/database.types.ts
--
--   Aquí el orden importa MENOS que en 0126, y conviene saber por qué: si se
--   revierte solo el esquema, el endpoint deja de mandar `p_notes` a una función
--   que lo acepta como opcional con DEFAULT NULL. No rompe nada — simplemente
--   vuelve a llegar NULL, que es lo que llegaba siempre en la práctica. Aun así
--   se revierte el código, para que firma y llamada digan lo mismo.
--
-- PASO 2 — el SQL de abajo, en una sola transacción.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTE ROLLBACK NO RECUPERA DATOS, PORQUE NO LOS HABÍA
--
--   `p_notes` nunca escribió en ninguna columna. No hay nada que restaurar
--   salvo la forma de la firma. Ningún pedido creado bajo 0127 perdió
--   información: no había información que perder.
--
-- =============================================================================

BEGIN;

-- ── 1 · Fuera la firma de 12 argumentos --------------------------------------
DROP FUNCTION IF EXISTS public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band);


-- ── 2 · La firma de 13 argumentos, tal como vivía antes de 0127 --------------
-- Copia literal del bloque de
-- supabase/migrations/0126_the_cashier_picks_the_band.sql (líneas 116-273),
-- que era la definición viva en prod, md5 d0cd72f0123aa88c8ee8abcb3d3b4595.
CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_order_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric, p_delivery_distance_band public.distance_band DEFAULT NULL::public.distance_band)
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

  -- 0126 · La banda la elige la cajera, y el envío la respeta.
  --
  -- ANTES (0117): el envío salía SIEMPRE de `delivery_bands.near`, sin importar
  -- a dónde iba el pedido. Un reparto lejano le cobraba al cliente lo mismo que
  -- uno cercano y no había forma de decir lo contrario. Ahora manda `v_band`.
  --
  -- `delivery_fee_source` distingue QUIÉN determinó el envío:
  --   'business' -> lo determinó una persona del negocio eligiendo la banda.
  --   'system'   -> cayó al default porque nadie eligió, o es un recojo.
  -- La OBLIGATORIEDAD de elegir vive en el Zod del endpoint, no aquí: el
  -- parámetro conserva DEFAULT NULL para que la firma aguante llamadas viejas
  -- sin reventar, pero esas llamadas quedan MARCADAS como 'system' en vez de
  -- confundirse con una elección real de la cajera.
  IF p_delivery_method = 'pickup' THEN
    -- El recojo NO tiene banda: el cliente va al local. Envío 0 por regla, no
    -- por elección de nadie. La banda queda NULL para no mentir en los
    -- reportes. Si llega una banda junto con 'pickup', se IGNORA a propósito:
    -- rechazarla sería una vía de error nueva para un dato que no cambia nada.
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
    -- El reloj arranca aquí: la cajera crea y acepta en el mismo acto.
    now() + (v_prep || ' minutes')::interval,
    -- Ventana de cola: se abre cuando quedan 10 minutos RESTANTES.
    -- El 10 sale literal, igual que en advance_order; se centraliza en app_settings después.
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


-- ── 3 · Grants originales ----------------------------------------------------
-- La ACL exacta que tenía la firma de 13 argumentos antes de 0127:
--   {postgres=X/postgres, service_role=X/postgres}
REVOKE ALL ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, text, numeric, numeric, numeric, public.distance_band)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, text, numeric, numeric, numeric, public.distance_band)
  TO service_role;

COMMIT;


-- ── 4 · Verificación tras el rollback ----------------------------------------
--   SELECT p.oid::regprocedure, has_function_privilege('service_role', p.oid, 'EXECUTE'),
--          has_function_privilege('anon', p.oid, 'EXECUTE')
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname='public' AND p.proname='create_business_manual_order';
--     -> UNA fila, 13 argumentos, service_role=true, anon=false
--
--   SELECT pg_get_functiondef(oid) LIKE '%p_notes%'
--     FROM pg_proc WHERE proname='create_business_manual_order' AND prokind='f';
--     -> true  (vuelve a estar, y vuelve a no hacer nada)
