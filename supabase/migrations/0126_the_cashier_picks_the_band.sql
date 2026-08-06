-- =============================================================================
-- 0126 · La cajera elige la banda, y el envío del pedido manual la respeta
-- =============================================================================
--
-- Spec: Docs/spec/spec-fase-2-ledger-y-sprint.md, PARTE D — con el alcance
-- CORREGIDO tras el reconocimiento. Dos cosas que el spec daba por sentadas
-- resultaron falsas al medirlas contra prod; van explicadas abajo.
--
-- Requisito previo: 0124 y 0125 aplicadas y verificadas en prod.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE ARREGLA, Y QUE EL SPEC NO HABÍA VISTO
--
--   El pedido manual cobraba el envío SIEMPRE de `delivery_bands.near`:
--
--       v_delivery_fee := COALESCE((v_bands ->> 'near')::numeric, …);
--
--   Literal, sin variable. Daba igual a dónde fuera el pedido: S/ 2.00. Añadir
--   `p_delivery_distance_band` sin tocar esa línea habría dado a la cajera dos
--   botones decorativos — marcaría "Lejos" y el cliente seguiría pagando 2.00.
--   Por eso esta migración cambia el cálculo, no solo la firma.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 EL PEDIDO MANUAL SÍ ADMITE `pickup` — el spec asumía que no
--
--   El cuerpo de 0117 lo trata explícitamente en tres sitios: envío 0,
--   `delivery_address = 'Recojo en tienda'` y `delivery_reference = NULL`.
--   O sea que el caso "pickup + banda" existe de verdad y hay que decidirlo.
--
--   Decisión: en `pickup` la banda se IGNORA, `delivery_distance_band` queda
--   NULL y `delivery_fee_source` = 'system'. No se lanza excepción. Razones:
--     · El recojo no tiene banda — el cliente va al local. Escribir 'near'
--       sería meter un dato falso en los reportes.
--     · Rechazar con P0001 sería una vía de error NUEVA para un parámetro que
--       no cambia ni un céntimo. Ignorarlo es lo reversible.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- `delivery_fee_source` — columna que YA EXISTÍA y que nadie escribía
--
--   `orders.delivery_fee_source text`, con
--       CHECK (delivery_fee_source IS NULL
--              OR delivery_fee_source = ANY (ARRAY['business','system']))
--
--   Barrido sobre `pg_get_functiondef` de todo `public`: CERO funciones vivas
--   la referencian. Estaba definida y muerta. Esta migración es la primera que
--   la escribe, y usa exactamente los dos valores que el CHECK admite.
--
--     'business' -> una persona del negocio eligió la banda.
--     'system'   -> nadie eligió: cayó al default, o es un recojo.
--
--   Ese par es lo que hace auditable la diferencia entre "la cajera dijo que
--   era lejos" y "nadie dijo nada y asumimos cerca".
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ HAY `DROP FUNCTION` Y NO SOLO `CREATE OR REPLACE`
--
--   La firma cambia (12 -> 13 argumentos). En Postgres eso NO reemplaza: crea
--   una función NUEVA y deja viva la vieja, con dos consecuencias, las dos ya
--   sufridas en este repo:
--     1. Sobrecarga ambigua: la llamada existente de 12 args seguiría
--        resolviendo a la vieja, y la banda no llegaría nunca. Es exactamente
--        lo que pasó con `register_appeal_refund` en 0073 y 0077.
--     2. ACL por defecto: la función nueva nace con EXECUTE para PUBLIC.
--   Por eso: DROP explícito de la firma vieja + REVOKE/GRANT de la nueva, en
--   este mismo archivo. REGLA de Docs/RIESGOS-LEDGER.md, sin excepción.
--
--   ACL real leída de prod ANTES de esta migración:
--     {postgres=X/postgres, service_role=X/postgres, supabase_auth_admin=X/postgres}
--   service_role=true · anon=false · authenticated=false.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MÉTODO DEL CUERPO
--
--   Generado desde el texto EXACTO de 0117 (líneas 431-548, la definición viva
--   en prod, md5 c59429138c3f557dc0ec3ea74c3eb444) con SIETE sustituciones,
--   cada una verificada por aserción de ocurrencia única: firma, DECLARE,
--   bloque del envío, columnas del INSERT, valores del INSERT, payload de
--   `domain_events` y payload de `order_event_log`. Una aserción extra
--   comprueba que no sobrevive `(v_bands ->> 'near')::numeric` y que
--   `v_fee_source` solo toma valores admitidos por el CHECK.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ DEUDA QUE ESTA MIGRACIÓN NO RESUELVE — `p_notes` SIGUE MUERTO
--
--   `p_notes text DEFAULT NULL` está en la firma desde 0080 y el endpoint lo
--   envía en cada llamada, pero EL CUERPO NO LO REFERENCIA NI UNA VEZ. Lo que
--   la cajera escriba en "notas" se descarta en silencio, y lleva así seis
--   migraciones.
--
--   Se conserva tal cual, a propósito: decidir si se conecta a una columna o
--   se borra de la firma es una decisión de producto aparte, y meterla aquí
--   mezclaría dos cambios de firma en una sola migración. Queda anotado como
--   pendiente explícito.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE
--
--   No construye la UI de los dos botones — eso es la Parte E.
--   No toca `advance_order`: ya lee `orders.delivery_distance_band` por su
--   COALESCE, así que empieza a recibir la banda de la cajera sin cambios.
--   No toca `commissions` ni el ledger.
--
-- =============================================================================


-- ── 1 · Fuera la firma vieja de 12 argumentos --------------------------------
-- Firma confirmada contra prod justo antes de escribir esto:
--   create_business_manual_order(uuid, delivery_method, payment_intent, numeric,
--     text, text, integer, text, text, numeric, numeric, numeric)
DROP FUNCTION IF EXISTS public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, text, numeric, numeric, numeric);


-- ── 2 · La firma nueva, de 13 argumentos -------------------------------------
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


-- ── 3 · Grants ---------------------------------------------------------------
-- El paso más frágil de esta migración. La firma CAMBIÓ, así que la ACL NO se
-- hereda: sin estas dos líneas la función nueva queda ejecutable por PUBLIC.
-- Es el patrón que ya mordió tres veces en este repo (R-L3, M-5, M-6).
--
-- `supabase_auth_admin` no se re-otorga: era un grant de plataforma sobre la
-- función vieja, no algo que este RPC necesite. La nueva queda estrictamente
-- con lo que usa: service_role, que es como la llama el API.
REVOKE ALL ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, text, numeric, numeric, numeric, public.distance_band)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, text, numeric, numeric, numeric, public.distance_band)
  TO service_role;


-- ── 4 · Guard: que no queden dos sobrecargas vivas ---------------------------
-- Si el DROP del paso 1 fallara en silencio, PostgREST tendría dos candidatas y
-- la llamada de 12 argumentos seguiría resolviendo a la vieja: la banda no
-- llegaría nunca y nadie se enteraría. Esto lo convierte en un fallo ruidoso
-- en el momento de aplicar, que es cuando se puede arreglar barato.
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      '0126 abortada: quedan % sobrecargas de create_business_manual_order, se esperaba exactamente 1',
      v_n USING errcode = 'P0001';
  END IF;
END $$;
