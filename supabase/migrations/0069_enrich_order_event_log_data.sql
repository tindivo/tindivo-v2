-- 0069_enrich_order_event_log_data.sql
-- Enriquece el campo `data` (jsonb) de order_event_log para incluir rutas de
-- archivos (proof_path, evidence_url) y metadata adicional en eventos clave.
-- Idempotente: solo CREATE OR REPLACE FUNCTION, sin DDL nuevo.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. create_appeal_report: agregar evidence_url + description al evento
--    order.appeal_created
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_description text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_customer_user_id uuid;
  v_existing_id uuid;
  v_deadline timestamptz;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002';
  END IF;

  IF v_order.customer_user_id <> v_customer_user_id THEN
    RAISE EXCEPTION 'No autorizado para apelar este pedido' USING errcode = 'P0001';
  END IF;

  IF v_order.status <> 'cancelled' OR v_order.cancel_reason <> 'proof_rejected_final' THEN
    RAISE EXCEPTION 'Solo se puede apelar pedidos cancelados por rechazo final de comprobante' USING errcode = 'P0001';
  END IF;

  IF v_order.cancelled_at IS NULL THEN
    RAISE EXCEPTION 'El pedido no cuenta con fecha de cancelación registrada' USING errcode = 'P0001';
  END IF;

  v_deadline := v_order.cancelled_at + interval '24 hours';
  IF now() >= v_deadline THEN
    RAISE EXCEPTION 'La ventana de apelación de 24 horas ha expirado' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.reports
  WHERE order_id = p_order_id
    AND type = 'rejected_proof_disputed';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyExisted', true, 'reportId', v_existing_id);
  END IF;

  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id,
    customer_phone, description, evidence_url, created_by,
    appeal_status, appeal_deadline
  ) VALUES (
    'rejected_proof_disputed', 'open', p_order_id, v_order.business_id,
    v_customer_user_id, v_order.customer_phone,
    COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago'),
    v_order.comprobante_prepago_url,
    v_customer_user_id,
    'pending', v_deadline
  )
  RETURNING id INTO v_existing_id;

  -- ★ Enriquecido: incluye evidence_url y description en data
  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.appeal_created', 'customer', v_customer_user_id,
    jsonb_build_object(
      'reportId', v_existing_id,
      'evidence_url', v_order.comprobante_prepago_url,
      'description', COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago')
    ));

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'outbox_events') THEN
    INSERT INTO public.outbox_events (event_id, event_type, payload, status)
    VALUES (
      'appeal_created_' || p_order_id,
      'order/appeal.created',
      jsonb_build_object('orderId', p_order_id, 'reportId', v_existing_id),
      'pending'
    )
    ON CONFLICT (event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'alreadyExisted', false, 'reportId', v_existing_id);
END;
$$;

-- Wrapper de compatibilidad para la firma legada de 3 argumentos
CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_customer_user_id uuid,
  p_description text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN public.create_appeal_report(p_order_id, p_description);
END;
$$;

REVOKE ALL ON FUNCTION public.create_appeal_report(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_appeal_report(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, uuid, text) TO authenticated;


-- =============================================================================
-- 2. validate_order: agregar proof_path a eventos validation_failed_retry y
--    validation_failed
-- =============================================================================

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
      -- ★ Enriquecido: incluye proof_path del comprobante rechazado
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed_retry', p_actor_role::text, p_actor_user_id,
        jsonb_build_object(
          'reason', p_reason,
          'reasonCode', p_reason_code,
          'attempt', v_order.proof_attempt,
          'proof_path', v_order.comprobante_prepago_url
        ));

      RETURN jsonb_build_object('ok', true, 'status', 'awaiting_payment', 'outcome', 'retry_allowed');
    ELSE
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
      -- ★ Enriquecido: incluye proof_path del comprobante rechazado
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed', p_actor_role::text, p_actor_user_id,
        jsonb_build_object(
          'reason', p_reason,
          'reasonCode', p_reason_code,
          'proof_path', v_order.comprobante_prepago_url
        ));

      RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'outcome', 'cancelled_final');
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_order(uuid, uuid, public.user_role, boolean, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_order(uuid, uuid, public.user_role, boolean, text, text) TO service_role;
