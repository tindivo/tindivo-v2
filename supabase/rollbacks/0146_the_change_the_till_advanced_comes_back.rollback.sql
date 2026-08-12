-- =============================================================================
-- ROLLBACK 0146 · Devuelve advance_order al estado de la 0140
-- =============================================================================
--
-- ⚠️ ESTO VUELVE A FUGAR DINERO. La 0146 existe porque el sencillo lo adelanta
--    la caja y el motorizado se lo quedaba sin que nada lo registrara. Revertir
--    reabre esa fuga: con un pedido de 45 y 5 de adelanto se le vuelven a pedir
--    45 pague como pague, y en un Yape se le pide 0 llevando 5 encima.
--
--    Si el motivo para revertir es que la fórmula da un número que no cuadra,
--    lo que hay que revisar primero es de dónde sale el adelanto
--    (`change_to_give` de la pre-imagen), no la fórmula.
--
-- ⚠️ LO YA ENTREGADO NO SE TOCA. Las filas entregadas bajo la 0146 conservan su
--    `cash_owed_at_delivery` con el adelanto ya sumado, y su `change_advanced`.
--    Es correcto: esas rendiciones son contabilidad y el motorizado llevaba ese
--    dinero de verdad. Recalcularlas hacia atrás cambiaría lo que la cajera ya
--    contó.
--
-- ⚠️ ORDEN. Si la pantalla de Efectivo ya enseña el desglose del adelanto,
--    revertila antes que esto: se quedaría explicando un número que la base
--    dejó de calcular.
--
-- LA COLUMNA SE QUEDA. `orders.change_advanced` no se borra: contiene el dato
-- de las entregas hechas bajo la 0146 y es lo único que permite explicar sus
-- importes. Sin escribirse es inerte. Para quitarla de verdad, y solo si se
-- acepta perder eso:
--
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS change_advanced;
-- =============================================================================

-- Cuerpo EXACTO de la 0140, volcado con `pg_get_functiondef` antes de aplicar
-- la 0146.

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

        v_cash_owed := v_cash;

      ELSIF v_payment_real = 'paid_cash' THEN
        v_cash := v_total;
        v_yape := NULL;
        v_cash_owed := v_total;

      ELSE
        -- paid_yape y paid_prepaid: el motorizado no se lleva efectivo.
        v_cash := NULL;
        v_yape := CASE WHEN v_payment_real = 'paid_yape' THEN v_total ELSE NULL END;
        v_cash_owed := 0;
        v_pays_with := NULL;
      END IF;

      IF v_cash_owed > 0 AND v_pays_with IS NOT NULL THEN
        IF round(v_pays_with, 2) < round(v_cash_owed, 2) THEN
          RAISE EXCEPTION 'El billete de % no cubre los % en efectivo', round(v_pays_with, 2), round(v_cash_owed, 2)
            USING errcode = 'P0001';
        END IF;
        v_change := round(v_pays_with - v_cash_owed, 2);
      ELSE
        v_change := NULL;
      END IF;

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
          cash_amount = CASE WHEN v_payment_real = 'paid_mixed' THEN v_cash ELSE cash_amount END,
          yape_amount = CASE WHEN v_payment_real = 'paid_mixed' THEN v_yape ELSE yape_amount END,
          client_pays_with = CASE WHEN v_cash_owed > 0 THEN v_pays_with ELSE client_pays_with END,
          change_to_give = CASE WHEN v_cash_owed > 0 THEN v_change ELSE change_to_give END
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
