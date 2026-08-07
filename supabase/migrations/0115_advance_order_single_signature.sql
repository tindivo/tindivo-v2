-- =============================================================================
-- 0115 · advance_order vuelve a tener UNA sola firma
-- =============================================================================
--
-- QUE ROMPIO LA 0114
-- La 0114 declaro los parametros en otro orden y con otro tipo
-- (`p_actor_role text` en vez de `user_role`). Postgres no vio un reemplazo:
-- creo una SEGUNDA funcion. PostgREST resuelve por nombres de parametro y ya no
-- pudo elegir:
--
--   PGRST203 · Could not choose the best candidate function between:
--     public.advance_order(p_order_id => uuid, p_action => text, p_actor_user_id => uuid, p_actor_role => text, p_params => jsonb)
--     public.advance_order(p_order_id => uuid, p_actor_user_id => uuid, p_actor_role => public.user_role, p_action => text, p_params => jsonb)
--
-- Toda transicion de pedido, del motorizado y del negocio, devolvia 500. En
-- local y en produccion. Un type-check verde no lo detecta: el fallo esta en la
-- resolucion de sobrecarga de PostgREST, no en el codigo. Ver AGENTS.md §2.9.
--
-- Y ademas el cuerpo de la 0114 era una retranscripcion a mano, no un dump:
--   · perdio las acciones `accept`, `ready` y `arrived` (0107 y 0109)
--   · referenciaba `public.business_users`, tabla que no existe en este esquema
--   · declaraba `v_band text` -> el UPDATE fallaba contra `public.distance_band`
--   · leia `distanceBand`/`occupancySlots` cuando el endpoint manda `band`/`slots`
--
-- QUE HACE ESTA
--   1. DROP de la sobrecarga huerfana, con la firma exacta para no tocar la buena.
--   2. CREATE OR REPLACE sobre la firma VIVA, partiendo de su
--      `pg_get_functiondef` y aplicando SOLO los cambios que la 0114 pretendia:
--      la accion `arrived_customer` y las dos guardas de `no_show`.
--
-- Las columnas `arrived_at_customer_*` las creo la 0114 y siguen bien: esta
-- migracion no las toca.
--
-- METODO
-- Generada con `scratch/build-0115.py` desde el dump de la firma viva, con
-- asercion sobre el texto exacto de cada linea tocada (20 aserciones en verde).
-- El cuerpo NO se escribio a mano.
-- =============================================================================

-- 1. Fuera la sobrecarga huerfana de 0114. La firma va completa y explicita:
--    cualquier otra combinacion dejaria caer la funcion buena.
drop function if exists public.advance_order(uuid, text, uuid, text, jsonb);

-- 2. La firma viva, con arrived_customer y la ventana de no-show.
CREATE OR REPLACE FUNCTION public.advance_order(p_order_id uuid, p_actor_user_id uuid, p_actor_role public.user_role, p_action text, p_params jsonb DEFAULT '{}'::jsonb)
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
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Acción solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'pending_acceptance' THEN RAISE EXCEPTION 'El pedido no esta pendiente de aceptacion' USING errcode = 'P0001'; END IF;
      
      -- El tiempo de cocción que la cajera eligió se guarda en AMBOS flujos.
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      IF v_order.payment_intent = 'prepaid' THEN
        v_new_status := 'awaiting_payment';
      ELSE
        -- Contraentrega: aceptar y empezar a cocinar es el mismo acto de la
        -- cajera. Va directo a preparing, en una sola transacción, para que un
        -- fallo de red no deje el pedido huérfano entre las dos llamadas.
        v_new_status := 'preparing';
      END IF;

    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'confirmed' THEN RAISE EXCEPTION 'El pedido no esta confirmado' USING errcode = 'P0001'; END IF;
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';

    WHEN 'ready' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      -- Los CUATRO estados en los que la comida puede seguir en cocina.
      -- Traducción de prod (order.ts:1019), que permite waiting_driver,
      -- heading_to_restaurant y waiting_at_restaurant; v2 añade preparing.
      IF v_order.status NOT IN ('preparing', 'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no esta en cocina ni esperando recojo' USING errcode = 'P0001';
      END IF;

      -- Idempotente: la cajera pudo pulsar dos veces. No se reescribe el
      -- timestamp ni se vuelve a notificar, y NO se lanza excepción.
      IF v_order.ready_early_used THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'readyEarlyUsed', ready_early_used, 'readyEarlyAt', ready_early_at,
            'alreadyReady', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;
      -- Sin motorizado, el pedido pasa a esperar recojo. Con motorizado ya
      -- asignado el estado NO cambia: marcar listo declara un hecho sobre la
      -- comida, no una transición del pedido.
      IF v_order.driver_id IS NULL THEN
        v_new_status := 'waiting_driver';
      ELSE
        v_new_status := v_order.status;
      END IF;

    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Accion solo del motorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver') THEN RAISE EXCEPTION 'El pedido no esta disponible para tomar' USING errcode = 'P0001'; END IF;
      IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'El pedido ya tiene motorizado' USING errcode = 'P0001'; END IF;
      v_new_status := 'heading_to_restaurant';

    WHEN 'arrived' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'heading_to_restaurant' THEN RAISE EXCEPTION 'El motorizado no va al local' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_at_restaurant';

    WHEN 'pickup' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'waiting_at_restaurant' THEN RAISE EXCEPTION 'El pedido no esta listo para recoger' USING errcode = 'P0001'; END IF;
      v_band := (p_params ->> 'band')::public.distance_band;
      IF v_order.delivery_method = 'delivery' AND v_band IS NULL THEN
        RAISE EXCEPTION 'Declara la banda (cerca/lejos)' USING errcode = 'P0001';
      END IF;
      v_slots := least(3, greatest(1, COALESCE((p_params ->> 'slots')::int, 1)));
      v_new_status := 'picked_up';

    WHEN 'arrived_customer' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta en reparto' USING errcode = 'P0001'; END IF;

      -- Idempotente: el motorizado pudo pulsar dos veces, o la cola offline
      -- reintentar. Ni el timestamp ni las coordenadas se reescriben, y NO se
      -- lanza excepcion. Mismo patron que 'ready' (alreadyReady).
      IF v_order.arrived_at_customer_at IS NOT NULL THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'arrivedAtCustomerAt', arrived_at_customer_at, 'alreadyArrived', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;

      -- Marcar llegada NO es una transicion: declara un hecho sobre el
      -- motorizado, igual que 'ready' lo declara sobre la comida. El pedido
      -- sigue en picked_up hasta que se entregue o se reporte no-show.
      v_new_status := v_order.status;

    WHEN 'deliver' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta recogido' USING errcode = 'P0001'; END IF;
      v_new_status := 'delivered';

    WHEN 'no_show' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'Solo se reporta no-show con el pedido en reparto' USING errcode = 'P0001'; END IF;

      -- Guarda 1: sin llegada marcada no hay no-show. Un strike es permanente
      -- (bloquea la contraentrega y no hay forma de retirarlo desde ninguna
      -- interfaz), asi que exige haber estado en la puerta.
      IF v_order.arrived_at_customer_at IS NULL THEN
        RAISE EXCEPTION 'Primero marca que llegaste al domicilio.' USING errcode = 'P0001';
      END IF;

      -- Guarda 2: la ventana de espera. Parametro operativo en app_settings,
      -- no hardcode; 5 minutos si falta la clave.
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

    WHEN 'cancel' THEN
      IF p_actor_role NOT IN ('business', 'admin') THEN RAISE EXCEPTION 'No autorizado para cancelar' USING errcode = 'P0001'; END IF;
      IF v_order.status IN ('delivered', 'cancelled') THEN RAISE EXCEPTION 'El pedido ya esta cerrado' USING errcode = 'P0001'; END IF;
      v_new_status := 'cancelled';

    ELSE
      RAISE EXCEPTION 'Accion desconocida: %', p_action USING errcode = 'P0001';
  END CASE;

  IF p_action = 'take' THEN
    UPDATE public.orders SET status = v_new_status, driver_id = v_driver_id WHERE id = p_order_id;
  ELSIF p_action = 'preparing' THEN
    UPDATE public.orders
      SET status = v_new_status, prep_time_minutes = v_prep,
          estimated_ready_at = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - 10) || ' minutes')::interval
      WHERE id = p_order_id;
  ELSIF p_action = 'pickup' THEN
    SELECT value INTO v_commissions FROM public.app_settings WHERE key = 'commissions';
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';

    -- El envío que se cobra al negocio es el que el cliente PAGÓ de verdad,
    -- no el que se deduce de la banda que declara el motorizado.
    --
    -- Antes salía de la banda: un pedido declarado 'far' cargaba 2.50 al
    -- negocio mientras el cliente había pagado 2.00, porque la creación del
    -- pedido nunca calcula banda y siempre cobra 'near'. El negocio absorbía
    -- esos S/0.50 sin haber hecho nada. Medido en el recorrido de la Parte 4.
    --
    -- La banda se sigue guardando en delivery_distance_band: es el dato que
    -- hará falta para diseñar 'far' de verdad, cuando el lado del cliente
    -- distinga distancia y cobre en consecuencia.
    v_delivery_fee_charged := CASE
      WHEN v_order.delivery_method = 'pickup' THEN 0
      ELSE COALESCE(v_order.delivery_fee, (v_bands ->> 'near')::numeric, 2.00)
    END;

    -- Cada rama resuelve SOLO la comisión. `commissions` guarda el TOTAL que
    -- se cobra al negocio, así que la comisión es ese total menos el envío.
    IF v_order.delivery_method = 'pickup' THEN
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        0.50
      );
    ELSIF v_band = 'near' THEN
      v_commission_amount := COALESCE(
        v_business.commission_override_near,
        (v_commissions ->> 'near')::numeric,
        3.00
      ) - v_delivery_fee_charged;
    ELSE -- far
      v_commission_amount := COALESCE(
        v_business.commission_override_far,
        (v_commissions ->> 'far')::numeric,
        3.50
      ) - v_delivery_fee_charged;
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
    -- Las coordenadas son OPCIONALES: si el motorizado denego el permiso de
    -- GPS o el fix tardo mas de 5s, llegan ausentes o en null y la llegada se
    -- registra igual. Registrar la hora es lo que abre la ventana de no-show y
    -- destapa el telefono del motorizado en get_tracking; el GPS solo sirve
    -- para resolver un reclamo despues.
    UPDATE public.orders
      SET arrived_at_customer_at = now(),
          arrived_at_customer_lat = (p_params ->> 'lat')::numeric,
          arrived_at_customer_lng = (p_params ->> 'lng')::numeric,
          arrived_at_customer_accuracy_m = (p_params ->> 'accuracy_m')::numeric
      WHERE id = p_order_id;
  ELSIF p_action = 'deliver' THEN
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = COALESCE((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
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
      -- Contraentrega: arranca el reloj aquí mismo.
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep,
            estimated_ready_at = now() + (v_prep || ' minutes')::interval,
            appears_in_queue_at = now() + (greatest(0, v_prep - 10) || ' minutes')::interval
        WHERE id = p_order_id;
    ELSE
      -- Prepago: se guarda el tiempo elegido, pero el reloj NO arranca hasta
      -- que el comprobante esté verificado.
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep
        WHERE id = p_order_id;
    END IF;
  ELSIF p_action = 'ready' THEN
    IF v_order.driver_id IS NULL THEN
      -- appears_in_queue_at se fuerza a now() por integridad del dato y
      -- paridad con prod. Desde 0108 waiting_driver ya es tomable sin
      -- condición de tiempo, así que no cambia la tomabilidad por sí solo.
      UPDATE public.orders
        SET status = v_new_status,
            ready_early_used = true,
            ready_early_at = now(),
            appears_in_queue_at = least(appears_in_queue_at, now())
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET ready_early_used = true,
            ready_early_at = now()
        WHERE id = p_order_id;
    END IF;
  ELSE
    UPDATE public.orders SET status = v_new_status WHERE id = p_order_id;
  END IF;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);

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
