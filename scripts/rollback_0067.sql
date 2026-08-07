-- =============================================================================
-- scripts/rollback_0067.sql
-- Script de Reversión Segura (Down Migration) para 0067_appeal_resolution_flow.sql
-- Preserva la seguridad auth.uid() sin restaurar la vulnerabilidad de p_customer_user_id
-- Encapsulado dentro de una transacción única (BEGIN / COMMIT)
-- =============================================================================

BEGIN;

-- 1. Eliminar RPCs de administración creadas en 0067
DROP FUNCTION IF EXISTS public.register_appeal_refund(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.resolve_appeal(uuid, text, text);
DROP FUNCTION IF EXISTS public.mark_appeal_in_review(uuid);

-- 2. Eliminar índices creados en 0067
DROP INDEX IF EXISTS public.idx_reports_appeal_unresolved;
DROP INDEX IF EXISTS public.uidx_reports_order_appeal;

-- 3. Eliminar constraints de integridad agregados en 0067
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_refund_completed_integrity_check;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_appeal_refund_integrity_check;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_refund_status_check;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_appeal_status_check;

-- 4. Eliminar columnas agregadas en 0067
ALTER TABLE public.reports
  DROP COLUMN IF EXISTS appeal_status,
  DROP COLUMN IF EXISTS refund_status,
  DROP COLUMN IF EXISTS refund_proof_path,
  DROP COLUMN IF EXISTS refund_amount,
  DROP COLUMN IF EXISTS refund_completed_at,
  DROP COLUMN IF EXISTS appeal_deadline;

-- 5. Restaurar la función canónica de create_appeal_report (2 argumentos) de forma segura con auth.uid()
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
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  IF v_order.customer_user_id <> v_customer_user_id THEN
    RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001';
  END IF;

  IF v_order.status <> 'cancelled' OR v_order.cancel_reason <> 'proof_rejected_final' THEN
    RAISE EXCEPTION 'Solo se puede apelar pedidos cancelados por rechazo final de comprobante' USING errcode = 'P0001';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.reports
  WHERE order_id = p_order_id
    AND type = 'rejected_proof_disputed'
    AND status = 'open';

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'alreadyExisted', true, 'reportId', v_existing_id);
  END IF;

  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id,
    customer_phone, description, evidence_url, created_by
  ) VALUES (
    'rejected_proof_disputed', 'open', p_order_id, v_order.business_id,
    v_customer_user_id, v_order.customer_phone,
    COALESCE(NULLIF(trim(p_description), ''), 'Cliente apela rechazo final de comprobante de pago'),
    v_order.comprobante_prepago_url,
    v_customer_user_id
  )
  RETURNING id INTO v_existing_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.appeal_created', 'customer', v_customer_user_id, jsonb_build_object('reportId', v_existing_id));

  RETURN jsonb_build_object('ok', true, 'alreadyExisted', false, 'reportId', v_existing_id);
END;
$$;

-- 6. Restaurar el wrapper seguro de 3 argumentos que redirige a auth.uid() sin confiar en p_customer_user_id
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

-- 7. Restaurar la función handle_prepaid_refund_on_cancel de la migración 0048
CREATE OR REPLACE FUNCTION public.handle_prepaid_refund_on_cancel()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = ''
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

  IF v_reason = 'no_show' THEN
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

COMMIT;
