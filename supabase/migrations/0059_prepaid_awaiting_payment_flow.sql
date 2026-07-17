-- 0059_prepaid_awaiting_payment_flow.sql
-- Fase 1 Prepaid: Columnas de reintento y lógica en RPCs advance_order y validate_order.

-- 1. Agregar columna proof_attempt si no existe
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS proof_attempt smallint NOT NULL DEFAULT 0;

-- 2. Redefinir advance_order
CREATE OR REPLACE FUNCTION public.advance_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_action text,
  p_params jsonb default '{}'::jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_business public.businesses;
  v_driver_id uuid;
  v_new_status public.order_status;
  v_band public.distance_band;
  v_commission numeric;
  v_commissions jsonb;
  v_prep int;
  v_slots int;
  v_blocked boolean;
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
      
      -- Si es prepaid, transiciona a awaiting_payment, de lo contrario a confirmed
      IF v_order.payment_intent = 'prepaid' THEN
        v_new_status := 'awaiting_payment';
      ELSE
        v_new_status := 'confirmed';
      END IF;

    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'confirmed' THEN RAISE EXCEPTION 'El pedido no esta confirmado' USING errcode = 'P0001'; END IF;
      v_prep := greatest(1, coalesce((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';

    WHEN 'ready' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'preparing' THEN RAISE EXCEPTION 'El pedido no esta en preparacion' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_driver';

    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Accion solo del motorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status not in ('preparing', 'waiting_driver') THEN RAISE EXCEPTION 'El pedido no esta disponible para tomar' USING errcode = 'P0001'; END IF;
      IF v_order.driver_id is not null AND v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'El pedido ya tiene motorizado' USING errcode = 'P0001'; END IF;
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
      v_slots := least(3, greatest(1, coalesce((p_params ->> 'slots')::int, 1)));
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
      IF p_actor_role not in ('business', 'admin') THEN RAISE EXCEPTION 'No autorizado para cancelar' USING errcode = 'P0001'; END IF;
      IF v_order.status in ('delivered', 'cancelled') THEN RAISE EXCEPTION 'El pedido ya esta cerrado' USING errcode = 'P0001'; END IF;
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
    IF v_order.delivery_method = 'pickup' THEN
      v_commission := coalesce(v_business.commission_override_pickup, (v_commissions ->> 'pickup')::numeric, 0.50);
    ELSIF v_band = 'near' THEN
      v_commission := coalesce(v_business.commission_override_near, (v_commissions ->> 'near')::numeric, 3.00);
    ELSE
      v_commission := coalesce(v_business.commission_override_far, (v_commissions ->> 'far')::numeric, 3.50);
    END IF;
    UPDATE public.orders
      SET status = v_new_status, delivery_distance_band = v_band, tindivo_commission = v_commission,
          occupancy_slots = v_slots
      WHERE id = p_order_id;
  ELSIF p_action = 'deliver' then
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = coalesce((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
      WHERE id = p_order_id;
  ELSIF p_action = 'no_show' THEN
    UPDATE public.orders
      SET status = v_new_status, cancel_reason = 'no_show', cancelled_by = p_actor_user_id
      WHERE id = p_order_id;
    
    -- Strike anclado a número + dirección (atómico con la cancelación).
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
    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = coalesce((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled'),
          cancel_note = nullif(p_params ->> 'reasonText', ''),
          cancelled_by = p_actor_user_id,
          rejection_reason_code = nullif(p_params ->> 'reasonCode', ''),
          rejection_reason_text = nullif(p_params ->> 'reasonText', ''),
          rejected_at = now(),
          rejected_by = p_actor_user_id
      WHERE id = p_order_id;
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
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes,
      'cancelReason', cancel_reason
    ) FROM public.orders WHERE id = p_order_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_order(uuid, uuid, public.user_role, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order(uuid, uuid, public.user_role, text, jsonb) TO service_role;


-- 3. Redefinir validate_order
CREATE OR REPLACE FUNCTION public.validate_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_pass boolean,
  p_reason text default null,
  p_reason_code text default null
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_business public.businesses;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;
  IF v_order.status <> 'validando' THEN
    RETURN jsonb_build_object('ok', false, 'status', v_order.status);
  END IF;

  IF p_actor_role = 'business' THEN
    SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;
    IF v_business.user_id <> p_actor_user_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
  ELSIF p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo el negocio o admin validan' USING errcode = 'P0001';
  END IF;

  IF p_pass THEN
    UPDATE public.orders
      SET status = 'confirmed',
          payment_proof_status = CASE WHEN v_order.payment_intent = 'prepaid' THEN 'verified' ELSE payment_proof_status END,
          payment_verified_at  = CASE WHEN v_order.payment_intent = 'prepaid' THEN now() ELSE payment_verified_at END,
          payment_verified_by  = CASE WHEN v_order.payment_intent = 'prepaid' THEN p_actor_user_id ELSE payment_verified_by END
      WHERE id = p_order_id;
      
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id, '{}'::jsonb);
    
    RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
  ELSE
    -- Si es prepago y tiene menos de 2 intentos, se le permite reintentar volviendo a awaiting_payment
    IF v_order.payment_intent = 'prepaid' AND v_order.proof_attempt < 2 THEN
      UPDATE public.orders
        SET status = 'awaiting_payment',
            payment_proof_status = 'rejected',
            rejection_reason_code = coalesce(
              nullif(p_reason_code, ''),
              'invalid_proof'),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;
        
      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail_retry', 'status', 'awaiting_payment'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed_retry', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code, 'attempt', v_order.proof_attempt));
        
      RETURN jsonb_build_object('ok', true, 'status', 'awaiting_payment', 'outcome', 'retry_allowed');
    ELSE
      -- Segundo rechazo o no es prepago: se cancela el pedido definitivamente
      UPDATE public.orders
        SET status = 'cancelled',
            cancel_reason = CASE WHEN v_order.payment_intent = 'prepaid' THEN 'proof_rejected_final'::public.cancel_reason ELSE 'business_cancelled'::public.cancel_reason END,
            cancelled_by = p_actor_user_id,
            cancel_note = p_reason,
            payment_proof_status = CASE WHEN v_order.payment_intent = 'prepaid' THEN 'rejected' ELSE payment_proof_status END,
            rejection_reason_code = coalesce(
              nullif(p_reason_code, ''),
              CASE WHEN v_order.payment_intent = 'prepaid' THEN 'invalid_proof' ELSE null END),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;
        
      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail', 'status', 'cancelled'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code));
        
      RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'outcome', 'cancelled_final');
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_order(uuid, uuid, public.user_role, boolean, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_order(uuid, uuid, public.user_role, boolean, text, text) TO service_role;
