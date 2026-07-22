-- =============================================================================
-- 0077_decouple_contingency_advances.sql
-- Refactorización Módulo Financiero - Parte 5 (Desacoplamiento Final)
--
-- 1. Actualizar register_appeal_refund para eliminar create_contingency_advance y actualizar balance_due
-- 2. Actualizar handle_prepaid_cancel_auto_debt para eliminar create_contingency_advance y actualizar balance_due
-- 3. Deprecar y revocar ejecuciones de funciones legacy de contingencia
-- 4. Limpieza final de llaves de contingencia en app_settings
-- =============================================================================

-- 1. register_appeal_refund (Desacoplado de contingency_advances)
CREATE OR REPLACE FUNCTION public.register_appeal_refund(
  p_report_id uuid,
  p_amount numeric,
  p_refund_proof_path text,
  p_admin_user_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_report public.reports;
  v_admin_user_id uuid := p_admin_user_id;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Monto inválido' USING errcode = 'P0001';
  END IF;

  IF p_refund_proof_path IS NULL OR trim(p_refund_proof_path) = '' THEN
    RAISE EXCEPTION 'Debe adjuntar la captura del Yape/Plin enviado al cliente' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte no encontrado' USING errcode = 'P0002';
  END IF;

  IF v_report.type NOT IN ('appeal', 'prepay_refund_review') THEN
    RAISE EXCEPTION 'El reporte no es una apelación o revisión de devolución' USING errcode = 'P0001';
  END IF;

  IF v_report.status = 'resolved' OR v_report.refund_status = 'completed' THEN
    RAISE EXCEPTION 'La devolución de este reporte ya fue completada' USING errcode = 'P0001';
  END IF;

  IF v_admin_user_id IS NULL THEN
    v_admin_user_id := auth.uid();
  END IF;

  -- Actualizar el reporte a completado
  UPDATE public.reports
  SET refund_status = 'completed',
      refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount,
      refund_completed_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  -- Registrar cargo por devolución en business_charges y actualizar balance_due
  IF v_report.business_id IS NOT NULL THEN
    INSERT INTO public.business_charges (
      business_id, order_id, report_id, charge_type, amount, description
    ) VALUES (
      v_report.business_id,
      v_report.order_id,
      p_report_id,
      'refund_charge',
      p_amount,
      'Devolución por apelación aprobada — comprobante rechazado erróneamente'
    );

    UPDATE public.businesses
      SET balance_due = balance_due + p_amount
      WHERE id = v_report.business_id;
  END IF;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_report.order_id, 'order.refund_registered', 'admin', v_admin_user_id,
    jsonb_build_object('reportId', p_report_id, 'amount', p_amount, 'proofPath', p_refund_proof_path));

  RETURN jsonb_build_object(
    'ok', true,
    'reportId', p_report_id,
    'refundAmount', p_amount,
    'refundStatus', 'completed'
  );
END;
$$;


-- 2. handle_prepaid_cancel_auto_debt (Desacoplado de contingency_advances)
CREATE OR REPLACE FUNCTION public.handle_prepaid_cancel_auto_debt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_amount numeric;
  v_reason text;
BEGIN
  IF new.payment_intent <> 'prepaid' THEN
    RETURN new;
  END IF;

  v_amount := COALESCE(new.order_amount, 0) + COALESCE(new.delivery_fee, 0);
  v_reason := COALESCE(new.cancel_reason::text, '');

  IF v_reason = 'no_show' OR v_reason = 'proof_rejected_final' THEN
    RETURN new;
  END IF;

  IF new.payment_proof_status = 'verified'
     AND v_amount > 0
     AND v_reason IN ('business_cancelled', 'admin_cancelled', 'pending_acceptance_timeout') THEN
    BEGIN
      -- Insertar cargo por devolución en business_charges
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description
      ) VALUES (
        new.business_id,
        new.id,
        'refund_charge',
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente'
      );

      -- Actualizar balance_due del negocio directamente
      UPDATE public.businesses
        SET balance_due = balance_due + v_amount
        WHERE id = new.business_id;

    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.reports (
        type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
      ) VALUES (
        'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
        new.customer_phone,
        'Prepago verificado cancelado: la deuda automática falló (' || sqlerrm ||
          '). Registrar la devolución manualmente.',
        new.cancelled_by
      );
    END;
  END IF;

  RETURN new;
END;
$$;


-- 3. DEPRECATED — Revocar permisos sobre funciones legacy de contingencia
REVOKE ALL ON FUNCTION public.create_contingency_advance(uuid, numeric, text, public.contingency_actor_charged, uuid, text) FROM public, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'dispute_contingency_advance') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.dispute_contingency_advance(uuid, uuid, text) FROM public, anon, authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_contingency_advance') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.resolve_contingency_advance(uuid, uuid, numeric, text) FROM public, anon, authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_contingency_dispute') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.resolve_contingency_dispute(uuid, uuid, numeric, text) FROM public, anon, authenticated, service_role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'replenish_contingency_fund') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.replenish_contingency_fund(numeric, uuid) FROM public, anon, authenticated, service_role';
  END IF;
END $$;


-- 4. Limpieza final de llaves de contingencia en app_settings
DELETE FROM public.app_settings
  WHERE key IN (
    'contingency_fund_balance',
    'contingency_fund_initial',
    'contingency_fund'
  );
