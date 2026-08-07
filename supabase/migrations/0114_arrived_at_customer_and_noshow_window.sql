-- =============================================================================
-- 0114 · Llegada al cliente, ventana de no-show de 5m y teléfono de motorizado condicional
-- =============================================================================

-- 1. Nuevas columnas en public.orders para registro de llegada y GPS opcional
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS arrived_at_customer_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS arrived_at_customer_lat numeric(10,7);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS arrived_at_customer_lng numeric(10,7);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS arrived_at_customer_accuracy_m numeric;

-- 2. Actualizar RPC advance_order con la acción 'arrived_customer' y la guarda de tiempo en 'no_show'
CREATE OR REPLACE FUNCTION public.advance_order(
  p_order_id uuid,
  p_action text,
  p_actor_user_id uuid,
  p_actor_role text,
  p_params jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_driver_id uuid;
  v_business public.businesses;
  v_new_status public.order_status;
  v_prep int;
  v_band text;
  v_commissions jsonb;
  v_bands jsonb;
  v_commission_amount numeric;
  v_delivery_fee_charged numeric;
  v_commission numeric;
  v_blocked boolean;
  v_slots int;
  v_no_show_min int;
  v_remaining_min int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;

  IF p_actor_role = 'driver' THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = p_actor_user_id;
  END IF;

  CASE p_action
    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Solo un motorizado puede tomar pedidos' USING errcode = 'P0001'; END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver') THEN RAISE EXCEPTION 'El pedido no esta listo para asignar' USING errcode = 'P0001'; END IF;
      IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'Pedido ya tomado por otro motorizado' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_driver';

    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' OR v_order.business_id <> (SELECT business_id FROM public.business_users WHERE user_id = p_actor_user_id LIMIT 1) THEN
        RAISE EXCEPTION 'No autorizado para este negocio' USING errcode = 'P0001';
      END IF;
      IF v_order.status NOT IN ('pending_acceptance', 'confirmed') THEN
        RAISE EXCEPTION 'El pedido no esta en estado de preparacion' USING errcode = 'P0001';
      END IF;

      v_prep := COALESCE((p_params ->> 'prepTimeMinutes')::int, v_order.prep_time_minutes, 25);
      IF v_prep < 5 OR v_prep > 120 THEN
        RAISE EXCEPTION 'El tiempo de preparacion debe estar entre 5 y 120 minutos' USING errcode = 'P0001';
      END IF;

      v_new_status := 'preparing';

    WHEN 'pickup' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no esta listo para recoger' USING errcode = 'P0001';
      END IF;
      v_band := COALESCE(p_params ->> 'distanceBand', 'near');
      v_slots := COALESCE((p_params ->> 'occupancySlots')::int, 1);
      IF v_slots < 1 OR v_slots > 3 THEN RAISE EXCEPTION 'occupancySlots invalido (1-3)' USING errcode = 'P0001'; END IF;
      v_new_status := 'picked_up';

    WHEN 'arrived_customer' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta en reparto' USING errcode = 'P0001'; END IF;

      -- Idempotente: si ya está registrado la llegada, se ignora sin error
      IF v_order.arrived_at_customer_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'status', v_order.status, 'arrivedAtCustomerAt', v_order.arrived_at_customer_at);
      END IF;

      v_new_status := 'picked_up';

    WHEN 'deliver' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta recogido' USING errcode = 'P0001'; END IF;
      v_new_status := 'delivered';

    WHEN 'no_show' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'Solo se reporta no-show con el pedido en reparto' USING errcode = 'P0001'; END IF;

      -- C2.1: Exigir llegada marcada
      IF v_order.arrived_at_customer_at IS NULL THEN
        RAISE EXCEPTION 'Primero marca que llegaste al domicilio.' USING errcode = 'P0001';
      END IF;

      -- C2.1: Exigir ventana noShowWaitMinutes
      SELECT COALESCE((value ->> 'noShowWaitMinutes')::int, 5) INTO v_no_show_min
      FROM public.app_settings WHERE key = 'timers';
      v_no_show_min := COALESCE(v_no_show_min, 5);

      IF now() - v_order.arrived_at_customer_at < (v_no_show_min || ' minutes')::interval THEN
        v_remaining_min := CEIL(EXTRACT(EPOCH FROM ((v_order.arrived_at_customer_at + (v_no_show_min || ' minutes')::interval) - now())) / 60.0)::int;
        IF v_remaining_min < 1 THEN v_remaining_min := 1; END IF;
        RAISE EXCEPTION 'Espera % minutos más antes de reportar que el cliente no aparece.', v_remaining_min USING errcode = 'P0001';
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
    ELSE
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
          occupancy_slots = v_slots,
          picked_up_at = now()
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
          delivered_at = now(),
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
    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = COALESCE(p_params ->> 'reason', 'admin_cancelled'),
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
  END IF;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.' || p_action, p_actor_role, p_actor_user_id, p_params);

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'order/' || p_action, jsonb_build_object('order_id', p_order_id, 'action', p_action, 'status', v_new_status));

  RETURN jsonb_build_object('ok', true, 'status', v_new_status);
END;
$$;

-- 3. Actualizar get_tracking para incluir arrivedAtCustomerAt y driverPhone condicionado a la llegada
CREATE OR REPLACE FUNCTION public.get_tracking(p_short_id text)
  RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shortId', o.short_id, 'orderNumber', o.order_number, 'businessName', b.name,
    'businessAccentColor', b.accent_color, 'status', o.status, 'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent, 'cancelReason', o.cancel_reason,
    'paysWith', o.client_pays_with, 'changeToGive', o.change_to_give,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'arrivedAtCustomerAt', o.arrived_at_customer_at,
    'driverPhone', CASE WHEN o.arrived_at_customer_at IS NOT NULL THEN d.phone ELSE NULL END,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'awaitingPaymentAt', o.awaiting_payment_at,
    'proofAttempt', o.proof_attempt,
    'proofUrl', o.comprobante_prepago_url,
    'hasAppeal', EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.order_id = o.id AND r.type = 'rejected_proof_disputed'
    ),
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', i.item_name_snapshot, 'qty', i.quantity, 'lineTotal', i.line_total,
          'modifiers', coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'group', m.group_name_snapshot,
                'name', m.option_name_snapshot,
                'price', m.additional_price_snapshot
              )
              ORDER BY m.created_at
            )
            FROM public.customer_order_item_modifiers m WHERE m.item_id = i.id
          ), '[]'::jsonb)
        )
        ORDER BY i.created_at
      )
      FROM public.customer_order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.drivers d ON d.id = o.driver_id
  WHERE o.short_id = p_short_id
    AND (o.delivered_at IS NULL OR o.delivered_at > now() - interval '24 hours');
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tracking(text) TO anon, authenticated;
