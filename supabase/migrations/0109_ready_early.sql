-- =============================================================================
-- 0109 · Declaración de comida lista
-- =============================================================================
--
-- QUÉ HABILITA
-- La cajera puede avisar "ya está, entra a recoger" en los CUATRO estados en
-- los que la comida puede seguir en cocina. Antes `advance_order('ready')`
-- exigía `preparing`, así que el caso más útil FALLABA:
--
--   prep 20 -> el motorizado toma con 10 restantes (heading_to_restaurant)
--           -> la cocina termina con 5 restantes
--           -> la cajera quiere avisarle... y la acción se rechazaba.
--
-- Desde 0108 ese solapamiento es el caso NORMAL de todos los pedidos, no una
-- excepción: el motorizado toma con 10 minutos de cocción por delante.
--
-- REFERENCIA: markReadyEarly de producción
-- (tindivo-delivery/packages/core/src/modules/orders/domain/entities/order.ts
-- :1018-1040), que permite waiting_driver, heading_to_restaurant y
-- waiting_at_restaurant. v2 añade `preparing`, que en prod no existe.
--
-- DOS COMPORTAMIENTOS
--   Sin motorizado  -> status pasa a 'waiting_driver', se sellan las banderas
--                      y appears_in_queue_at baja a now().
--   Con motorizado  -> SOLO se sellan las banderas. El estado NO cambia:
--                      marcar listo declara un hecho sobre la comida, no una
--                      transición del pedido.
--
-- IDEMPOTENTE
-- Si `ready_early_used` ya es true, devuelve el estado actual sin reescribir
-- el timestamp y SIN lanzar excepción: la cajera pudo pulsar dos veces.
--
-- DIVERGENCIA DELIBERADA CON PROD
-- Prod además recorta `estimated_ready_at` a now()+10min cuando faltaba más de
-- 10 minutos, como colchón de llegada del motorizado. Aquí NO se toca
-- `estimated_ready_at`, por dos razones:
--   1. `orderUrgency` (apps/motorizados/lib/urgency.ts:10) marca 'overdue'
--      cuando estimated_ready_at ya pasó. Colapsarlo al marcar listo pintaría
--      de rojo un pedido que acaba de quedar listo.
--   2. La tarjeta de negocios ya deja de contar sola: `minutesLeft` exige
--      `!ready_early_used` (view-model.ts).
-- Queda anotado para la Parte 5: el ETA al cliente se calcula sobre
-- `estimated_ready_at`, así que ahí habrá que decidir qué mostrar cuando la
-- comida está lista antes de tiempo.

-- 1. Columna que faltaba. `ready_early_used` ya existía desde 0002:252, pero
--    dormida: sin escritor, sin lector y fuera de todos los selects.
alter table public.orders
  add column if not exists ready_early_at timestamptz;

comment on column public.orders.ready_early_at is
  'Cuándo la cajera declaró la comida lista. Junto a ready_early_used, permite '
  'medir la precisión real de los tiempos de cocción.';

-- 2. advance_order: acción 'ready'.
--    Cuerpo reproducido desde la definición viva con sustituciones verificadas
--    por aserción sobre el texto exacto de cada línea tocada.

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

    WHEN 'deliver' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta recogido' USING errcode = 'P0001'; END IF;
      v_new_status := 'delivered';

    WHEN 'no_show' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'Solo se reporta no-show con el pedido en reparto' USING errcode = 'P0001'; END IF;
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

    IF v_order.delivery_method = 'pickup' THEN
      v_delivery_fee_charged := 0;
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        0.50
      );
    ELSIF v_band = 'near' THEN
      v_delivery_fee_charged := COALESCE(
        (v_bands ->> 'near')::numeric,
        v_business.delivery_fee,
        2.00
      );
      v_commission_amount := COALESCE(
        v_business.commission_override_near,
        (v_commissions ->> 'near')::numeric,
        3.00
      ) - v_delivery_fee_charged;
    ELSE -- far
      v_delivery_fee_charged := COALESCE(
        (v_bands ->> 'far')::numeric,
        2.50
      );
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
$function$

;
