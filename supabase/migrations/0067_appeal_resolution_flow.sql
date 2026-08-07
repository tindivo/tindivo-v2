-- =============================================================================
-- 0067_appeal_resolution_flow.sql
-- Sistema de Apelaciones v2 - Flujo completo de resolución y devolución de prepago
-- Idempotente. SECURITY DEFINER con search_path=''.
-- =============================================================================

-- 1. Nuevas columnas en public.reports
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS appeal_status text,
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS refund_proof_path text,
  ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS refund_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS appeal_deadline timestamptz;

-- Constraints de integridad reforzados para appeal_status y refund_status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_appeal_status_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_appeal_status_check
      CHECK (appeal_status IS NULL OR appeal_status IN ('pending', 'in_review', 'approved', 'rejected'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_refund_status_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_refund_status_check
      CHECK (refund_status IS NULL OR refund_status IN ('pending', 'completed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_appeal_refund_integrity_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_appeal_refund_integrity_check
      CHECK (
        (appeal_status = 'approved' AND refund_status IS NOT NULL) OR
        (appeal_status IS DISTINCT FROM 'approved' AND refund_status IS NULL)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_refund_completed_integrity_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_refund_completed_integrity_check
      CHECK (
        (refund_status = 'pending' AND refund_amount IS NULL AND refund_proof_path IS NULL AND refund_completed_at IS NULL) OR
        (refund_status = 'completed' AND refund_amount IS NOT NULL AND refund_amount > 0 AND refund_proof_path IS NOT NULL AND trim(refund_proof_path) <> '' AND refund_completed_at IS NOT NULL) OR
        (refund_status IS NULL)
      );
  END IF;
END $$;

-- 2. Verificación de duplicados preexistentes: Abortar si existen múltiples apelaciones para un mismo pedido
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT order_id
    FROM public.reports
    WHERE type = 'rejected_proof_disputed'
    GROUP BY order_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Existen % pedido(s) con apelaciones duplicadas. Ejecutar script de deduplicación manual scripts/resolve_duplicate_appeals.sql antes de continuar.', v_dup_count
      USING errcode = 'P0001';
  END IF;
END $$;

-- 3. Backfill ultraconservador de datos de la migración 0066 (idempotente)
-- Todos los reportes resueltos legados pasan a appeal_status='approved' y refund_status='pending'
-- para permitir una revisión y registro manual seguro de la devolución vía register_appeal_refund.
UPDATE public.reports r
SET
  appeal_status = CASE
    WHEN r.status = 'open' THEN 'pending'
    WHEN r.status = 'resolved' THEN 'approved'
    WHEN r.status = 'dismissed' THEN 'rejected'
    ELSE 'pending'
  END,
  refund_status = CASE
    WHEN r.status = 'resolved' THEN 'pending'
    ELSE NULL
  END,
  refund_amount = NULL,
  refund_proof_path = NULL,
  refund_completed_at = NULL,
  appeal_deadline = COALESCE(r.appeal_deadline, o.cancelled_at + interval '24 hours', r.created_at + interval '24 hours')
FROM public.orders o
WHERE r.order_id = o.id
  AND r.type = 'rejected_proof_disputed'
  AND r.appeal_status IS NULL;

-- 4. Índices
DROP INDEX IF EXISTS public.uidx_reports_order_appeal;
CREATE UNIQUE INDEX uidx_reports_order_appeal
  ON public.reports (order_id)
  WHERE type = 'rejected_proof_disputed';

DROP INDEX IF EXISTS public.idx_reports_appeal_unresolved;
CREATE INDEX idx_reports_appeal_unresolved
  ON public.reports (customer_user_id, appeal_status, refund_status)
  WHERE type = 'rejected_proof_disputed'
    AND (
      appeal_status IN ('pending', 'in_review')
      OR (appeal_status = 'approved' AND refund_status = 'pending')
    );

-- 5. RPC create_appeal_report (Firma Canónica de 2 parámetros)
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

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.appeal_created', 'customer', v_customer_user_id,
    jsonb_build_object('reportId', v_existing_id));

  -- Encolar evento en outbox_events atómicamente si existe la tabla
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'outbox_events') THEN
    INSERT INTO public.outbox_events (event_type, payload, status)
    VALUES (
      'order/appeal.created',
      jsonb_build_object('orderId', p_order_id, 'reportId', v_existing_id),
      'pending'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'alreadyExisted', false, 'reportId', v_existing_id);
END;
$$;

-- Wrapper seguro de compatibilidad para la firma legada de 3 argumentos
CREATE OR REPLACE FUNCTION public.create_appeal_report(
  p_order_id uuid,
  p_customer_user_id uuid,
  p_description text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Se ignora p_customer_user_id recibido y se delega a la función canónica de 2 argumentos (usa auth.uid())
  RETURN public.create_appeal_report(p_order_id, p_description);
END;
$$;

REVOKE ALL ON FUNCTION public.create_appeal_report(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_appeal_report(uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_appeal_report(uuid, uuid, text) TO authenticated;

-- 6. Trigger handle_prepaid_refund_on_cancel
CREATE OR REPLACE FUNCTION public.handle_prepaid_refund_on_cancel()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_amount numeric;
  v_reason text;
BEGIN
  IF new.status IS DISTINCT FROM 'cancelled' OR old.status = 'cancelled' THEN
    RETURN new;
  END IF;

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
      PERFORM public.create_contingency_advance(
        new.id,
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente',
        'restaurante',
        new.cancelled_by
      );
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

  ELSIF new.comprobante_prepago_url IS NOT NULL THEN
    INSERT INTO public.reports (
      type, status, order_id, business_id, customer_user_id, customer_phone, description, created_by
    ) VALUES (
      'prepay_refund_review', 'open', new.id, new.business_id, new.customer_user_id,
      new.customer_phone,
      'Prepago cancelado (' || COALESCE(NULLIF(v_reason, ''), 'sin motivo') ||
        ') con comprobante sin verificar. Revisar si corresponde devolución de S/ ' ||
        to_char(v_amount, 'FM999990.00') || '.',
      new.cancelled_by
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_prepaid_refund ON public.orders;
CREATE TRIGGER trg_orders_prepaid_refund
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM 'cancelled' AND new.status = 'cancelled')
  EXECUTE FUNCTION public.handle_prepaid_refund_on_cancel();

REVOKE ALL ON FUNCTION public.handle_prepaid_refund_on_cancel() FROM PUBLIC, anon, authenticated;

-- 7. RPC mark_appeal_in_review (Exige auth.uid() de Administrador Humano)
CREATE OR REPLACE FUNCTION public.mark_appeal_in_review(
  p_report_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_report public.reports;
  v_admin_user_id uuid;
BEGIN
  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no existe' USING errcode = 'P0002'; END IF;

  IF v_report.type <> 'rejected_proof_disputed' THEN
    RAISE EXCEPTION 'El reporte no es una apelación de comprobante' USING errcode = 'P0001';
  END IF;

  IF v_report.appeal_status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyInReviewOrResolved', true, 'status', v_report.appeal_status);
  END IF;

  UPDATE public.reports
  SET appeal_status = 'in_review',
      updated_at = now()
  WHERE id = p_report_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_report.order_id, 'order.appeal_in_review', 'admin', v_admin_user_id,
    jsonb_build_object('reportId', p_report_id));

  RETURN jsonb_build_object('ok', true, 'appealStatus', 'in_review');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_appeal_in_review(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_appeal_in_review(uuid) TO authenticated;

-- 8. RPC resolve_appeal (Exige auth.uid() de Administrador Humano)
CREATE OR REPLACE FUNCTION public.resolve_appeal(
  p_report_id uuid,
  p_resolution text,
  p_note text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_report public.reports;
  v_admin_user_id uuid;
BEGIN
  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no existe' USING errcode = 'P0002'; END IF;

  IF v_report.type <> 'rejected_proof_disputed' THEN
    RAISE EXCEPTION 'Solo se pueden resolver apelaciones de comprobante' USING errcode = 'P0001';
  END IF;

  IF v_report.appeal_status NOT IN ('pending', 'in_review') THEN
    RAISE EXCEPTION 'Esta apelación ya fue resuelta previamente' USING errcode = 'P0001';
  END IF;

  IF p_resolution = 'favor_cliente' THEN
    UPDATE public.reports
    SET appeal_status = 'approved',
        refund_status = 'pending',
        resolution_note = COALESCE(p_note, 'Resuelto a favor del cliente'),
        resolved_by = v_admin_user_id,
        resolved_at = now(),
        status = 'resolved',
        updated_at = now()
    WHERE id = p_report_id;

    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (v_report.order_id, 'order.appeal_resolved', 'admin', v_admin_user_id,
      jsonb_build_object('resolution', 'favor_cliente', 'reportId', p_report_id));

  ELSIF p_resolution = 'favor_restaurante' THEN
    UPDATE public.reports
    SET appeal_status = 'rejected',
        resolution_note = COALESCE(p_note, 'Resuelto a favor del restaurante'),
        resolved_by = v_admin_user_id,
        resolved_at = now(),
        status = 'dismissed',
        updated_at = now()
    WHERE id = p_report_id;

    -- No se genera strike automático. Se desestima la apelación y concluye el caso.
    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (v_report.order_id, 'order.appeal_resolved', 'admin', v_admin_user_id,
      jsonb_build_object('resolution', 'favor_restaurante', 'reportId', p_report_id));

  ELSE
    RAISE EXCEPTION 'Resolución inválida. Usar favor_cliente o favor_restaurante' USING errcode = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'resolution', p_resolution);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_appeal(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_appeal(uuid, text, text) TO authenticated;

-- 9. RPC register_appeal_refund (Exige auth.uid() de Administrador Humano)
CREATE OR REPLACE FUNCTION public.register_appeal_refund(
  p_report_id uuid,
  p_refund_proof_path text,
  p_amount numeric
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_report public.reports;
  v_order public.orders;
  v_expected_amount numeric;
  v_admin_user_id uuid;
BEGIN
  v_admin_user_id := auth.uid();
  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  IF NOT public.current_user_has_role('admin') THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol admin' USING errcode = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto de devolución debe ser positivo' USING errcode = 'P0001';
  END IF;

  IF p_refund_proof_path IS NULL OR trim(p_refund_proof_path) = '' THEN
    RAISE EXCEPTION 'La ruta del comprobante de devolución es obligatoria' USING errcode = 'P0001';
  END IF;

  -- Bloqueo del reporte
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporte no existe' USING errcode = 'P0002'; END IF;

  IF v_report.appeal_status <> 'approved' OR v_report.refund_status <> 'pending' THEN
    RAISE EXCEPTION 'Este reporte no está aprobado o ya fue reembolsado' USING errcode = 'P0001';
  END IF;

  -- Bloqueo del pedido asociado
  SELECT * INTO v_order FROM public.orders WHERE id = v_report.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido asociado no existe' USING errcode = 'P0002'; END IF;

  v_expected_amount := COALESCE(v_order.order_amount, 0) + COALESCE(v_order.delivery_fee, 0);
  IF v_expected_amount <= 0 THEN
    RAISE EXCEPTION 'El pedido no cuenta con un monto reembolsable válido' USING errcode = 'P0001';
  END IF;

  IF p_amount <> v_expected_amount THEN
    RAISE EXCEPTION 'El monto expresado (S/ %) no coincide con el total del pedido (S/ %)', p_amount, v_expected_amount
      USING errcode = 'P0001';
  END IF;

  -- Actualizar el reporte
  UPDATE public.reports
  SET refund_status = 'completed',
      refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount,
      refund_completed_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  -- Crear la auto-deuda al restaurante mediante la RPC canónica
  PERFORM public.create_contingency_advance(
    v_report.order_id,
    p_amount,
    'Devolución por apelación aprobada — comprobante rechazado erróneamente',
    'restaurante',
    v_admin_user_id,
    p_refund_proof_path
  );

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_report.order_id, 'order.refund_registered', 'admin', v_admin_user_id,
    jsonb_build_object('reportId', p_report_id, 'amount', p_amount, 'proofPath', p_refund_proof_path));

  RETURN jsonb_build_object('ok', true, 'refundCompleted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.register_appeal_refund(uuid, text, numeric) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.register_appeal_refund(uuid, text, numeric) TO authenticated;
