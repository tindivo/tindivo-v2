-- =============================================================================
-- Migración 0189: El tiempo de cocina al validar comprobante respeta la selección
--
-- PROBLEMA:
--   Al aceptar un pedido prepago (Yape/Plin) en `pending_acceptance`, el sistema
--   guardaba `prep_time_minutes = 20` como valor inicial de disponibilidad.
--   Cuando el cliente pagaba y subía el comprobante, el pedido pasaba a `validando`
--   en "NUEVOS". Al confirmar el comprobante, la cajera seleccionaba el tiempo real
--   (ej. 10 min), pero `validate_order` en la rama 'proof' evaluaba:
--     `COALESCE(orders.prep_time_minutes, v_prep)`
--   Como `orders.prep_time_minutes` ya existía (20), ignoraba los 10 minutos
--   seleccionados y dejaba el pedido en cocina con 20 minutos.
--
-- SOLUCIÓN:
--   Usar `v_prep` (`greatest(1, COALESCE(p_prep_time_minutes, v_order.prep_time_minutes, 20))`)
--   para que el tiempo elegido en el modal al confirmar el pago tenga prioridad.
--
-- REVERSIBILIDAD:
--   supabase/rollbacks/0189_the_cashier_sets_the_real_cooking_time.rollback.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.validate_order(
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_role user_role,
  p_pass boolean,
  p_reason text DEFAULT NULL::text,
  p_reason_code text DEFAULT NULL::text,
  p_prep_time_minutes integer DEFAULT NULL::integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_business public.businesses;
  v_context text;
  v_prep int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;
  
  -- Priorizar el tiempo recién elegido sobre el guardado anteriormente
  v_prep := greatest(1, COALESCE(p_prep_time_minutes, v_order.prep_time_minutes, 20));

  -- `awaiting_payment` entra desde la 0181: la cajera confirma contra su cuenta.
  IF v_order.status NOT IN ('validando', 'awaiting_payment') THEN
    RETURN jsonb_build_object('ok', false, 'status', v_order.status);
  END IF;

  IF p_actor_role = 'business' THEN
    SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;
    IF v_business.user_id <> p_actor_user_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
  ELSIF p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo el negocio o admin validan' USING errcode = 'P0001';
  END IF;

  -- ===========================================================================
  -- CONFIRMACIÓN DIRECTA DEL PREPAGO (0181)
  -- ===========================================================================
  IF v_order.status = 'awaiting_payment' THEN
    IF v_order.payment_intent <> 'prepaid' THEN
      RETURN jsonb_build_object('ok', false, 'status', v_order.status);
    END IF;
    IF NOT p_pass THEN
      RAISE EXCEPTION 'Sin comprobante no hay nada que rechazar: cancela el pedido' USING errcode = 'P0001';
    END IF;

    UPDATE public.orders
      SET status = 'preparing',
          prep_time_minutes   = v_prep,
          estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
          payment_proof_status = 'verified',
          payment_verified_at  = now(),
          payment_verified_by  = p_actor_user_id
      WHERE id = p_order_id;

    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderProofVerified', jsonb_build_object(
      'shortId', v_order.short_id, 'context', 'direct_business_verification'));
    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.payment_confirmed_direct', p_actor_role::text, p_actor_user_id,
      jsonb_build_object('context', 'direct_business_verification', 'prepTimeMinutes', v_prep));

    RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'direct_business_verification');
  END IF;

  -- Determinar el contexto: usar la columna explícita, o deducir de proof_attempt
  v_context := COALESCE(v_order.validation_context,
    CASE WHEN v_order.proof_attempt >= 1 THEN 'proof' ELSE 'antifraud' END);

  IF p_pass THEN
    -- =========================================================================
    -- RAMA PASS = TRUE
    -- =========================================================================
    IF v_context = 'proof' THEN
      -- CASO A: Verificación de comprobante real (proof_attempt >= 1).
      -- El cliente subió un voucher de Yape/Plin → la cajera lo revisa y aprueba.
      -- Transición: validando → preparing + payment_proof_status = 'verified'.
      UPDATE public.orders
        SET status = 'preparing',
            -- El reloj arranca al verificar el pago con el tiempo elegido por la cajera (v_prep)
            prep_time_minutes   = v_prep,
            estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
            appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
            payment_proof_status = CASE WHEN v_order.payment_intent = 'prepaid' THEN 'verified' ELSE payment_proof_status END,
            payment_verified_at  = CASE WHEN v_order.payment_intent = 'prepaid' THEN now() ELSE payment_verified_at END,
            payment_verified_by  = CASE WHEN v_order.payment_intent = 'prepaid' THEN p_actor_user_id ELSE payment_verified_by END
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderProofVerified', jsonb_build_object('shortId', v_order.short_id));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.proof_verified', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('context', 'proof', 'prepTimeMinutes', v_prep));

      RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'proof');

    ELSE
      -- CASO B: Antifraude — validación por llamada (proof_attempt = 0).
      IF v_order.payment_intent = 'prepaid' THEN
        UPDATE public.orders
          SET status = 'pending_acceptance'
          WHERE id = p_order_id;

        INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
        INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
        VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id,
          jsonb_build_object('context', 'antifraud', 'paymentIntent', 'prepaid', 'nextStatus', 'pending_acceptance'));

        RETURN jsonb_build_object('ok', true, 'status', 'pending_acceptance', 'context', 'antifraud');

      ELSE
        -- Contraentrega (pending_cash / pending_wallet / pending_mixed):
        UPDATE public.orders
          SET status = 'preparing',
              prep_time_minutes   = v_prep,
              estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
              appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
          WHERE id = p_order_id;

        INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
        INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
        VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id,
          jsonb_build_object('context', 'antifraud', 'paymentIntent', v_order.payment_intent, 'nextStatus', 'preparing'));

        RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'antifraud');
      END IF;
    END IF;

  ELSE
    -- =========================================================================
    -- RAMA PASS = FALSE (rechazo)
    -- =========================================================================
    IF v_context = 'proof' AND v_order.payment_intent = 'prepaid' AND v_order.proof_attempt < 2 THEN
      UPDATE public.orders
        SET status = 'awaiting_payment',
            payment_proof_status = 'rejected',
            rejection_reason_code = COALESCE(NULLIF(p_reason_code, ''), 'invalid_proof'),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail_retry', 'status', 'awaiting_payment'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.proof_rejected_retry', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('attempt', v_order.proof_attempt, 'reasonCode', p_reason_code, 'reasonText', p_reason));

      RETURN jsonb_build_object('ok', false, 'status', 'awaiting_payment', 'retry', true, 'attempt', v_order.proof_attempt);

    ELSE
      UPDATE public.orders
        SET status = 'cancelled',
            cancel_reason = 'business_rejected',
            cancel_note = p_reason,
            cancelled_at = now(),
            cancelled_by = p_actor_user_id,
            payment_proof_status = CASE WHEN v_context = 'proof' THEN 'rejected' ELSE payment_proof_status END,
            rejection_reason_code = p_reason_code,
            rejection_reason_text = p_reason,
            rejected_at = CASE WHEN v_context = 'proof' THEN now() ELSE rejected_at END,
            rejected_by = CASE WHEN v_context = 'proof' THEN p_actor_user_id ELSE rejected_by END
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderCancelled', jsonb_build_object(
        'shortId', v_order.short_id,
        'reason', 'business_rejected',
        'context', v_context,
        'reasonCode', p_reason_code,
        'reasonText', p_reason));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.cancelled', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', 'business_rejected', 'context', v_context, 'reasonCode', p_reason_code, 'reasonText', p_reason));

      RETURN jsonb_build_object('ok', false, 'status', 'cancelled', 'retry', false);
    END IF;
  END IF;
END;
$function$;
