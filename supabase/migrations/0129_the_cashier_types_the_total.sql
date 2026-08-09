-- =============================================================================
-- 0129 · La cajera teclea el TOTAL, y la comida se deduce
-- =============================================================================
--
-- SOLO PEDIDOS MANUALES. El checkout del cliente pasa por `create_customer_order`,
-- donde el monto sale del carrito y nadie lo teclea. Esta migración no lo toca.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA — UN NÚMERO QUE SIGNIFICABA DOS COSAS
--
--   La pantalla de `apps/negocios` rotulaba su input "Total del pedido (S/)" y
--   lo mandaba como `p_order_amount`, que en este RPC significa COMIDA. El envío
--   se sumaba encima:
--
--       total real cobrado = p_order_amount + v_delivery_fee
--
--   La cajera de La Florencia ya tiene el hábito de decir el total con envío
--   incluido —"son 27"— porque es lo que le dice al cliente por teléfono. Al
--   escribir 27 en un campo que el backend lee como comida, el pedido salía a
--   29. La pantalla y la función llevaban tiempo diciendo cosas distintas y el
--   rótulo le daba la razón a la lectura equivocada.
--
--   Invertir la dirección del cálculo lo cierra: entra el total, la comida se
--   DEDUCE. `orders.order_amount` y `orders.delivery_fee` siguen siendo dos
--   columnas separadas —el ledger, las apelaciones y los reportes no se enteran
--   de nada—, lo único que cambia es de dónde sale el número de la comida.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ LA RESTA VIVE AQUÍ Y NO EN EL NAVEGADOR
--
--   Restar en el cliente era la vía corta y es la equivocada. El envío NO es una
--   constante que el navegador pueda conocer: sale de una cadena de fallback que
--   solo esta función resuelve —`delivery_bands ->> banda`, luego
--   `businesses.delivery_fee`, luego 2.00 (líneas de abajo, intactas desde la
--   0126)—. Si `useDeliveryBands` fallara o llegara tarde, el navegador restaría
--   0 y mandaría el total como si fuera comida: exactamente el cobro doble que
--   esta migración viene a matar, pero ahora en silencio y sin rótulo que
--   culpar.
--
--   Mismo principio que la 0126 con la banda: el dato que mueve dinero se
--   resuelve donde está la fuente de verdad.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE ARREGLA DE PASO — DOS VALIDACIONES QUE SE CONTRADECÍAN
--
--   Las dos nacen de la misma asimetría y se caen solas al invertir el cálculo:
--
--   1. PAGO MIXTO, IMPOSIBLE DE ENVIAR. El formulario exigía
--      `billetera + efectivo = monto tecleado` y esta función exigía
--      `= order_amount + delivery_fee`. Toda suma que la pantalla marcaba en
--      verde, el servidor la rechazaba con "La suma de Yape y Efectivo debe ser
--      igual al total". No había número que pasara las dos.
--
--   2. VUELTO INFLADO POR EL ENVÍO. La pantalla calculaba `paga_con − comida` y
--      esta función `paga_con − (comida + envío)`. La cajera leía un vuelto S/2
--      mayor que el real. Y con un `paga_con` entre comida y comida+envío, el
--      POST reventaba con "El monto con el que pagará el cliente debe cubrir la
--      parte en efectivo".
--
--      Con el total como entrada, ambas comparaciones pasan a ser contra
--      `p_total_amount` —el número que la cajera tiene delante— y coinciden con
--      lo que el motorizado va a cobrar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CONSECUENCIA ECONÓMICA, DICHA EN VOZ ALTA
--
--   `delivery_bands` hoy: near 2.00 · far 2.50.
--
--   ANTES elegir "Lejos" subía lo que pagaba el cliente (comida + 2.50).
--   AHORA el cliente paga el total tecleado, pase lo que pase, así que "Lejos"
--   le resta esos S/0.50 a la comida: el NEGOCIO absorbe la diferencia, no el
--   cliente. Sigue debiéndole el envío íntegro a Tindivo vía `business_charges`
--   (0124), solo que ahora sale de su margen.
--
--   Es deliberado y es la única forma de que el selector de zona pueda ir al
--   final sin mostrar precios: si la banda pudiera mover el total, tendría que
--   gritarle a la cajera "cobra S/0.50 más" justo después de que colgó el
--   teléfono. Si algún día se decide que el cliente pague el recargo, la salida
--   limpia NO es revertir esto: es igualar `far` a `near` en `app_settings`
--   —precedente de la 0110 con `commissions`— o mover la elección de banda antes
--   del monto otra vez.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ HAY `DROP FUNCTION` Y NO SOLO `CREATE OR REPLACE`
--
--   `p_order_amount` pasa a llamarse `p_total_amount`. Postgres rechaza
--   `CREATE OR REPLACE` cuando cambia el NOMBRE de un parámetro ("cannot change
--   name of input parameter"), aunque los tipos sean idénticos. Hay que soltar
--   la función primero. Mismo camino que 0126 y 0127, y por eso los grants se
--   reemiten abajo: la ACL no sobrevive al DROP.
--
--   El RENOMBRE ES LA PROTECCIÓN, no un detalle cosmético. supabase-js llama por
--   nombre de argumento: un cliente viejo que mande `p_order_amount` recibe
--   "function does not exist" en vez de colar un total por comida y cobrar el
--   envío dos veces. Falla ruidoso, que es lo que se quiere cuando un número
--   cambia de significado.
--
--   ⚠️ DESPLIEGUE ACOPLADO: `apps/api` y `apps/negocios` van juntos. El zod del
--   endpoint pasa a exigir `totalAmount`; un frontend viejo que mande
--   `orderAmount` recibe 422 y la cajera no puede crear pedidos. No se aceptó un
--   alias de compatibilidad a propósito — mantener vivos los dos nombres es
--   mantener viva justo la ambigüedad que este archivo elimina.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- MÉTODO DEL CUERPO
--
--   Reproducido desde la definición viva en prod (la de la 0127, líneas 79-234)
--   con los cambios acotados a: firma, guard del monto, derivación de la comida,
--   las dos comparaciones de pago, el INSERT y los payloads. Ni la resolución de
--   la banda, ni el antifraude, ni los relojes de cola se tocan.
--
-- =============================================================================


-- ── 1 · Fuera la firma que tomaba la comida ----------------------------------
DROP FUNCTION IF EXISTS public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band);


-- ── 2 · La firma nueva: entra el total ---------------------------------------
CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_total_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric, p_delivery_distance_band public.distance_band DEFAULT NULL::public.distance_band)
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
    client_pays_with, yape_amount, cash_amount,
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


-- ── 3 · Grants ---------------------------------------------------------------
-- El DROP del paso 1 se llevó la ACL. Sin estas dos líneas la función nueva
-- queda ejecutable por PUBLIC. REGLA de Docs/RIESGOS-LEDGER.md: toda migración
-- que cambie una firma emite REVOKE + GRANT en el mismo archivo, sin excepción.
-- La lista de tipos no cambió (solo el NOMBRE del cuarto parámetro), así que el
-- texto de estas dos sentencias es idéntico al de la 0127.
REVOKE ALL ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business_manual_order(
  uuid, public.delivery_method, public.payment_intent, numeric, text,
  text, integer, text, numeric, numeric, numeric, public.distance_band)
  TO service_role;


-- ── 4 · Guards --------------------------------------------------------------
DO $$
DECLARE
  v_n int;
  v_def text;
BEGIN
  -- 4a. Que no queden dos sobrecargas vivas. Los tipos de la firma no cambiaron,
  -- así que un DROP fallido dejaría dos funciones idénticas en tipos y Postgres
  -- no podría resolver la llamada. Fallo ruidoso al aplicar, que es cuando sale
  -- barato arreglarlo.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_n <> 1 THEN
    RAISE EXCEPTION
      '0129 abortada: quedan % sobrecargas de create_business_manual_order, se esperaba exactamente 1',
      v_n USING errcode = 'P0001';
  END IF;

  -- 4b. Que no sobreviva `p_order_amount` en ninguna parte del cuerpo. Si
  -- quedara una referencia suelta, la comida se guardaría desde un parámetro que
  -- ya no existe con ese significado, y sería el cobro doble de vuelta.
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_business_manual_order';

  IF v_def LIKE '%p_order_amount%' THEN
    RAISE EXCEPTION '0129 abortada: la definición todavía menciona p_order_amount'
      USING errcode = 'P0001';
  END IF;
END $$;
