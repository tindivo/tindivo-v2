-- =============================================================================
-- 0069_appeal_strike_on_dismiss.sql
-- Parte 3 (Corrección 1): Strike automático cuando resolve_appeal es favor_restaurante
-- Decisión de negocio: apelación perdida = intento de fraude (strike).
-- El trigger trg_incident_apply_strike (0036) maneja el contador y bloqueo.
-- Idempotente.
-- =============================================================================

-- 1. Añadir fraud_attempt al enum incident_type si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.incident_type'::regtype
      AND enumlabel = 'fraud_attempt'
  ) THEN
    ALTER TYPE public.incident_type ADD VALUE 'fraud_attempt';
  END IF;
END $$;

-- 2. Reemplazar resolve_appeal con strike automático en favor_restaurante
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

    -- Strike automático: apelación perdida = intento de fraude (decisión de negocio)
    INSERT INTO public.customer_incidents (
      order_id, customer_user_id, customer_phone,
      incident_type, description, reported_by, reported_by_role,
      is_strike, reviewed_at, reviewed_by, review_result
    ) VALUES (
      v_report.order_id, v_report.customer_user_id, v_report.customer_phone,
      'fraud_attempt',
      'Apelación de comprobante rechazada — pago no verificado por el restaurante',
      v_admin_user_id, 'system',
      true, now(), v_admin_user_id, 'confirmed'
    );

    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (v_report.order_id, 'order.appeal_resolved', 'admin', v_admin_user_id,
      jsonb_build_object('resolution', 'favor_restaurante', 'reportId', p_report_id, 'strike', true));

  ELSE
    RAISE EXCEPTION 'Resolución inválida. Usar favor_cliente o favor_restaurante' USING errcode = 'P0001';
  END IF;

  RETURN jsonb_build_object('ok', true, 'resolution', p_resolution);
END;
$$;

-- Los permisos ya fueron revocados y re-otorgados en 0067. Re-otorgar por idempotencia.
REVOKE ALL ON FUNCTION public.resolve_appeal(uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_appeal(uuid, text, text) TO authenticated;
