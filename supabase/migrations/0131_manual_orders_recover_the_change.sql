-- =============================================================================
-- 0131 · El pedido manual vuelve a guardar el vuelto
-- =============================================================================
--
-- REGRESIÓN, no un olvido. `create_business_manual_order` escribía
-- `change_to_give` hasta la 0082. La 0092 (`remove_platform_schedule_guard`)
-- reprodujo el cuerpo de la función para quitar un guard y se dejó la columna
-- por el camino. Desde entonces —0092, 0106, 0117, 0126, 0127, 0129— cada
-- reproducción arrastró la omisión sin que nadie la viera.
--
-- CONSECUENCIA MEDIDA. `change_to_give` llega NULL en TODO pedido manual, y hoy
-- el 100% de los pedidos del piloto son manuales. Seis pantallas leen esa
-- columna y todas mienten:
--
--   apps/motorizados/components/order/money-card.tsx:76   -> oculta el aviso
--   apps/motorizados/components/order/collect-card.tsx:37 -> oculta el aviso
--   apps/motorizados/components/order/status-hero.tsx:69  -> "vuelto S/ 0.00"
--   apps/admin/app/orders/page.tsx:124                    -> "S/ 0.00"
--   apps/admin/app/orders/[id]/page.tsx:163               -> "vuelto S/ 0.00"
--   apps/customer/.../tracking-items.tsx:61               -> oculta el aviso
--
-- El caso real: pedido de S/ 24.00, el cliente paga con S/ 30.00. La pantalla
-- que el motorizado mira antes de salir dice "COBRAS AL ENTREGAR S/ 24.00 ·
-- Efectivo" y NO menciona los S/ 6.00 de vuelto. Llega sin sencillo.
--
-- POR QUÉ SE ARREGLA EN LA FUNCIÓN Y NO EN CADA PANTALLA.
-- Parchear seis sitios en cliente deja el dato mal en la base para siempre:
-- reportes, apelaciones y cualquier consumidor futuro seguirían leyendo NULL.
-- Y `create_customer_order` SÍ la escribe (0042/0056/0057/0062), así que el
-- checkout del cliente y el pedido manual llevan divergiendo desde la 0092.
--
-- POR QUÉ NO UNA COLUMNA GENERADA.
-- Se evaluó `GENERATED ALWAYS AS`. Se descartó: `create_customer_order` INSERTA
-- en `change_to_give`, y una columna generada no admite escritura — la habría
-- roto.
--
-- MÉTODO.
-- Cuerpo reproducido desde `pg_get_functiondef` de la definición viva (0129)
-- para no reescribirlo a mano. El ÚNICO cambio es añadir la columna al INSERT.
-- La firma no cambia, así que basta `CREATE OR REPLACE` y los grants sobreviven
-- (a diferencia de 0126/0127/0129, que soltaban la función).
--
-- El valor replica la semántica EXACTA de la 0082: NULL cuando no hay parte en
-- efectivo —"no aplica"— y no 0, que significaría "no hay vuelto". Es también
-- lo que asume `apps/motorizados/lib/payment.ts`.
--
-- SIN BACKFILL A PROPÓSITO. En producción no hay ni una fila con
-- `client_pays_with` no nulo (medido: 0 de 5), así que no hay nada que
-- reconstruir. Un UPDATE masivo sobre una columna que roza dinero, para cero
-- filas, es riesgo sin beneficio.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_total_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric, p_delivery_distance_band distance_band DEFAULT NULL::distance_band)
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
  v_order_amount numeric;
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

  -- 0129 · Aquí se invierte el cálculo: la comida se DEDUCE del total.
  --
  -- En recojo `v_delivery_fee` es 0, así que la comida es el total entero. No
  -- hay caso especial que escribir.
  --
  -- El `round(..., 2)` es defensivo, no decorativo: ambos operandos ya son
  -- numeric con dos decimales, pero `order_amount` es numeric(10,2) y redondear
  -- explícitamente deja el error visible AQUÍ —donde el mensaje puede decir algo
  -- útil— en vez de que lo silencie el INSERT.
  v_order_amount := round(p_total_amount - v_delivery_fee, 2);

  -- Un total que no cubre el envío dejaría comida <= 0. Antes de la 0129 esto
  -- era imposible por construcción (la comida se tecleaba y se validaba > 0);
  -- ahora es la vía de error natural —"pedí una gaseosa de 2 soles"— y merece un
  -- mensaje que diga el número, no un 'Monto invalido' genérico.
  IF v_order_amount <= 0 THEN
    RAISE EXCEPTION 'El total (S/ %) debe ser mayor que el envío (S/ %)',
      to_char(p_total_amount, 'FM999999990.00'), to_char(v_delivery_fee, 'FM999999990.00')
      USING errcode = 'P0001';
  END IF;

  -- Las dos comparaciones de pago van contra el TOTAL, que ahora es literalmente
  -- el número que la cajera tiene delante. Antes de la 0129 se comparaban contra
  -- la suma de la comida tecleada más el envío: el mismo importe, pero imposible
  -- de reproducir en pantalla sin conocer el envío. De ahí salían el pago mixto
  -- irrechazable y el vuelto inflado.
  --
  -- (El nombre del viejo parámetro no se escribe aquí a propósito: el guard 4b
  -- del final rastrea esa cadena sobre `pg_get_functiondef`, que incluye los
  -- comentarios del cuerpo. Mencionarlo aquí abortaría la migración.)
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

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, prep_time_minutes,
    estimated_ready_at, appears_in_queue_at,
    client_pays_with, yape_amount, cash_amount, change_to_give,
    delivery_distance_band, delivery_fee_source
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''), v_clean_phone,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Recojo en tienda' ELSE 'Pedido manual' END,
    CASE WHEN p_delivery_method = 'pickup' THEN NULL ELSE NULLIF(trim(COALESCE(p_delivery_reference, '')), '') END,
    v_order_amount, v_delivery_fee, 'preparing', v_prep,
    -- El reloj arranca aquí: la cajera crea y acepta en el mismo acto.
    now() + (v_prep || ' minutes')::interval,
    -- Ventana de cola: se abre cuando quedan 10 minutos RESTANTES.
    -- El 10 sale literal, igual que en advance_order; se centraliza en app_settings después.
    now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
    p_client_pays_with, p_yape_amount, p_cash_amount,
    -- 0131: semantica EXACTA de la 0082, la ultima version sana. NULL cuando no
    -- hay parte en efectivo ("no aplica"), no 0 ("no hay vuelto").
    CASE WHEN p_client_pays_with IS NOT NULL AND v_cash_part > 0 THEN v_change ELSE NULL END,
    v_band, v_fee_source
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  -- `orderAmount` conserva su significado de siempre —la comida— para no romper
  -- a ningún consumidor del evento. Se añade `totalCharged` porque a partir de
  -- ahora ES el dato tecleado, y una auditoría querrá distinguir lo que dijo la
  -- persona de lo que dedujo la función.
  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id,
    'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'totalCharged', p_total_amount,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'source', 'business_manual', 'prepTimeMinutes', v_prep,
    'clientPaysWith', p_client_pays_with, 'yapeAmount', p_yape_amount, 'cashAmount', p_cash_amount,
    'band', v_band, 'deliveryFeeSource', v_fee_source
  ));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created_manual', 'business', p_business_user_id,
    jsonb_build_object(
      'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
      'amount', v_order_amount, 'totalCharged', p_total_amount, 'band', v_band,
      'deliveryFee', v_delivery_fee, 'deliveryFeeSource', v_fee_source
    ));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'preparing',
    'total', p_total_amount,
    'change', v_change
  );
END;
$function$;


-- ── Guard: que la columna quede de verdad en la definición ───────────────────
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_def NOT LIKE '%change_to_give%' THEN
    RAISE EXCEPTION '0131 abortada: la definición no escribe change_to_give'
      USING errcode = 'P0001';
  END IF;
END $$;
