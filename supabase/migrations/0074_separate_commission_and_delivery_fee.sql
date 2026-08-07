-- =============================================================================
-- 0074_separate_commission_and_delivery_fee.sql
-- Refactorización Módulo Financiero - Parte 2
--
-- 1. Agregar columnas commission_amount y delivery_fee_charged a public.orders
-- 2. Actualizar advance_order() para calcular y guardar estos componentes en 'pickup'
-- 3. Actualizar generate_delivery_charges() para consumir las columnas separadas
-- =============================================================================

-- 2.1 Nuevas columnas en public.orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_amount numeric,
  ADD COLUMN IF NOT EXISTS delivery_fee_charged numeric;


-- 2.2 Actualizar advance_order con el desglose en 'pickup'
CREATE OR REPLACE FUNCTION public.advance_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role public.user_role,
  p_action text,
  p_params jsonb DEFAULT '{}'::jsonb
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
  v_commission_amount numeric;
  v_delivery_fee_charged numeric;
  v_commissions jsonb;
  v_bands jsonb;
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
      v_new_status := 'confirmed';
    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'confirmed' THEN RAISE EXCEPTION 'El pedido no esta confirmado' USING errcode = 'P0001'; END IF;
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';
    WHEN 'ready' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'preparing' THEN RAISE EXCEPTION 'El pedido no esta en preparacion' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_driver';
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
      SET status = v_new_status, cancel_reason = 'no_show', cancelled_by = p_actor_user_id
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
          cancel_reason = COALESCE((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled'),
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
      'commissionAmount', commission_amount, 'deliveryFeeCharged', delivery_fee_charged,
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes,
      'cancelReason', cancel_reason
    ) FROM public.orders WHERE id = p_order_id
  );
END;
$$;


-- 2.3 Actualizar generate_delivery_charges() para consumir las columnas separadas
CREATE OR REPLACE FUNCTION public.generate_delivery_charges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_commission numeric;
  v_delivery_fee numeric;
  v_short_id text;
BEGIN
  -- Solo actuar cuando el status cambia A delivered
  IF old.status <> 'delivered' AND new.status = 'delivered' THEN
    v_short_id := new.short_id;

    -- Usar las columnas desglosadas con fallbacks retrocompatibles
    v_delivery_fee := COALESCE(new.delivery_fee_charged, new.delivery_fee, 0);
    v_commission := COALESCE(new.commission_amount, COALESCE(new.tindivo_commission, 0) - v_delivery_fee, 0);

    IF (v_delivery_fee + v_commission) <= 0 THEN
      RETURN new;
    END IF;

    -- Cargo por delivery fee
    IF v_delivery_fee > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'delivery_fee', v_delivery_fee,
         'Delivery fee pedido #' || v_short_id);
    END IF;

    -- Cargo por comisión Tindivo
    IF v_commission > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'commission', v_commission,
         'Comisión pedido #' || v_short_id);
    END IF;

    -- Actualizar balance_due con la suma de ambos
    UPDATE public.businesses
      SET balance_due = balance_due + (v_delivery_fee + v_commission)
      WHERE id = new.business_id;

  -- Si sale de delivered, revertir
  ELSIF old.status = 'delivered' AND new.status <> 'delivered' THEN
    DELETE FROM public.business_charges
      WHERE order_id = new.id
        AND status = 'pending';

    v_delivery_fee := COALESCE(old.delivery_fee_charged, old.delivery_fee, 0);
    v_commission := COALESCE(old.commission_amount, COALESCE(old.tindivo_commission, 0) - v_delivery_fee, 0);

    UPDATE public.businesses
      SET balance_due = GREATEST(0, balance_due - (v_delivery_fee + v_commission))
      WHERE id = new.business_id;
  END IF;

  RETURN new;
END;
$$;
