-- =============================================================================
-- 0220 · Nadie cocina hasta que la cajera le ve la cara
-- =============================================================================
--
-- QUÉ ABRE ESTA MIGRACIÓN. El recojo en el local (`delivery_method = 'pickup'`)
-- deja de ser un camino declarado y sin recorrer. Lo que hasta hoy existía era
-- media pieza: el enum tenía el valor, `create_customer_order` sabía poner el
-- envío a 0, y `advance_order` sabía calcular la comisión de recojo — pero
-- NADIE llevaba un recojo a `delivered`, porque todas las transiciones
-- intermedias las escribe el motorizado, y en un recojo no hay motorizado. Es
-- exactamente el modo de fallo que `PICKUP_ENABLED` lleva documentado en
-- `features/checkout/types.ts` desde que se apagó la bandera.
--
-- ── LO QUE SE VERIFICÓ ANTES DE ESCRIBIR UNA LÍNEA ──────────────────────────
--
-- 1 · `compra_previa` NO asume motorizado. La cláusula (1) de
--     `customer_contraentrega_decision` es literalmente
--     `o.customer_user_id = p_customer_user_id and o.status = 'delivered'`, sin
--     mirar `delivery_method` ni `driver_id`. O sea que un recojo completado
--     habilita contraentrega igual que una entrega, SIN tocar esa función. Es
--     la pieza de crecimiento entera: quien recoge una vez, la siguiente puede
--     pedir a domicilio sin prepago y sin llamada.
--
-- 2 · EL RECOJO YA PASABA POR EL ANTIFRAUDE, al revés de lo que se suponía. El
--     guard de contraentrega de `create_customer_order` corre ANTES de ramificar
--     por método, así que un recojo en efectivo de un cliente sin historial no
--     se colaba: se RECHAZABA en seco con «Pago adelantado requerido». El
--     agujero no era de fraude, era el contrario — el canal estaba cerrado
--     incluso para el vecino que está de pie en el mostrador. Eso es lo que
--     arregla la rama `v_pickup_now` de más abajo.
--
-- 3 · UN RECOJO EN `preparing` ERA VISIBLE PARA TODOS LOS MOTORIZADOS. La policy
--     `ord_driver_read` enseña cualquier pedido en `preparing`/`waiting_driver`
--     sin motorizado, sin mirar el método. Encender el recojo tal cual habría
--     puesto bolsas de mostrador en la cola de reparto, y el primero en tomarlas
--     se habría ido a buscar un domicilio que no existe. Se cierra en los tres
--     sitios: la policy, la guarda de `take` y el reloj `appears_in_queue_at`.
--
-- 4 · UN RECOJO ENTREGADO NO COBRABA NADA. `generate_delivery_charges` deriva el
--     cargo de `commission_amount`/`delivery_fee_charged`, y esas dos las
--     escribe la acción `pickup` del MOTORIZADO. Sin motorizado se quedaban
--     NULL, el trigger salía por `(fee + comisión) <= 0` y el recojo era gratis
--     para el negocio. La acción `handover` las escribe con la misma fuente y el
--     mismo override que ya usaba el delivery.
--
-- ── LO QUE **NO** SE HACE, Y POR QUÉ ────────────────────────────────────────
--
-- NO se estrena `confirmed` como estado de «cliente presente». Era la propuesta
-- del spec, y no se sostiene contra el código:
--
--   · `demandsCashier()` —la única fuente de verdad de qué suena y qué se ve en
--     el tablero (`lib/orders/attention.ts`, escrita a costa del pedido perdido
--     `JMAXL98Z`)— responde `pending_acceptance || validando`. Nacer en
--     `confirmed` significa nacer FUERA de la alarma, del banner, del reloj y
--     del orden de la columna, y tener que reconstruir las cuatro cosas.
--   · La ventana de autocancelación que el spec pide YA EXISTE para
--     `pending_acceptance`: bloque 1 de `cancel_expired_prepay_orders`, con
--     `acceptanceMinutes` de `app_settings.timers`. `confirmed` no tiene
--     ninguna, así que habría que inventar un bloque, un valor de
--     `cancel_reason` y un timer nuevos — maquinaria sin estrenar sobre un
--     estado sin estrenar.
--   · `alerts.ts` traduce `confirmed` a «El restaurante confirmó tu pedido». Un
--     recojo que naciera ahí le diría al cliente que el restaurante confirmó
--     antes de que el restaurante lo haya mirado.
--
-- Un recojo «ahora» nace, como todos, en `pending_acceptance`. Lo único nuevo es
-- lo que la cajera lee en el botón y que ese pedido NUNCA entra a `validando`.
--
-- ── EL ESTADO NUEVO ─────────────────────────────────────────────────────────
--
-- `ready_for_pickup` (añadido por la 0219, en su propio archivo porque Postgres
-- no deja USAR un valor de enum en la misma transacción que lo crea) es el único
-- estado que faltaba de verdad: «la comida está hecha, en el mostrador,
-- esperando a que la recojan». Ni `waiting_driver` ni `picked_up` significan eso.
--
-- `delivered` sigue siendo el único terminal, compartido con delivery — ver el
-- punto 1 de arriba, que es la razón por la que conviene que lo siga siendo.


-- ── A · Las dos columnas nuevas ────────────────────────────────────────────
--
-- `pickup_timing` se PERSISTE y no se deriva: es lo que la cajera lee en la
-- tarjeta para saber si tiene a alguien delante, lo que decide si el pedido
-- pudo saltarse `validando`, y lo único que después permite contar cuántos
-- recojos fueron de mostrador y cuántos programados. Derivarlo de `risk_flags`
-- habría metido una decisión de negocio dentro de una bolsa de diagnóstico.
--
-- NULL para delivery, a propósito: la columna no tiene DEFAULT y no se rellena
-- hacia atrás. «Este pedido no es un recojo» es exactamente lo que dice NULL.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_timing text,
  ADD COLUMN IF NOT EXISTS ready_for_pickup_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_pickup_timing_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_timing_chk CHECK (
    -- (a) VOCABULARIO Y PERTENENCIA. Solo un recojo puede traer timing. Sin
    --     esta mitad, un 'now' colado en una fila de delivery pasaría, y desde
    --     ahí se leería como «cliente en el mostrador» — que es exactamente la
    --     mentira que abre el hueco: presencia física declarada sin mostrador.
    (pickup_timing IS NULL
     OR (delivery_method = 'pickup' AND pickup_timing IN ('now', 'later')))
    -- (b) UN RECOJO PEDIDO POR EL CLIENTE SIEMPRE TRAE RESPUESTA. En el
    --     checkout es una pregunta obligatoria, no un campo opcional, y el
    --     CHECK es la última red por si algún día alguien llama a la RPC
    --     saltándose el contrato.
    --
    --     El manual de la cajera (`business_manual`) queda fuera a propósito y
    --     se le deja NULL: ahí NADIE hizo la pregunta. La cajera teclea el
    --     pedido, no lo pide, y ese pedido nace en `preparing` sin pasar por
    --     ninguno de los guards que `pickup_timing` gobierna. Rellenarlo con
    --     'now' por comodidad sería inventar un hecho —«el cliente está
    --     delante»— que nadie comprobó.
    AND (source <> 'customer_pwa'
         OR delivery_method <> 'pickup'
         OR pickup_timing IS NOT NULL)
  ) NOT VALID;

-- NOT VALID + VALIDATE en dos pasos: el segundo toma un lock más suave y, si
-- alguna fila histórica no cumpliera, falla diciendo cuál en vez de bloquear la
-- tabla entera durante el ALTER. En el piloto no hay recojos previos, así que
-- se espera que valide en seco.
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_pickup_timing_chk;

COMMENT ON COLUMN public.orders.pickup_timing IS
  'Solo recojos: ''now'' (el cliente está en el mostrador; la cajera verifica '
  'presencia y por eso el pedido se salta `validando`) o ''later'' (la comida se '
  'hace sin nadie delante, así que se le exige el mismo antifraude que a un '
  'delivery). NULL en delivery, y también en el recojo manual de la cajera, '
  'donde nadie llegó a hacer la pregunta. Lo declara el cliente, NUNCA se '
  'infiere del origen del enlace: un QR se fotografía y se comparte. Ver 0220.';

COMMENT ON COLUMN public.orders.ready_for_pickup_at IS
  'Cuándo la bolsa quedó lista en el mostrador. Es el reloj contra el que la '
  'cajera puede declarar `pickup_no_show`, igual que `arrived_at_customer_at` '
  'lo es para el motorizado. Ver 0220.';

CREATE INDEX IF NOT EXISTS orders_pickup_timing_idx
  ON public.orders (business_id, pickup_timing)
  WHERE delivery_method = 'pickup';


-- ── B · El sello de tiempo del estado nuevo ────────────────────────────────
--
-- Mismo patrón que el resto: pegajoso vía COALESCE, para que volver a pasar por
-- el estado no reinicie el reloj de la espera.
CREATE OR REPLACE FUNCTION public.orders_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF new.short_id IS NULL THEN
    new.short_id := public.generate_short_id();
  END IF;
  IF tg_op = 'INSERT' OR new.status IS DISTINCT FROM old.status THEN
    CASE new.status
      WHEN 'validando' THEN new.validating_at := now();
      WHEN 'pending_acceptance' THEN new.pending_acceptance_at := now();
      WHEN 'awaiting_payment' THEN new.awaiting_payment_at := now();
      WHEN 'confirmed' THEN new.confirmed_at := COALESCE(new.confirmed_at, now());
      WHEN 'preparing' THEN new.preparing_at := COALESCE(new.preparing_at, now());
      WHEN 'waiting_driver' THEN new.waiting_driver_at := COALESCE(new.waiting_driver_at, now());
      WHEN 'heading_to_restaurant' THEN new.heading_at := COALESCE(new.heading_at, now());
      WHEN 'waiting_at_restaurant' THEN new.waiting_at_restaurant_at := COALESCE(new.waiting_at_restaurant_at, now());
      WHEN 'picked_up' THEN new.picked_up_at := COALESCE(new.picked_up_at, now());
      WHEN 'ready_for_pickup' THEN new.ready_for_pickup_at := COALESCE(new.ready_for_pickup_at, now());
      WHEN 'delivered' THEN new.delivered_at := COALESCE(new.delivered_at, now());
      WHEN 'cancelled' THEN new.cancelled_at := COALESCE(new.cancelled_at, now());
      ELSE NULL;
    END CASE;
  END IF;
  RETURN new;
END;
$function$;


-- ── C · La cola del motorizado deja de ver los recojos ─────────────────────
--
-- Ver el punto 3 de la cabecera. `delivery_method = 'delivery'` solo se añade a
-- la rama de DISPONIBLES; la otra —`driver_id = current_driver_id()`— se deja
-- intacta a propósito: si por lo que sea un recojo acabase con motorizado
-- asignado, cortarle la lectura lo dejaría invisible para quien lo tiene, que
-- es peor que verlo.
DROP POLICY IF EXISTS ord_driver_read ON public.orders;
CREATE POLICY ord_driver_read ON public.orders
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_user_has_role('driver'::public.user_role))
    AND (
      driver_id = (SELECT public.current_driver_id())
      OR (
        status = ANY (ARRAY['preparing'::public.order_status, 'waiting_driver'::public.order_status])
        AND driver_id IS NULL
        AND delivery_method = 'delivery'
        AND business_id IN (
          SELECT dr.business_id FROM public.driver_restaurants dr
          WHERE dr.driver_id = (SELECT public.current_driver_id())
        )
      )
    )
  );


-- ── D · La autocancelación dice la verdad sobre qué pasó ───────────────────
--
-- El bloque 1 ya cubre el recojo «ahora» tal cual: nace en `pending_acceptance`
-- y muere por el mismo reloj (`acceptanceMinutes`) si nadie lo acepta. No hace
-- falta maquinaria nueva — solo que la NOTA no mienta. «El negocio no confirmó
-- disponibilidad» es cierto en un delivery; en un recojo de mostrador lo que
-- casi siempre pasó es que quien pidió no llegó a plantarse delante.
--
-- El `cancel_reason` NO cambia (sigue `pending_acceptance_timeout`): es el mismo
-- hecho —venció la ventana de aceptación— y partirlo en dos valores obligaría a
-- tocar todos los mapas de etiquetas y todos los informes que ya lo cuentan.
CREATE OR REPLACE FUNCTION public.cancel_expired_prepay_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_timers jsonb;
  v_acceptance int;
  v_payment int;
  v_validation int;
  v_verification int;
  v_c1 integer := 0;
  v_c2 integer := 0;
  v_c3 integer := 0;
  v_c4 integer := 0;
BEGIN
  SELECT value INTO v_timers FROM public.app_settings WHERE key = 'timers';

  -- Los `coalesce` conservan los valores de DECISIONS §10 si la clave faltara.
  -- Son la red para una fila incompleta, no el sitio donde vive el número.
  v_acceptance   := coalesce((v_timers ->> 'acceptanceMinutes')::int, 5);
  v_payment      := coalesce((v_timers ->> 'paymentMinutes')::int, 15);
  v_validation   := coalesce((v_timers ->> 'validationMinutes')::int, 5);
  v_verification := coalesce((v_timers ->> 'prepayVerificationMinutes')::int, 10);

  -- 1 · El negocio no confirmó disponibilidad.
  -- Sin filtro por `payment_intent`: la ventana de aceptación es la misma para
  -- contraentrega y para prepago (los dos nacen aquí). Y desde 0220, la misma
  -- para un recojo: lo que cambia es la frase, no el reloj.
  WITH cancelled1 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'pending_acceptance_timeout',
        cancel_note = CASE
          WHEN delivery_method = 'pickup' AND pickup_timing = 'now' THEN format(
            'Auto-cancelado: nadie confirmó al cliente en el mostrador en %s minutos', v_acceptance)
          WHEN delivery_method = 'pickup' THEN format(
            'Auto-cancelado: el negocio no confirmó el recojo en %s minutos', v_acceptance)
          ELSE format(
            'Auto-cancelado: el negocio no confirmó disponibilidad en %s minutos', v_acceptance)
        END
    WHERE status = 'pending_acceptance'
      AND coalesce(pending_acceptance_at, created_at)
            <= now() - (v_acceptance * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c1 FROM cancelled1;

  -- 2 · El cliente no pagó ni subió su captura.
  WITH cancelled2 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = format('Auto-cancelado: pago no realizado en %s minutos', v_payment)
    WHERE status = 'awaiting_payment'
      AND coalesce(awaiting_payment_at, updated_at)
            <= now() - (v_payment * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c2 FROM cancelled2;

  -- 3 · Validación humana de contraentrega.
  -- Excluye el prepago explícitamente en vez de por el rodeo de la 0159. Los
  -- bloques 3 y 4 son disjuntos: aquí NUNCA entra un prepago, y todo prepago
  -- en `validando` cae en el 4.
  WITH cancelled3 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'validation_timeout',
        cancel_note = format('Auto-cancelado: no se validó al cliente en %s minutos', v_validation)
    WHERE status = 'validando'
      AND payment_intent <> 'prepaid'
      AND (validation_context = 'antifraud' OR validation_context IS NULL)
      AND coalesce(validating_at, created_at)
            <= now() - (v_validation * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c3 FROM cancelled3;

  -- 4 · La cajera no revisó el comprobante.
  WITH cancelled4 AS (
    UPDATE public.orders
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'prepay_timeout',
        cancel_note = format(
          'Auto-cancelado: validación del comprobante no completada en %s minutos', v_verification)
    WHERE status = 'validando'
      AND (validation_context = 'proof' OR payment_intent = 'prepaid')
      AND coalesce(validating_at, created_at)
            <= now() - (v_verification * interval '1 minute')
    RETURNING id
  )
  SELECT count(*) INTO v_c4 FROM cancelled4;

  -- NO HAY BLOQUE 5 PARA `ready_for_pickup`, Y ES DELIBERADO. Una bolsa en el
  -- mostrador no se cancela sola: la comida ya está hecha y pagada o por pagar,
  -- y borrarla de la pantalla sin que nadie mire es perder el único momento en
  -- que se puede decidir si el cliente se llevó su pedido, si hay que guardarlo,
  -- o si merece un strike. Esa decisión la toma la cajera con `pickup_no_show`.
  RETURN v_c1 + v_c2 + v_c3 + v_c4;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_expired_prepay_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expired_prepay_orders() TO service_role;


-- ── E · create_customer_order: el recojo entra al pipeline, no lo rodea ────
--
-- Cambia la FIRMA (un argumento más, `p_pickup_timing`), así que hay DROP de la
-- de 21 y creación de la de 22: `CREATE OR REPLACE` con otro número de
-- argumentos crea una SOBRECARGA y deja las dos vivas, y entonces qué versión
-- corre depende de cómo llame cada cliente. Ver §2.9 de AGENTS.md.
DROP FUNCTION IF EXISTS public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz);

CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text, p_customer_notes text DEFAULT NULL::text, p_delivery_accuracy_m integer DEFAULT NULL::integer, p_delivery_confirmed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_pickup_timing text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Promo de lanzamiento «envío gratis» (0187)
  v_promo jsonb;
  v_promo_code text;
  v_promo_active boolean;
  v_promo_max int;
  v_promo_taken int;
  v_prior_delivered int;
  v_had_history boolean;
  v_verified_phone text;
  v_redemption_id uuid;
  v_promo_applied boolean := false;
  v_fee_source text := 'system';
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
  v_band public.distance_band;
  v_max_accuracy numeric := 150;

  -- Burst detection
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

  -- Spike detection
  v_recent_hour_count int;
  v_avg_hourly numeric;
  v_spike_days int;
  v_spike_multiplier numeric;
  v_spike_min int;

  -- Guard de pedido activo (instrumentación del bloqueo)
  v_active_id uuid;
  v_active_short_id text;
  v_active_status public.order_status;

  -- B.3: Umbrales de efectivo (R2, R3)
  v_max_bill numeric;
  v_max_change numeric;

  -- 0211: motivo detrás del guard de contraentrega (trusted | risk_blocked | no_history)
  v_contraentrega_decision text;

  -- 0220: cuándo dijo el cliente que pasa por su recojo, y el atajo booleano.
  v_pickup_timing text;
  v_pickup_now boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  -- ── RECOJO: CUÁNDO VIENE, PREGUNTADO Y NO INFERIDO (0220) ─────────────
  -- No sale de `p_source` ni de ningún parámetro de campaña. Un QR pegado en el
  -- mostrador se fotografía y se comparte por WhatsApp en diez segundos, así
  -- que «entró por el póster» no dice NADA sobre dónde está parado quien pide.
  -- Lo dice el cliente, con un toque, y de ahí cuelga todo lo demás.
  --
  -- EL DEFAULT ES 'later', QUE ES EL LADO CARO. Un llamador que omita el
  -- argumento cae en el camino con GPS, guard de contraentrega y `validando`,
  -- o sea el que ya existía. Si el default fuera 'now', olvidarse del argumento
  -- REGALARÍA la exención por presencia física, que es justo lo que el bloque
  -- de más abajo existe para no regalar.
  v_pickup_timing := case
    when p_delivery_method <> 'pickup' then null
    when p_pickup_timing in ('now', 'later') then p_pickup_timing
    else 'later'
  end;
  v_pickup_now := (v_pickup_timing = 'now');

  -- B.1: Guard explícito para pending_mixed.
  -- El canal B2C no acepta este método: no hay cajera que coordine las dos partes.
  if p_payment_intent = 'pending_mixed' then
    raise exception 'El pago mixto no está disponible en el canal de cliente. Elige efectivo, Yape/Plin o prepago.'
      using errcode = 'P0001';
  end if;

  -- GUARD: un solo pedido activo por cliente + negocio.
  select o.id, o.short_id, o.status into v_active_id, v_active_short_id, v_active_status
  from public.orders o
  where o.customer_user_id = p_customer_user_id
    and o.business_id = p_business_id
    and o.status in (
      'validando', 'pending_acceptance', 'awaiting_payment', 'confirmed', 'preparing',
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up',
      -- 0220: una bolsa esperando en el mostrador es un pedido ABIERTO. Sin
      -- esta línea, quien no pasa a recoger puede seguir pidiendo al mismo
      -- restaurante y acumular comida hecha que nadie va a llevarse — que es
      -- justo el escenario que el guard de 0105 existe para cerrar.
      'ready_for_pickup'
    )
  order by o.created_at desc
  limit 1;

  if v_active_short_id is not null then
    raise exception 'Ya tienes un pedido activo en este restaurante. Espera a que termine antes de hacer uno nuevo.'
      using errcode = 'P0001',
            detail = 'active_order_block:' || v_active_id::text || ':' || v_active_short_id
                     || ':' || v_active_status::text;
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;

  if public.customer_is_blocked(p_customer_user_id, p_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE TELÉFONO VERIFICADO (WhatsApp OTP)
  if not exists (
    select 1 from public.customer_profiles
    where user_id = p_customer_user_id
    and phone_verified_at is not null
  ) then
    raise exception 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE CONTRAENTREGA: exige historial de entregas, O (0211) un cliente
  -- sin historial pero geolocalizado en San Jacinto — ese caso SÍ entra, pero
  -- fuerza `validando` más abajo (v_requires_validation). El riesgo
  -- ('risk_blocked') nunca pasa por el crédito de GPS: corta siempre. Ver
  -- DECISIONS.md §8 y la cabecera de 0211.
  if p_payment_intent in ('pending_cash', 'pending_yape') then
    v_contraentrega_decision := public.customer_contraentrega_decision(p_customer_user_id);

    if v_contraentrega_decision = 'risk_blocked' then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    elsif v_contraentrega_decision = 'no_history' then
      if v_pickup_now then
        -- ── RECOJO «AHORA»: LA GARANTÍA ES LA PERSONA, NO EL DATO (0220) ────
        -- Este es el único camino del sistema donde un cliente sin ninguna
        -- historia paga contraentrega sin GPS y sin llamada. La razón es que
        -- aquí no hay nada fiado: NADIE COCINA hasta que la cajera acepta el
        -- pedido, y para aceptarlo tiene delante a quien lo hizo. La
        -- verificación es un humano mirando a otro humano, y eso es MÁS fuerte
        -- que una coordenada — el GPS de un navegador se falsifica sin root;
        -- estar de pie en el mostrador, no.
        --
        -- Y mentir aquí no le cuesta nada al negocio: quien dice «ahora» y no
        -- aparece deja un pedido que nadie tocó, y que se autocancela solo por
        -- la ventana de aceptación que ya corre para todos.
        --
        -- LO QUE ESTA RAMA NO PERDONA: el `risk_blocked` de arriba corta antes
        -- de llegar aquí. Un cliente con strikes no compra a crédito por estar
        -- de pie: la sanción de DECISIONS §8 es de la cuenta, no del canal.
        v_risk_flags := v_risk_flags || jsonb_build_object('pickupNowPresence', true);
      elsif not public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method) then
        raise exception 'Pago adelantado requerido para primer pedido.'
          using errcode = 'P0001';
      else
        -- Sin historial, pero el GPS dice San Jacinto: contraentrega permitida,
        -- con la misma llamada de validación que ya paga cualquier cliente
        -- nuevo. El GPS es falsificable; la llamada es la salvaguarda.
        --
        -- Vale igual para un recojo «más tarde»: ahí la comida se hace con
        -- nadie delante, exactamente como en un delivery, así que se le pide
        -- exactamente lo mismo.
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'new_customer_local_gps');
        v_risk_flags := v_risk_flags || jsonb_build_object('newCustomerLocalGps', true);
      end if;
    end if;
    -- 'trusted': contraentrega libre, sin marcar nada adicional.
  end if;

  if p_delivery_method = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Coordenadas de entrega obligatorias para delivery' using errcode = 'P0001';
    end if;

    -- Validar cobertura
    if not public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) then
      raise exception 'Dirección fuera de la zona de reparto establecida para San Jacinto' using errcode = 'P0001';
    end if;

    -- Validar GPS vs Dirección
    -- 0148: `manual_skip_prepaid` ENTRA AQUI, igual que `failed`.
    --
    -- Los dos significan lo mismo: NO HAY POSICION. El cliente denego el
    -- permiso, el GPS no fijo, o pulso la salida de emergencia de
    -- `GeoBlockView` ("no puedo dar mi ubicacion, pago por adelantado").
    -- Solo `failed` estaba exento, asi que `manual_skip_prepaid` caia en el
    -- raise de abajo y el pedido moria con un 422 -- justo el camino que la
    -- app ofrece para RECUPERARSE de un fallo de GPS
    -- (`use-checkout-actions.ts:67` y `:96`).
    --
    -- La contradiccion estaba dentro de esta misma funcion: doce lineas mas
    -- abajo, `if p_customer_gps_method in ('failed', 'manual_skip_prepaid')`
    -- ya trataba a los dos como pareja para marcar `gpsFallbackPrepaid`. Un
    -- lado los rechazaba y el otro contaba con ellos.
    --
    -- El bloque entero se salta con razon: lo unico que hay dentro, ademas
    -- del raise, es la comparacion de distancia GPS-vs-direccion, y sin
    -- coordenadas no hay nada que comparar.
    if p_customer_gps_method is not null
       and p_customer_gps_method not in ('failed', 'manual_skip_prepaid') then
      if p_customer_gps_lat is null or p_customer_gps_lng is null then
        raise exception 'Coordenadas GPS del cliente incompletas' using errcode = 'P0001';
      end if;

      if public.geo_distance_km(p_customer_gps_lat, p_customer_gps_lng, p_delivery_lat::double precision, p_delivery_lng::double precision) > 0.4 then
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'gps_warning_zone');
        v_risk_flags := v_risk_flags || jsonb_build_object('gpsWarningZone', true);
      end if;
    end if;

    if p_customer_gps_method in ('failed', 'manual_skip_prepaid') then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsFallbackPrepaid', true);
    elsif p_customer_gps_accuracy_m is not null and p_customer_gps_accuracy_m > v_max_accuracy then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsLowAccuracy', true);
    end if;
  end if;

  if p_delivery_method = 'pickup' then
    -- El recojo no tiene banda: el cliente va al local. Escribir 'near' seria
    -- meter un dato falso en los reportes (misma decision que 0126).
    v_delivery_fee := 0;
    v_band := null;
  else
    -- LA BANDA SALE DEL PUNTO, NO DE UN LITERAL (0162).
    v_band := public.delivery_band_for_point(p_delivery_lat, p_delivery_lng);
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> v_band::text)::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m,
    customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method,
    order_amount, delivery_fee, status,
    delivery_distance_band, delivery_fee_source,
    customer_notes,
    delivery_coordinates_accuracy_m, delivery_location_confirmed_at,
    pickup_timing
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system',
    left(nullif(btrim(regexp_replace(coalesce(p_customer_notes, ''), '\s+', ' ', 'g')), ''), 200),
    nullif(greatest(coalesce(p_delivery_accuracy_m, 0), 0), 0),
    p_delivery_confirmed_at,
    v_pickup_timing
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    for v_optid in select value from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb))
    loop
      select o.name as oname, o.additional_price as oprice, g.name as gname into v_opt
        from public.menu_modifier_options o
        join public.menu_modifier_groups g on g.id = o.group_id
        where o.id = v_optid::uuid and o.is_available
          and exists (
            select 1 from public.menu_item_modifier_groups mig
            where mig.item_id = v_menu_item.id and mig.group_id = o.group_id
          );
      if not found then raise exception 'Modificador no valido para este item' using errcode = 'P0001'; end if;
      v_unit := v_unit + v_opt.oprice;
      v_mods := v_mods || jsonb_build_object('g', v_opt.gname, 'n', v_opt.oname, 'p', v_opt.oprice);
    end loop;

    v_line_total := round(v_unit * v_qty, 2);
    v_order_amount := v_order_amount + v_line_total;

    insert into public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.base_price,
      v_qty, v_unit, v_line_total, nullif(v_item ->> 'note', '')
    ) returning id into v_coi_id;

    for v_mod in select * from jsonb_array_elements(v_mods)
    loop
      insert into public.customer_order_item_modifiers (
        item_id, group_name_snapshot, option_name_snapshot, additional_price_snapshot
      ) values (v_coi_id, v_mod ->> 'g', v_mod ->> 'n', (v_mod ->> 'p')::numeric);
    end loop;
  end loop;

  -- ── PROMO DE LANZAMIENTO: ENVÍO GRATIS (0187) ──────────────────────────────
  -- POR QUÉ AQUÍ, y no justo tras el insert del pedido: el lock del tope se
  -- sostiene hasta el COMMIT, así que todo lo que quede por debajo entra en la
  -- sección crítica. Bajarlo por debajo del bucle de ítems saca de ahí las N
  -- consultas de menu_items y los inserts de líneas y modificadores, que es la
  -- parte más cara y la que más varía con el tamaño del carrito.
  --
  -- Y no puede ir más abajo: las validaciones de pago que vienen a continuación
  -- leen `v_delivery_fee`, que es exactamente lo que esta promo cambia.
  if p_delivery_method = 'delivery' and v_delivery_fee > 0 then
    -- MUTEX DEL TOPE GLOBAL.
    -- No se puede hacer `select count(*) ... for update`: Postgres lo rechaza
    -- con "FOR UPDATE is not allowed with aggregate functions". Y aunque se
    -- pudiera, bloquear filas EXISTENTES no impide que otra transacción INSERTE
    -- una nueva, que es justo la carrera a cerrar. El candado tiene que estar
    -- sobre algo que todos los competidores toquen: la fila de configuración.
    select value into v_promo
      from public.app_settings
     where key = 'promo_free_delivery'
       for update;

    -- CONFIG AUSENTE = NO HAY PROMO, dicho explícitamente.
    -- Sin este `if found`, el caso funcionaría igual por propagación de NULL
    -- (v_promo es jsonb: `NULL ->> 'active'` da NULL y el if no entra), pero
    -- eso es implícito y se rompe la próxima vez que alguien reordene el bloque.
    if found then
      v_promo_code   := v_promo ->> 'code';
      v_promo_active := coalesce((v_promo ->> 'active')::boolean, false);
      v_promo_max    := (v_promo ->> 'max_redemptions')::int;

      -- POLARIDAD POSITIVA, SIEMPRE.
      -- Cada condición dice "aplicar solo si consta que sí". Escrita al revés
      -- ("saltar si consta que no"), un campo NULL en la config —un JSON editado
      -- a medias desde el panel— abriría la promo SIN TECHO en vez de cerrarla.
      -- Con `v_taken < v_max` y v_max NULL no se entra: no aplica. Con
      -- `v_taken >= v_max` tampoco se entraría... y se aplicaría sin límite.
      if v_promo_active
         and v_promo_code is not null
         and v_promo_max is not null
         and public.current_service_date()
               between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date
      then
        -- El conteo se DERIVA del ledger de redenciones, no se acumula en un
        -- contador. Misma lección que 0124 con balance_due: un contador que
        -- sube y baja se desincroniza el día que una fila entre o salga por un
        -- camino no previsto, y entonces el tope publicitado miente hacia el
        -- lado caro. `released` no cuenta: cancelar devuelve el cupo.
        select count(*) into v_promo_taken
          from public.promo_redemptions
         where promo_code = v_promo_code
           and status in ('reserved', 'redeemed');

        if v_promo_taken < v_promo_max then
          -- El teléfono sale del PERFIL VERIFICADO, nunca de p_customer_phone,
          -- que el cliente elige libre. Misma disciplina que 0171.
          select cp.phone into v_verified_phone
            from public.customer_profiles cp
           where cp.user_id = p_customer_user_id
             and cp.phone_verified_at is not null;

          if v_verified_phone is not null then
            -- Dos definiciones de "¿era nuevo?", las dos guardadas en crudo:
            --   prior_delivered_count  entregas de v2 de esta cuenta O de su
            --                          teléfono verificado (las que tomó la
            --                          cajera cuentan: son del mismo humano).
            --   had_delivery_history   la definición ancha de 0171/0182, que
            --                          además incluye el directorio del v1.
            -- En el piloto las dos dan números muy distintos. Guardar el dato
            -- crudo evita atar el análisis a una sola hoy.
            select count(*) into v_prior_delivered
              from public.orders o
             where o.status = 'delivered'
               and (o.customer_user_id = p_customer_user_id
                    or o.customer_phone = v_verified_phone);

            v_had_history := public.customer_trusted_for_contraentrega(p_customer_user_id);

            -- `on conflict do nothing` SIN CONFLICT TARGET. No es un descuido:
            -- sin target arbitra contra TODAS las restricciones únicas, así que
            -- cubre a la vez el índice por cuenta y el de teléfono, en la misma
            -- inserción especulativa. Con target cubriría SOLO ese índice y una
            -- colisión contra el otro levantaría unique_violation (23505),
            -- abortando la transacción y tumbando el pedido entero en vez de
            -- cobrarle el envío.  NO AÑADIR EL TARGET.
            insert into public.promo_redemptions (
              promo_code, customer_user_id, verified_phone, order_id,
              status, waived_amount, distance_band,
              prior_delivered_count, had_delivery_history
            ) values (
              v_promo_code, p_customer_user_id, v_verified_phone, v_order_id,
              'reserved', v_delivery_fee, v_band,
              v_prior_delivered, v_had_history
            )
            on conflict do nothing
            returning id into v_redemption_id;

            -- Con do-nothing y conflicto, v_redemption_id queda NULL (no es
            -- INTO STRICT, no levanta excepción). Eso es cómo se sabe si entró.
            if v_redemption_id is not null then
              v_promo_applied := true;
              v_delivery_fee  := 0;
              v_fee_source    := 'promo';
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount + v_delivery_fee > v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'El total con envio (S/ %) pasa de S/ %, asi que el pago debe ser adelantado.',
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00'),
      to_char(v_threshold, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- R1: el monto declarado debe cubrir el total
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- B.3: R2 y R3 — umbrales de billete y vuelto
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null then
    select (value #>> '{}')::numeric into v_max_bill from public.app_settings where key = 'max_cash_bill';
    v_max_bill := coalesce(v_max_bill, 100);

    -- El techo de vuelto lo pone la caja de esta noche, no una constante. Si la
    -- cajera no declaró nada, `effective_max_change` devuelve el global de
    -- siempre, así que el comportamiento sin declaración es idéntico al de ayer.
    v_max_change := public.effective_max_change(p_business_id);

    -- R2: el billete declarado no puede superar el máximo
    if p_client_pays_with > v_max_bill then
      raise exception 'El billete máximo aceptado es S/%. Usa un billete menor o paga con Yape/Plin.', v_max_bill
        using errcode = 'P0001';
    end if;

    -- R3: el vuelto requerido no puede superar el máximo
    if p_client_pays_with - (v_order_amount + v_delivery_fee) > v_max_change then
      raise exception 'El vuelto requerido (S/%) supera el vuelto disponible esta noche (S/%). Paga con un billete menor o usa Yape/Plin.',
        to_char(p_client_pays_with - (v_order_amount + v_delivery_fee), 'FM999990.00'),
        v_max_change
        using errcode = 'P0001';
    end if;
  end if;

  select value into v_location from public.app_settings where key = 'validation';
  v_vthreshold := coalesce((v_location ->> 'amountThreshold')::numeric, 80);
  v_same_phone_window := coalesce((v_location ->> 'samePhoneWindowMinutes')::int, 30);
  v_same_phone_threshold := coalesce((v_location ->> 'samePhoneThreshold')::int, 3);
  v_nearby_window := coalesce((v_location ->> 'nearbyAddressWindowMinutes')::int, 60);
  v_nearby_radius_m := coalesce((v_location ->> 'nearbyAddressRadiusM')::numeric, 200);
  v_nearby_threshold := coalesce((v_location ->> 'nearbyAddressThreshold')::int, 3);
  v_high_ticket_amount := coalesce((v_location ->> 'newPhoneHighTicketAmount')::numeric, 50);
  v_high_ticket_threshold := coalesce((v_location ->> 'newPhoneHighTicketThreshold')::int, 3);
  v_spike_days := coalesce((v_location ->> 'spikeLookbackDays')::int, 14);
  v_spike_multiplier := coalesce((v_location ->> 'spikeMultiplier')::numeric, 2);
  v_spike_min := coalesce((v_location ->> 'spikeMinimumOrdersPerHour')::int, 6);

  select count(*) into v_same_phone_count
  from public.orders o
  where o.customer_phone = p_customer_phone
    and o.created_at >= now() - make_interval(mins => v_same_phone_window)
    and o.status <> 'cancelled';
  if v_same_phone_count >= v_same_phone_threshold then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'same_phone_burst');
    v_risk_flags := v_risk_flags || jsonb_build_object('samePhoneBurst', true);
  end if;

  if p_delivery_lat is not null and p_delivery_lng is not null then
    select count(*) into v_nearby_count
    from public.orders o
    where o.business_id = p_business_id
      and o.delivery_coordinates_lat is not null
      and o.delivery_coordinates_lng is not null
      and o.created_at >= now() - make_interval(mins => v_nearby_window)
      and o.status <> 'cancelled'
      and public.geo_distance_km(
        o.delivery_coordinates_lat::double precision,
        o.delivery_coordinates_lng::double precision,
        p_delivery_lat::double precision,
        p_delivery_lng::double precision
      ) <= (v_nearby_radius_m / 1000.0);
    if v_nearby_count >= v_nearby_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'nearby_address_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('nearbyAddressBurst', true);
    end if;
  end if;

  v_night_start := (date_trunc('day', now() at time zone 'America/Lima') + interval '18 hours') at time zone 'America/Lima';
  if now() < v_night_start then
    v_night_start := v_night_start - interval '1 day';
  end if;

  if v_order_amount >= v_high_ticket_amount then
    with nightly_orders as (
      select o.*
      from public.orders o
      where o.business_id = p_business_id
        and o.created_at >= v_night_start
        and o.order_amount >= v_high_ticket_amount
        and o.status <> 'cancelled'
        and o.customer_phone is not null
    ),
    new_phones as (
      select distinct no.customer_phone
      from nightly_orders no
      where not exists (
        select 1
        from public.orders prior
        where prior.customer_phone = no.customer_phone
          and prior.id <> no.id
          and prior.created_at < v_night_start
          and prior.status <> 'cancelled'
      )
    )
    select count(*) into v_new_high_ticket_count from new_phones;

    if v_new_high_ticket_count >= v_high_ticket_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'new_phone_high_ticket_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('newPhoneHighTicketBurst', true);
    end if;
  end if;

  select count(*) into v_recent_hour_count
  from public.orders o
  where o.business_id = p_business_id
    and o.created_at >= now() - interval '1 hour'
    and o.status <> 'cancelled';

  select avg(hour_count)::numeric into v_avg_hourly
  from (
    select date_trunc('hour', o.created_at) as bucket, count(*) as hour_count
    from public.orders o
    where o.business_id = p_business_id
      and o.created_at >= now() - make_interval(days => v_spike_days)
      and o.created_at < now() - interval '1 hour'
      and o.status <> 'cancelled'
    group by 1
  ) h;

  if v_recent_hour_count >= v_spike_min
     and v_avg_hourly is not null
     and v_recent_hour_count > (v_avg_hourly * v_spike_multiplier) then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'order_spike');
    v_risk_flags := v_risk_flags || jsonb_build_object('orderSpike', true);
    if not exists (
      select 1 from public.admin_alerts
      where type = 'fraud_order_spike'
        and created_at >= now() - interval '1 hour'
        and resolved_at is null
    ) then
      insert into public.admin_alerts (type, payload)
      values ('fraud_order_spike', jsonb_build_object(
        'businessId', p_business_id,
        'recentHourCount', v_recent_hour_count,
        'averageHourlyCount', v_avg_hourly,
        'orderId', v_order_id
      ));
    end if;
  end if;

  if p_payment_intent = 'prepaid' then
    v_status := 'pending_acceptance';
  else
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = p_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = p_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'standard_validation_rule');
    end if;

    if v_requires_validation then
      if v_pickup_now then
        -- `validando` SIGNIFICA «LA CAJERA LLAMA POR TELÉFONO» (DECISIONS §8),
        -- y no se llama a quien está al otro lado del mostrador. Las señales
        -- que llevaron hasta aquí NO se pierden: `requires_validation`,
        -- `validation_reason_code` y `risk_flags` se guardan igual, y la
        -- tarjeta del tablero las enseña. Lo que cambia es quién resuelve la
        -- duda: no una llamada, sino la persona que lo tiene delante y que
        -- todavía no ha aceptado el pedido.
        v_risk_flags := v_risk_flags || jsonb_build_object('resolvedAtCounter', true);
      else
        v_status := 'validando';
      end if;
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    delivery_fee = v_delivery_fee,
    delivery_fee_source = v_fee_source,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      -- B.2: round() simple, sin greatest(0,...).
      -- R1 ya garantiza que p_client_pays_with >= total; greatest ocultaba el problema.
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2)
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method,
    'pickupTiming', v_pickup_timing,
    'requiresValidation', v_requires_validation, 'riskFlags', v_risk_flags
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'cliente', p_customer_user_id,
    jsonb_build_object(
      'itemCount', jsonb_array_length(p_items),
      'status', v_status,
      'requiresValidation', v_requires_validation,
      'validationReasonCode', v_validation_reason,
      'riskFlags', v_risk_flags
    ));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', v_status, 'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee,
    'promoApplied', v_promo_applied,
    'pickupTiming', v_pickup_timing
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_customer_order(
  uuid, uuid, public.delivery_method, public.payment_intent, text, text, jsonb,
  text, text, numeric, numeric, public.order_source, numeric,
  double precision, double precision, double precision, numeric, text, text,
  integer, timestamptz, text) TO service_role;


-- ── F · advance_order: quién lleva un recojo hasta el final ────────────────
--
-- Dos acciones nuevas, las dos del NEGOCIO, que son las que faltaban para que
-- un recojo pudiera terminar:
--
--   · `handover`        — el cliente se llevó su pedido. Es el `deliver` del
--                         mostrador: cierra en `delivered`, fija el cobro real
--                         y genera la comisión de recojo.
--   · `pickup_no_show`  — el cliente nunca vino. Es el `no_show` del mostrador:
--                         cancela y escribe el strike, anclado solo por
--                         teléfono porque en un recojo no hay dirección.
--
-- Y tres cortes para que ningún recojo se cuele en el flujo de reparto: la
-- guarda 0 de `take`, el `appears_in_queue_at` de `accept`, y la rama de
-- `ready` que evita el `least(NULL, now())` que abriría la cola sin querer.
--
-- Misma firma que antes: sin DROP, sin riesgo de sobrecarga.
CREATE OR REPLACE FUNCTION public.advance_order(p_order_id uuid, p_actor_user_id uuid, p_actor_role user_role, p_action text, p_params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_business public.businesses;
  v_driver_id uuid;
  v_new_status public.order_status;
  v_band public.distance_band;
  v_commission numeric;
  v_commission_amount numeric;
  v_delivery_fee_charged numeric;
  v_commissions jsonb;
  v_bands jsonb;
  v_prep int;
  v_slots int;
  v_blocked boolean;
  v_cancel_reason public.cancel_reason;
  v_cancel_reason_detail text;
  v_no_show_min int;
  v_remaining_min int;
  v_release_reason text;
  -- Cobro real de la entrega (0140).
  v_payment_real public.payment_real;
  v_total numeric;
  v_cash numeric;
  v_yape numeric;
  v_pays_with numeric;
  v_cash_owed numeric;
  v_change numeric;
  -- Adelanto de vuelto y parte en efectivo del cobro real (0146).
  v_advance numeric;
  v_planned_cash numeric;
  v_cash_portion numeric;
  -- 0220: desde cuándo la comida lleva esperando en el mostrador.
  v_waiting_since timestamptz;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;

  IF p_actor_role = 'business' THEN
    IF v_business.user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'No autorizado sobre este pedido' USING errcode = 'P0001';
    END IF;
  ELSIF p_actor_role = 'driver' THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = p_actor_user_id;
    IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Motorizado no encontrado' USING errcode = 'P0001'; END IF;
  END IF;

  CASE p_action
    WHEN 'accept' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'pending_acceptance' THEN RAISE EXCEPTION 'El pedido no esta pendiente de aceptacion' USING errcode = 'P0001'; END IF;
      
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      IF v_order.payment_intent = 'prepaid' THEN
        v_new_status := 'awaiting_payment';
      ELSE
        v_new_status := 'preparing';
      END IF;

    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'confirmed' THEN RAISE EXCEPTION 'El pedido no esta confirmado' USING errcode = 'P0001'; END IF;
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';

    WHEN 'ready' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no esta en cocina ni esperando recojo' USING errcode = 'P0001';
      END IF;

      IF v_order.ready_early_used THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'readyEarlyUsed', ready_early_used, 'readyEarlyAt', ready_early_at,
            'alreadyReady', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;
      -- EN UN RECOJO NO HAY MOTORIZADO QUE ESPERAR (0220).
      -- `waiting_driver` no es un sinónimo de «lista»: es literalmente lo que
      -- mete el pedido en la cola de `apps/motorizados` (ver `ord_driver_read`).
      -- Un recojo que pasara por ahí saldría en la pantalla de todos los
      -- motorizados como trabajo disponible, y el primero en tomarlo se iría a
      -- entregar a domicilio una comida que el cliente viene a recoger.
      IF v_order.delivery_method = 'pickup' THEN
        v_new_status := 'ready_for_pickup';
      ELSIF v_order.driver_id IS NULL THEN
        v_new_status := 'waiting_driver';
      ELSE
        v_new_status := v_order.status;
      END IF;

    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Accion solo del motorizado' USING errcode = 'P0001'; END IF;
      -- 0220 · Guarda 0: UN RECOJO NO SE TOMA.
      -- La policy `ord_driver_read` ya no se los enseña y `accept` ya no les
      -- abre la cola (`appears_in_queue_at` queda NULL), pero esta funcion la
      -- llama el service client, que no pasa por RLS. La regla se dice aqui
      -- tambien, en el sitio donde no hay forma de rodearla.
      IF v_order.delivery_method = 'pickup' THEN
        RAISE EXCEPTION 'Este pedido es de recojo en el local: no hay nada que llevar' USING errcode = 'P0001';
      END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver') THEN RAISE EXCEPTION 'El pedido no esta disponible para tomar' USING errcode = 'P0001'; END IF;
      IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'El pedido ya tiene motorizado' USING errcode = 'P0001'; END IF;

      -- 0128 · Guarda 1: el motorizado tiene que estar autorizado en el negocio.
      -- Replica la rama de `ord_driver_read` que filtra por `driver_restaurants`,
      -- pero con `v_driver_id`: dentro de una funcion SECURITY DEFINER llamada por
      -- el service client, `auth.uid()` es NULL y `current_driver_id()` devolveria
      -- NULL, dejando la guarda siempre en falso.
      IF NOT EXISTS (
        SELECT 1 FROM public.driver_restaurants
         WHERE driver_id = v_driver_id
           AND business_id = v_order.business_id
      ) THEN
        RAISE EXCEPTION 'No estas autorizado para este negocio' USING errcode = 'P0001';
      END IF;

      -- 0128 · Guarda 2: la ventana de cola tiene que estar abierta.
      -- Solo aplica a `preparing`. `waiting_driver` pasa sin condicion de tiempo:
      -- la comida ya esta lista y bloquearla dejaria el pedido enfriandose sin que
      -- nadie pudiera tomarlo. Es el mismo criterio del board del motorizado
      -- (use-driver-orders.ts). NULL se rechaza: si el reloj no arranco, la ventana
      -- no esta abierta. El limite es `<= now()`, o sea que el instante exacto de
      -- apertura YA permite tomar (portado del GET de driver/orders/[id]).
      IF v_order.status = 'preparing'
         AND (v_order.appears_in_queue_at IS NULL OR v_order.appears_in_queue_at > now()) THEN
        RAISE EXCEPTION 'Este pedido aun no esta disponible para tomar' USING errcode = 'P0001';
      END IF;

      v_new_status := 'heading_to_restaurant';

    WHEN 'arrived' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'heading_to_restaurant' THEN RAISE EXCEPTION 'El motorizado no va al local' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_at_restaurant';

    WHEN 'pickup' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'waiting_at_restaurant' THEN RAISE EXCEPTION 'El pedido no esta listo para recoger' USING errcode = 'P0001'; END IF;
      -- La banda ya no la declara el motorizado (0120): sale del pedido, que
      -- es donde la dejara el calculo por ubicacion (web) o la cajera (manual).
      -- El parametro se sigue aceptando para no romper llamadas existentes.
      v_band := COALESCE(
        (p_params ->> 'band')::public.distance_band,
        v_order.delivery_distance_band,
        'near'::public.distance_band
      );
      v_slots := least(3, greatest(1, COALESCE((p_params ->> 'slots')::int, 1)));
      v_new_status := 'picked_up';

    WHEN 'arrived_customer' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta en reparto' USING errcode = 'P0001'; END IF;

      IF v_order.arrived_at_customer_at IS NOT NULL THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'arrivedAtCustomerAt', arrived_at_customer_at, 'alreadyArrived', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;
      v_new_status := v_order.status;

    WHEN 'deliver' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta recogido' USING errcode = 'P0001'; END IF;
      v_new_status := 'delivered';

      -- ── COBRO REAL (0140) ──────────────────────────────────────────────────
      -- El cliente puede pagar distinto de lo planeado, y hasta ahora el unico
      -- dato que se guardaba era el metodo. Aqui se valida y se deriva lo que
      -- de verdad importa aguas abajo: cuanto efectivo se lleva el motorizado.
      v_total := COALESCE(v_order.order_amount, 0) + COALESCE(v_order.delivery_fee, 0);
      v_payment_real := COALESCE((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash');

      -- Un prepago no se re-cobra: el metodo no es del motorizado.
      IF v_order.payment_intent = 'prepaid' THEN
        v_payment_real := 'paid_prepaid';
      END IF;

      IF v_payment_real NOT IN ('paid_prepaid', 'paid_cash', 'paid_yape', 'paid_mixed') THEN
        RAISE EXCEPTION 'Metodo de cobro no valido para una entrega' USING errcode = 'P0001';
      END IF;

      v_pays_with := COALESCE((p_params ->> 'clientPaysWith')::numeric, v_order.client_pays_with);

      -- ── EL ADELANTO DE VUELTO (0146) ─────────────────────────────────────
      -- El sencillo lo pone SIEMPRE la caja: la cajera se lo da al motorizado
      -- antes de que salga. Es dinero del negocio en su bolsillo desde ese
      -- momento, asi que se rinde pague el cliente como pague.
      --
      -- Sale de `v_order` (la PRE-IMAGEN, leida con FOR UPDATE arriba) y NUNCA
      -- de `p_params`: es un hecho del plan, ocurrido antes de la entrega. El
      -- motorizado no lo declara porque no es suyo declararlo.
      v_planned_cash := CASE v_order.payment_intent
                          WHEN 'pending_cash'  THEN v_total
                          WHEN 'pending_mixed' THEN COALESCE(v_order.cash_amount, 0)
                          ELSE 0
                        END;

      -- `change_to_give` se persiste al crear desde 0131 (manual) y 0143 (B2C).
      -- El COALESCE cubre las filas manuales creadas entre 0092 y 0131, donde
      -- llego NULL: para ellas se deriva del billete que declaro la cajera.
      IF v_planned_cash > 0 THEN
        v_advance := COALESCE(
          v_order.change_to_give,
          GREATEST(round(COALESCE(v_order.client_pays_with, v_planned_cash) - v_planned_cash, 2), 0),
          0
        );
      ELSE
        v_advance := 0;
      END IF;

      IF v_payment_real = 'paid_mixed' THEN
        -- Si no viene division, se asume la planeada. Un mixto SIN division en
        -- ningun lado no se puede liquidar, asi que se rechaza.
        v_cash := COALESCE((p_params ->> 'cashAmount')::numeric, v_order.cash_amount);
        v_yape := COALESCE((p_params ->> 'yapeAmount')::numeric, v_order.yape_amount);

        IF v_cash IS NULL OR v_yape IS NULL THEN
          RAISE EXCEPTION 'Un pago mixto necesita las dos partes' USING errcode = 'P0001';
        END IF;
        IF v_cash <= 0 OR v_yape <= 0 THEN
          RAISE EXCEPTION 'Las dos partes de un pago mixto deben ser mayores que cero'
            USING errcode = 'P0001';
        END IF;
        IF round(v_cash + v_yape, 2) <> round(v_total, 2) THEN
          RAISE EXCEPTION 'Las partes suman % y el pedido es %', round(v_cash + v_yape, 2), round(v_total, 2)
            USING errcode = 'P0001';
        END IF;

        v_cash_portion := v_cash;

      ELSIF v_payment_real = 'paid_cash' THEN
        v_cash := v_total;
        v_yape := NULL;
        v_cash_portion := v_total;

      ELSE
        -- paid_yape y paid_prepaid: el motorizado no le COBRA efectivo al
        -- cliente. Ojo: eso no quiere decir que no lleve efectivo encima —
        -- el adelanto sigue en su bolsillo y se suma abajo.
        v_cash := NULL;
        v_yape := CASE WHEN v_payment_real = 'paid_yape' THEN v_total ELSE NULL END;
        v_cash_portion := 0;
        v_pays_with := NULL;
      END IF;

      -- El billete se compara contra LO QUE SE LE COBRA AL CLIENTE, no contra
      -- lo que el motorizado acabara rindiendo (0146). Antes se comparaba con
      -- `v_cash_owed`, que ahora incluye el adelanto: con esa comparacion, el
      -- camino "pago exacto" de la hoja —que manda clientPaysWith = total—
      -- quedaria rechazado por no cubrir un sencillo que el cliente ni vio.
      IF v_cash_portion > 0 AND v_pays_with IS NOT NULL THEN
        IF round(v_pays_with, 2) < round(v_cash_portion, 2) THEN
          RAISE EXCEPTION 'El billete de % no cubre los % en efectivo', round(v_pays_with, 2), round(v_cash_portion, 2)
            USING errcode = 'P0001';
        END IF;
        v_change := round(v_pays_with - v_cash_portion, 2);
      ELSE
        v_change := NULL;
      END IF;

      -- ── TODO LO DEL NEGOCIO VUELVE (0146) ────────────────────────────────
      --   rendir = adelanto + efectivo recibido - vuelto devuelto
      --          = adelanto + parte en efectivo del pedido
      -- La segunda forma es la primera despues de simplificar, y no depende
      -- del billete: si el cliente paga con 50 un pedido de 45, el motorizado
      -- se queda con el billete y devuelve el adelanto de 5, y sigue debiendo
      -- 50. Si paga exacto, debe los 45 mas los 5 que no llego a usar.
      v_cash_owed := round(v_advance + v_cash_portion, 2);

    WHEN 'no_show' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'Solo se reporta no-show con el pedido en reparto' USING errcode = 'P0001'; END IF;

      IF v_order.arrived_at_customer_at IS NULL THEN
        RAISE EXCEPTION 'Primero marca que llegaste al domicilio.' USING errcode = 'P0001';
      END IF;

      SELECT COALESCE((value ->> 'noShowWaitMinutes')::int, 5) INTO v_no_show_min
      FROM public.app_settings WHERE key = 'timers';
      v_no_show_min := COALESCE(v_no_show_min, 5);

      IF now() - v_order.arrived_at_customer_at < (v_no_show_min || ' minutes')::interval THEN
        v_remaining_min := CEIL(EXTRACT(EPOCH FROM ((v_order.arrived_at_customer_at + (v_no_show_min || ' minutes')::interval) - now())) / 60.0)::int;
        IF v_remaining_min < 1 THEN v_remaining_min := 1; END IF;
        RAISE EXCEPTION 'Espera % % más antes de reportar que el cliente no aparece.',
          v_remaining_min,
          CASE WHEN v_remaining_min = 1 THEN 'minuto' ELSE 'minutos' END
          USING errcode = 'P0001';
      END IF;

      v_new_status := 'cancelled';

    WHEN 'release' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN
        RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001';
      END IF;

      IF v_order.status = 'picked_up' THEN
        RAISE EXCEPTION 'No puedes soltar un pedido que ya recogiste. Contacta a soporte.' USING errcode = 'P0001';
      END IF;

      IF v_order.status NOT IN ('heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no está en un estado que permita soltarlo' USING errcode = 'P0001';
      END IF;

      v_release_reason := NULLIF(p_params ->> 'reason', '');
      IF v_release_reason IS NULL OR v_release_reason NOT IN ('averia', 'emergencia', 'muy_lejos', 'otro') THEN
        RAISE EXCEPTION 'Motivo de liberación es obligatorio (averia, emergencia, muy_lejos, otro)' USING errcode = 'P0001';
      END IF;

      IF v_order.estimated_ready_at IS NOT NULL
         AND v_order.estimated_ready_at > now()
         AND NOT COALESCE(v_order.ready_early_used, false) THEN
        v_new_status := 'preparing';
      ELSE
        v_new_status := 'waiting_driver';
      END IF;

    WHEN 'handover' THEN
      -- ── EL EQUIVALENTE DE `deliver` PARA UN RECOJO (0220) ────────────────
      -- No se reutiliza `deliver` porque ese exige `picked_up` y motorizado
      -- asignado, y ademas escribe `cash_owed_at_delivery`, que es lo que el
      -- motorizado tiene que RENDIR al negocio. En un recojo el dinero entra
      -- directo a la caja: no hay nada que rendir, y escribir ahi un numero
      -- distinto de cero le inventaria una deuda al corte de caja de la noche.
      IF p_actor_role NOT IN ('business', 'admin') THEN
        RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001';
      END IF;
      IF v_order.delivery_method <> 'pickup' THEN
        RAISE EXCEPTION 'Esta accion es solo para pedidos de recojo' USING errcode = 'P0001';
      END IF;
      IF v_order.status <> 'ready_for_pickup' THEN
        RAISE EXCEPTION 'El pedido todavia no esta listo para entregar en el mostrador' USING errcode = 'P0001';
      END IF;

      v_new_status := 'delivered';

      -- El cobro real, con la misma regla que `deliver`: un prepago no se
      -- vuelve a cobrar, y el resto sale de lo que declare la cajera.
      v_payment_real := COALESCE((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash');
      IF v_order.payment_intent = 'prepaid' THEN
        v_payment_real := 'paid_prepaid';
      END IF;
      IF v_payment_real NOT IN ('paid_prepaid', 'paid_cash', 'paid_yape') THEN
        -- `paid_mixed` no entra: partir un cobro en dos existe porque el
        -- motorizado lleva efectivo y el cliente completa por Yape. En el
        -- mostrador no hay tal reparto que declarar.
        RAISE EXCEPTION 'Metodo de cobro no valido para un recojo' USING errcode = 'P0001';
      END IF;

      -- LA COMISION DEL RECOJO, con la MISMA fuente y el mismo override que
      -- usa `pickup` para el delivery: `app_settings.commissions` y
      -- `businesses.commission_override_pickup`. Sin esto, un recojo entregado
      -- pasaba por `generate_delivery_charges` con `commission_amount` NULL y
      -- envio 0, o sea sin generar NINGUN cargo: el recojo salia gratis.
      SELECT value INTO v_commissions FROM public.app_settings WHERE key = 'commissions';
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        1.00
      );
      v_delivery_fee_charged := 0;
      v_commission := v_commission_amount + v_delivery_fee_charged;

    WHEN 'pickup_no_show' THEN
      -- ── EL CLIENTE NUNCA VINO POR SU COMIDA (0220) ───────────────────────
      -- Hasta ahora el unico escritor de `customer_strikes` era el `no_show`
      -- del motorizado, o sea que un plantón en el mostrador no dejaba rastro
      -- y el mismo cliente podia repetirlo cada noche. Esta accion es su
      -- espejo: mismo motivo, mismo umbral, misma consecuencia de DECISIONS §8.
      IF p_actor_role NOT IN ('business', 'admin') THEN
        RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001';
      END IF;
      IF v_order.delivery_method <> 'pickup' THEN
        RAISE EXCEPTION 'Esta accion es solo para pedidos de recojo' USING errcode = 'P0001';
      END IF;
      IF v_order.status <> 'ready_for_pickup' THEN
        RAISE EXCEPTION 'Solo se reporta un planton con la comida ya lista en el mostrador' USING errcode = 'P0001';
      END IF;
      IF v_order.customer_phone IS NULL THEN
        -- `customer_strikes.phone` es NOT NULL, y un strike sin telefono no
        -- ancla en nada: no habria forma de que contase la proxima vez.
        RAISE EXCEPTION 'Este pedido no tiene telefono al que anclar la falta' USING errcode = 'P0001';
      END IF;

      -- LA MISMA ESPERA QUE EN LA PUERTA, Y A PROPOSITO UN SOLO NUMERO.
      -- `noShowWaitMinutes` ya significa «cuanto se espera a un cliente que no
      -- aparece»; que el sitio sea una puerta o un mostrador no cambia la
      -- pregunta. Aqui es un SUELO contra el toque accidental justo despues de
      -- marcar «lista», no la espera de verdad: esa la decide la cajera, que
      -- es quien ve si la bolsa lleva cinco minutos o cuarenta en la repisa.
      SELECT COALESCE((value ->> 'noShowWaitMinutes')::int, 5) INTO v_no_show_min
      FROM public.app_settings WHERE key = 'timers';
      v_no_show_min := COALESCE(v_no_show_min, 5);

      v_waiting_since := COALESCE(v_order.ready_for_pickup_at, v_order.updated_at);
      IF now() - v_waiting_since < (v_no_show_min || ' minutes')::interval THEN
        v_remaining_min := CEIL(EXTRACT(EPOCH FROM ((v_waiting_since + (v_no_show_min || ' minutes')::interval) - now())) / 60.0)::int;
        IF v_remaining_min < 1 THEN v_remaining_min := 1; END IF;
        RAISE EXCEPTION 'Espera % % mas antes de reportar que el cliente no vino.',
          v_remaining_min,
          CASE WHEN v_remaining_min = 1 THEN 'minuto' ELSE 'minutos' END
          USING errcode = 'P0001';
      END IF;

      v_new_status := 'cancelled';

    WHEN 'cancel' THEN
      IF p_actor_role NOT IN ('business', 'admin') THEN RAISE EXCEPTION 'No autorizado para cancelar' USING errcode = 'P0001'; END IF;
      IF v_order.status IN ('delivered', 'cancelled') THEN RAISE EXCEPTION 'El pedido ya esta cerrado' USING errcode = 'P0001'; END IF;
      v_new_status := 'cancelled';

    ELSE
      RAISE EXCEPTION 'Accion desconocida: %', p_action USING errcode = 'P0001';
  END CASE;

  IF p_action = 'release' THEN
    -- Los sellos de tiempo del intento que se suelta se borran con el.
    -- `orders_before_write` los pone con COALESCE(existente, now()), o sea que
    -- son pegajosos: sin esta limpieza el motorizado que recoja el pedido
    -- despues abre la pantalla con el reloj del anterior ya corriendo ("llevas
    -- 30 min esperando en el local", con su aviso de demora inusual).
    UPDATE public.orders
       SET driver_id = NULL,
           status = v_new_status,
           heading_at = NULL,
           waiting_at_restaurant_at = NULL
     WHERE id = p_order_id;

    UPDATE public.order_transfer_requests
       SET status = 'invalidated',
           resolved_at = now()
     WHERE order_id = p_order_id AND status = 'pending';

    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderReleased', jsonb_build_object(
      'driverId', v_driver_id, 'reason', v_release_reason, 'note', p_params ->> 'note'
    ));

    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.release', 'driver', p_actor_user_id, p_params);
  ELSIF p_action = 'take' THEN
    UPDATE public.orders SET status = v_new_status, driver_id = v_driver_id WHERE id = p_order_id;
  ELSIF p_action = 'preparing' THEN
    UPDATE public.orders
      SET status = v_new_status, prep_time_minutes = v_prep,
          estimated_ready_at = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
      WHERE id = p_order_id;
  ELSIF p_action = 'pickup' THEN
    SELECT value INTO v_commissions FROM public.app_settings WHERE key = 'commissions';
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';

    v_delivery_fee_charged := CASE
      WHEN v_order.delivery_method = 'pickup' THEN 0
      ELSE COALESCE(v_order.delivery_fee, (v_bands ->> 'near')::numeric, 2.00)
    END;

    -- 0125: la comisión ya NO depende de la banda y ya NO se resta el envío.
    -- `commissions.delivery` es la comisión SOLA; el envío se suma aparte en
    -- `v_commission`. Los defaults del COALESCE se corrigen a 1.00 / 1.50:
    -- los viejos (0.50 / 3.00 / 3.50) quedaron desfasados desde la 0110.
    IF v_order.delivery_method = 'pickup' THEN
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        1.00
      );
    ELSE
      v_commission_amount := COALESCE(
        v_business.commission_override_delivery,
        (v_commissions ->> 'delivery')::numeric,
        1.50
      );
    END IF;

    v_commission := v_commission_amount + v_delivery_fee_charged;

    UPDATE public.orders
      SET status = v_new_status,
          delivery_distance_band = v_band,
          tindivo_commission = v_commission,
          commission_amount = v_commission_amount,
          delivery_fee_charged = v_delivery_fee_charged,
          occupancy_slots = v_slots
      WHERE id = p_order_id;
  ELSIF p_action = 'arrived_customer' THEN
    UPDATE public.orders
      SET arrived_at_customer_at = now(),
          arrived_at_customer_lat = (p_params ->> 'lat')::numeric,
          arrived_at_customer_lng = (p_params ->> 'lng')::numeric,
          arrived_at_customer_accuracy_m = (p_params ->> 'accuracy_m')::numeric
      WHERE id = p_order_id;
  ELSIF p_action = 'deliver' THEN
    -- `cash_owed_at_delivery` es la UNICA fuente de verdad del corte de caja
    -- desde 0141. Existia desde 0002 y no la escribia nadie; la liquidacion
    -- deducia el efectivo del metodo, que es justo lo que el mixto rompe.
    --
    -- `cash_amount`/`yape_amount` solo se pisan en un mixto, que es el unico
    -- caso donde significan algo. En los demas se conserva lo que planeo la
    -- cajera: sirve para comparar plan contra realidad.
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = v_payment_real,
          cash_owed_at_delivery = v_cash_owed,
          change_advanced = v_advance,
          cash_amount = CASE WHEN v_payment_real = 'paid_mixed' THEN v_cash ELSE cash_amount END,
          yape_amount = CASE WHEN v_payment_real = 'paid_mixed' THEN v_yape ELSE yape_amount END,
          -- Condicionado a `v_cash_portion`, no a `v_cash_owed` (0146): con un
          -- Yape que solo debe el adelanto, `v_cash_owed > 0` habria escrito el
          -- NULL de `v_pays_with` encima del billete que declaro la cajera,
          -- borrando el plan contra el que se compara la realidad.
          client_pays_with = CASE WHEN v_cash_portion > 0 THEN v_pays_with ELSE client_pays_with END,
          change_to_give = CASE WHEN v_cash_portion > 0 THEN v_change ELSE change_to_give END
      WHERE id = p_order_id;
  ELSIF p_action = 'no_show' THEN
    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = 'no_show',
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
    INSERT INTO public.customer_strikes (
      customer_user_id, phone, delivery_reference,
      delivery_coordinates_lat, delivery_coordinates_lng, order_id, reason, reported_by
    ) VALUES (
      v_order.customer_user_id, v_order.customer_phone, v_order.delivery_reference,
      v_order.delivery_coordinates_lat, v_order.delivery_coordinates_lng, p_order_id, 'no_show', p_actor_user_id
    );
    v_blocked := public.customer_contraentrega_blocked(v_order.customer_phone, v_order.delivery_reference);
    IF v_blocked AND v_order.customer_user_id IS NOT NULL THEN
      UPDATE public.customer_profiles
        SET contraentrega_blocked = true,
            strikes = (SELECT count(*) FROM public.customer_strikes WHERE phone = v_order.customer_phone)
        WHERE user_id = v_order.customer_user_id;
    END IF;
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'CustomerNoShow', jsonb_build_object(
      'phone', v_order.customer_phone, 'reference', v_order.delivery_reference, 'blocked', v_blocked
    ));
  ELSIF p_action = 'handover' THEN
    -- `cash_owed_at_delivery` y `change_advanced` van a 0 EXPLICITOS y no a
    -- NULL: la liquidacion de la noche los suma, y un NULL ahi se lee como
    -- «todavia no se sabe» en vez de como «no hay nada que rendir».
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = v_payment_real,
          tindivo_commission = v_commission,
          commission_amount = v_commission_amount,
          delivery_fee_charged = v_delivery_fee_charged,
          cash_owed_at_delivery = 0,
          change_advanced = 0
      WHERE id = p_order_id;
  ELSIF p_action = 'pickup_no_show' THEN
    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = 'no_show',
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
    -- LA MISMA FORMA QUE EL STRIKE DEL MOTORIZADO, salvo el ancla de direccion.
    -- `delivery_reference` y las coordenadas van NULL a proposito y no por
    -- omision: en un recojo no hay domicilio del cliente, asi que no hay nada
    -- que anclar ahi. `customer_contraentrega_blocked` cuenta por telefono O
    -- por referencia, y con la referencia NULL esa mitad simplemente no suma
    -- (verificado: la funcion corta con `p_reference is not null`).
    INSERT INTO public.customer_strikes (
      customer_user_id, phone, delivery_reference,
      delivery_coordinates_lat, delivery_coordinates_lng, order_id, reason, reported_by
    ) VALUES (
      v_order.customer_user_id, v_order.customer_phone, NULL,
      NULL, NULL, p_order_id, 'no_show', p_actor_user_id
    );
    v_blocked := public.customer_contraentrega_blocked(v_order.customer_phone, NULL);
    IF v_blocked AND v_order.customer_user_id IS NOT NULL THEN
      UPDATE public.customer_profiles
        SET contraentrega_blocked = true,
            strikes = (SELECT count(*) FROM public.customer_strikes WHERE phone = v_order.customer_phone)
        WHERE user_id = v_order.customer_user_id;
    END IF;
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'CustomerNoShow', jsonb_build_object(
      'phone', v_order.customer_phone, 'reference', NULL, 'blocked', v_blocked,
      'channel', 'pickup'
    ));
  ELSIF p_action = 'cancel' THEN
    v_cancel_reason := COALESCE((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled');
    v_cancel_reason_detail := NULLIF(p_params ->> 'cancelReasonDetail', '');

    IF v_cancel_reason = 'business_cancelled' AND v_cancel_reason_detail IS NULL THEN
      RAISE EXCEPTION 'Motivo detallado de cancelación es obligatorio para cancelaciones de negocio' USING errcode = 'P0001';
    END IF;

    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = v_cancel_reason,
          cancel_reason_detail = v_cancel_reason_detail,
          cancel_note = NULLIF(p_params ->> 'reasonText', ''),
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
  ELSIF p_action = 'accept' THEN
    IF v_new_status = 'preparing' THEN
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep,
            estimated_ready_at = now() + (v_prep || ' minutes')::interval,
            -- `appears_in_queue_at` ES EL RELOJ QUE ABRE EL PEDIDO A LOS
            -- MOTORIZADOS, no un dato de cocina: la guarda 2 de `take` y la
            -- lista de `use-driver-orders` cuelgan de el. En un recojo se queda
            -- NULL, y NULL ahi significa «la ventana nunca se abre», que es
            -- exactamente lo que se quiere (0220).
            appears_in_queue_at = CASE
              WHEN v_order.delivery_method = 'pickup' THEN NULL
              ELSE now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
            END
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep
        WHERE id = p_order_id;
    END IF;
  ELSIF p_action = 'ready' THEN
    IF v_order.delivery_method = 'pickup' THEN
      -- OJO CON `least(NULL, now())`: en Postgres `least` IGNORA los NULL, asi
      -- que la rama de abajo le habria puesto `appears_in_queue_at = now()` a
      -- un recojo cuyo valor es NULL justo para que nadie lo tome — abriendo la
      -- cola de motorizados en el ultimo sitio donde uno la buscaria.
      UPDATE public.orders
        SET status = v_new_status,
            ready_early_used = true,
            ready_early_at = now(),
            estimated_ready_at = least(estimated_ready_at, now())
        WHERE id = p_order_id;
    ELSIF v_order.driver_id IS NULL THEN
      UPDATE public.orders
        SET status = v_new_status,
            ready_early_used = true,
            ready_early_at = now(),
            estimated_ready_at = least(
              estimated_ready_at,
              now() + (public.queue_lead_minutes() || ' minutes')::interval
            ),
            appears_in_queue_at = least(appears_in_queue_at, now())
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET ready_early_used = true,
            ready_early_at = now(),
            estimated_ready_at = least(
              estimated_ready_at,
              now() + (public.queue_lead_minutes() || ' minutes')::interval
            )
        WHERE id = p_order_id;
    END IF;
  ELSE
    UPDATE public.orders SET status = v_new_status WHERE id = p_order_id;
  END IF;

  IF p_action <> 'release' THEN
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
      'band', delivery_distance_band, 'tindivoCommission', tindivo_commission,
      'commissionAmount', commission_amount, 'deliveryFeeCharged', delivery_fee_charged,
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes,
      'cancelReason', cancel_reason, 'cancelReasonDetail', cancel_reason_detail,
      'cancelledAt', cancelled_at,
      'readyEarlyUsed', ready_early_used, 'readyEarlyAt', ready_early_at
    ) FROM public.orders WHERE id = p_order_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.advance_order(uuid, uuid, public.user_role, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order(uuid, uuid, public.user_role, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.advance_order(uuid, uuid, public.user_role, text, jsonb) IS
  'Máquina de estados del pedido. Acciones del negocio: accept · preparing · '
  'ready · handover · pickup_no_show · cancel. Del motorizado: take · arrived · '
  'pickup · arrived_customer · deliver · no_show · release. `handover` y '
  '`pickup_no_show` son los espejos de `deliver` y `no_show` para un recojo, '
  'donde no hay motorizado que las escriba (0220).';
