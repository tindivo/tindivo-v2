-- =============================================================================
-- 0146 · El sencillo que adelantó la caja vuelve a la caja.
--
-- EL PROBLEMA, Y ES DINERO.
--   El vuelto NO lo pone el motorizado: lo pone SIEMPRE la cajera, que le da
--   el sencillo antes de que salga del local. Desde ese momento ese dinero es
--   del negocio y está en el bolsillo del motorizado, pague el cliente como
--   pague después.
--
--   `advance_order('deliver')` no modelaba ese adelanto (0140), así que lo
--   perdía en tres de los cuatro caminos posibles. Con un pedido de S/ 45 y
--   S/ 5 de adelanto:
--
--     · cliente paga con S/ 50  -> el motorizado se queda el billete de 50 y
--       devuelve los 5 del adelanto. Debe 50; se le pedían 45.
--     · cliente paga exacto     -> tiene 45 + los 5 sin usar. Debe 50; 45.
--     · cliente paga por Yape   -> tiene solo los 5. Debe 5; se le pedían 0.
--
--   El primero es el caso más común, y también fugaba. No es fraude: nadie se
--   lo recordaba, y al final del turno ni él sabía que lo tenía.
--
-- LA FORMULA.
--     rendir = adelanto + efectivo recibido del cliente - vuelto devuelto
--            = adelanto + parte en efectivo del pedido
--
--   La segunda forma es la primera simplificada, y es la que implementa esta
--   migración: no depende del billete con el que acabe pagando el cliente, y
--   por eso "pagó exacto" y "pagó con billete" dan el mismo importe — que es
--   lo correcto, porque el motorizado acaba con el mismo dinero encima.
--
--   Es, literalmente, la del legacy: `tindivo-delivery`,
--   `packages/core/src/modules/orders/domain/entities/order.ts:1219-1245`.
--
-- DE DONDE SALE EL ADELANTO.
--   De `change_to_give` de la PRE-IMAGEN, que se persiste al crear desde 0131
--   (manual) y 0143 (B2C). No de `p_params`: el adelanto ocurrió antes de la
--   entrega y no es del motorizado declararlo.
--
--   Se guarda aparte, en `orders.change_advanced`, porque este mismo bloque
--   PISA `change_to_give` con el vuelto realmente devuelto: después de la
--   entrega esa columna ya no responde "cuánto le adelantaron". Son distintas
--   justo en los casos que esta migración viene a arreglar.
--
-- LO QUE CAMBIA DE IMPORTE.
--   Todo pedido con adelanto sube su `cash_owed_at_delivery`. Los pedidos SIN
--   adelanto (el cliente paga justo, no hay vuelto que dar) no se mueven ni un
--   céntimo. Esto NO es un efecto colateral: es el objeto de la migración, y
--   los tests de 0140/0141 que congelaban el importe viejo se actualizan con
--   ella.
--
-- LA VALIDACION DEL BILLETE SE MUEVE.
--   Antes exigía `client_pays_with >= cash_owed`. Con `cash_owed` incluyendo
--   el adelanto, esa comparación rechazaría entregas legítimas: el camino
--   "pagó exacto" de la hoja manda `clientPaysWith = total`, menor que
--   `total + adelanto`. Ahora se compara contra la parte en efectivo del
--   pedido — el billete cubre lo que se le cobra al cliente, no el sencillo
--   que el motorizado ya traía.
--
-- SIN BACKFILL, A PROPOSITO.
--   Las filas ya entregadas se quedan como están. Los ciclos cerrados son
--   contabilidad: recalcularlos cambiaría lo que la cajera ya contó. La
--   columna arranca NULL en todo lo viejo y `order_cash_owed` (0141) sigue
--   leyendo `cash_owed_at_delivery`, que no se toca hacia atrás.
--
-- METODO.
--   Cuerpo generado desde `pg_get_functiondef` de la definición VIVA (la de
--   0140), tocando ÚNICAMENTE la rama `deliver` y su UPDATE. Verificado con
--   `diff`: 10 líneas fuera, 0 en las otras diez ramas de acciones.
--
-- Idempotente: `ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE`.
-- =============================================================================

-- ── 1. El adelanto, como dato propio ─────────────────────────────────────────
--
-- Nullable a propósito: NULL = "esta entrega es anterior a 0146 y nadie midió
-- el adelanto", que no es lo mismo que 0 = "no hubo adelanto". El corte de caja
-- no la lee —lee `cash_owed_at_delivery`, donde ya está sumada—; existe para
-- poder EXPLICAR el número al motorizado cuando pregunte por qué debe S/ 5 de
-- un pedido que se pagó por Yape.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS change_advanced numeric(10,2);

COMMENT ON COLUMN public.orders.change_advanced IS
  'Vuelto que la caja le adelantó al motorizado antes de salir. Snapshot tomado al entregar (0146); NULL en entregas anteriores. Ya está sumado dentro de cash_owed_at_delivery.';

-- ── 2. La rama `deliver` de advance_order ────────────────────────────────────

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
      IF v_order.driver_id IS NULL THEN
        v_new_status := 'waiting_driver';
      ELSE
        v_new_status := v_order.status;
      END IF;

    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Accion solo del motorizado' USING errcode = 'P0001'; END IF;
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
            appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep
        WHERE id = p_order_id;
    END IF;
  ELSIF p_action = 'ready' THEN
    IF v_order.driver_id IS NULL THEN
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


-- ── 3. Guardas: que la reproducción no se haya dejado nada ───────────────────
--
-- Esta función se re-crea entera en cada migración que la toca, y así es como
-- se pierden ramas: 0131 documentó una omisión que sobrevivió a seis
-- reproducciones sin que nadie la viera. Estas comprobaciones fallan la
-- migración en vez de dejar una función mutilada en producción.
DO $guard$
DECLARE
  v_def text;
  v_count int;
  v_action text;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'advance_order';

  IF v_count <> 1 THEN
    RAISE EXCEPTION '0146 abortada: hay % firmas de advance_order, debe haber 1', v_count
      USING errcode = 'P0001';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'advance_order';

  -- Lo que esta migración vino a hacer.
  IF v_def NOT LIKE '%change_advanced = v_advance%' THEN
    RAISE EXCEPTION '0146 abortada: la definición no escribe change_advanced'
      USING errcode = 'P0001';
  END IF;

  IF v_def NOT LIKE '%v_cash_owed := round(v_advance + v_cash_portion, 2)%' THEN
    RAISE EXCEPTION '0146 abortada: la definición no aplica la fórmula del adelanto'
      USING errcode = 'P0001';
  END IF;

  -- Y lo que NO debía tocar: las otras diez ramas de acciones.
  FOREACH v_action IN ARRAY ARRAY[
    'accept', 'preparing', 'ready', 'take', 'arrived', 'pickup',
    'arrived_customer', 'no_show', 'release', 'cancel'
  ] LOOP
    IF v_def NOT LIKE '%WHEN ''' || v_action || '''%' THEN
      RAISE EXCEPTION '0146 abortada: se perdió la rama %', v_action
        USING errcode = 'P0001';
    END IF;
  END LOOP;

  -- 0131 y 0140 pasaron por aquí; que sigan en pie.
  IF v_def NOT LIKE '%change_to_give = CASE WHEN v_cash_portion > 0%' THEN
    RAISE EXCEPTION '0146 abortada: la definición ya no persiste change_to_give al entregar'
      USING errcode = 'P0001';
  END IF;
END
$guard$;
