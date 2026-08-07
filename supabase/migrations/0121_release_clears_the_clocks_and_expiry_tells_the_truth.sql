-- =============================================================================
-- 0121 · Dos remates de la 0119: soltar un pedido borra los relojes del intento
--        anterior, y vencer una solicitud deja de decir que transfirio
-- =============================================================================
--
-- La 0119 abrio el primer camino por el que un pedido VUELVE al pool despues de
-- haber tenido motorizado ('release'), y cambio el significado de que una
-- solicitud de traspaso venza. Cada cosa dejo un cabo suelto.
--
-- 1) LOS RELOJES SE QUEDABAN CON EL PEDIDO, NO CON EL INTENTO
--    `orders_before_write` sella `heading_at` y `waiting_at_restaurant_at` con
--    COALESCE(existente, now()): se ponen una vez y no se vuelven a tocar. Eso
--    era correcto mientras un pedido tuviera un solo motorizado en toda su
--    vida. Con 'release' ya no: el siguiente que lo tome hereda los sellos del
--    anterior, y la pantalla del local le abre con el cronometro corriendo
--    desde antes de que el llegara.
--    Reproducido en local: pedido con 30 min de espera acumulada, se suelta, lo
--    toma otro y al marcar "llegue al local" la app le dice que lleva 30
--    minutos esperando — con el aviso de demora inusual y todo.
--    'release' pasa a limpiarlos. `assigned_at` no hace falta: su trigger
--    (`update_assigned_at`) ya lo pone a NULL cuando driver_id se vacia.
--
-- 2) `respond_order_transfer` SEGUIA CONTANDO EL CUENTO VIEJO
--    La 0119 redefinio `apply_order_transfer` para que 'expired' NO mueva
--    `orders.driver_id`, pero no toco `respond_order_transfer`, que en su rama
--    de expiracion perezosa sigue devolviendo `'transferred', true` y explica
--    en un comentario que "el silencio ya acepto". El dato es falso desde la
--    0119: el pedido se queda con su dueño. Hoy ningun consumidor en TypeScript
--    lee ese campo, asi que no hay pantalla mintiendo; se corrige antes de que
--    el primero que lo lea se lo crea.
--
-- METODO
-- Ambos cuerpos salen de su `pg_get_functiondef` VIVO (con 0119 y 0120 ya
-- dentro) sustituyendo un literal exacto cada uno, afirmando una sola
-- aparicion, y comprobando que siguen intactos: la accion 'release', el
-- COALESCE de banda de la 0120, el recorte del reloj en 'ready' de la 0120, el
-- calculo de comision por banda, y las otras tres ramas de retorno de
-- respond_order_transfer.
-- =============================================================================

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
$function$

;
CREATE OR REPLACE FUNCTION public.respond_order_transfer(p_request_id uuid, p_responder_user_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req public.order_transfer_requests;
  v_order public.orders;
  v_driver_id uuid;
begin
  select id into v_driver_id from public.drivers where user_id = p_responder_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

  -- Lock orders primero (orden consistente), luego la solicitud.
  select o.* into v_order
    from public.orders o
    join public.order_transfer_requests r on r.order_id = o.id
    where r.id = p_request_id
    for update of o;
  if not found then raise exception 'Solicitud no existe' using errcode = 'P0002'; end if;

  select * into v_req from public.order_transfer_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'La solicitud ya fue resuelta' using errcode = 'P0001';
  end if;
  if v_req.from_driver_id <> v_driver_id then
    raise exception 'No eres el motorizado de este pedido' using errcode = 'P0001';
  end if;

  -- El pedido cambió de manos o de estado mientras la solicitud vivía.
  if v_order.driver_id is distinct from v_req.from_driver_id
     or v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
    update public.order_transfer_requests set status = 'invalidated', resolved_at = now() where id = p_request_id;
    return jsonb_build_object('id', p_request_id, 'status', 'invalidated', 'transferred', false);
  end if;

  -- Expiración perezosa. Desde la 0119 vencer NO cede el pedido: la solicitud
  -- se cierra como 'expired' y el pedido se queda con su dueño. Da igual que la
  -- respuesta llegue tarde aceptando o rechazando; el resultado es el mismo y
  -- por eso `transferred` es false (antes decía true, heredado del
  -- timeout-as-accept que la 0119 retiró).
  if v_req.expires_at is not null and v_req.expires_at <= now() then
    perform public.apply_order_transfer(v_req, 'expired');
    return jsonb_build_object('id', p_request_id, 'status', 'expired', 'transferred', false);
  end if;

  if p_accept then
    perform public.apply_order_transfer(v_req, 'accepted');
    return jsonb_build_object('id', p_request_id, 'status', 'accepted', 'transferred', true);
  end if;

  update public.order_transfer_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_req.order_id, 'TransferResolved',
          jsonb_build_object('requestId', p_request_id, 'resolution', 'rejected'));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_req.order_id, 'order.transfer_rejected', 'driver', p_responder_user_id,
          jsonb_build_object('requestId', p_request_id));
  return jsonb_build_object('id', p_request_id, 'status', 'rejected', 'transferred', false);
end;
$function$

;
