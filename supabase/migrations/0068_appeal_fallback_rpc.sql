-- =============================================================================
-- 0068_appeal_fallback_rpc.sql
-- Transactional Outbox Atómico, RPC de Fallback de Apelaciones e Índices de Resiliencia
-- Idempotente. SECURITY DEFINER con search_path=''.
-- =============================================================================

-- 1. Tabla de Outbox Transactional para emisión garantizada de eventos
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON public.outbox_events (status, created_at)
  WHERE status IN ('pending', 'failed', 'processing');

REVOKE ALL ON TABLE public.outbox_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.outbox_events TO service_role;

-- 2. Preflight de duplicados prepay_refund_review
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT order_id
    FROM public.reports
    WHERE type = 'prepay_refund_review' AND created_by IS NULL
    GROUP BY order_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Existen % pedido(s) con múltiples reportes de fallback automáticos preexistentes.', v_dup_count
      USING errcode = 'P0001';
  END IF;
END $$;

-- 3. Índice único parcial que garantiza exactamente 1 reporte de fallback por pedido
DROP INDEX IF EXISTS public.uidx_reports_order_fallback;
CREATE UNIQUE INDEX uidx_reports_order_fallback
  ON public.reports (order_id)
  WHERE type = 'prepay_refund_review' AND created_by IS NULL;

-- 4. RPC idempotente create_fallback_appeal_review
CREATE OR REPLACE FUNCTION public.create_fallback_appeal_review(
  p_order_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_order public.orders;
  v_existing_appeal uuid;
  v_existing_fallback uuid;
  v_report_id uuid;
BEGIN
  -- Bloqueo transaccional del pedido
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002';
  END IF;

  IF v_order.status <> 'cancelled' OR v_order.cancel_reason <> 'proof_rejected_final' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'order_not_in_proof_rejected_final');
  END IF;

  IF v_order.cancelled_at IS NULL OR (v_order.cancelled_at + interval '24 hours') > now() THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'appeal_window_still_active');
  END IF;

  -- Comprobar si el cliente creó una apelación voluntaria
  SELECT id INTO v_existing_appeal
  FROM public.reports
  WHERE order_id = p_order_id AND type = 'rejected_proof_disputed';

  IF v_existing_appeal IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'customer_appealed', 'reportId', v_existing_appeal);
  END IF;

  -- Comprobar si ya existe un reporte de fallback previo
  SELECT id INTO v_existing_fallback
  FROM public.reports
  WHERE order_id = p_order_id AND type = 'prepay_refund_review' AND created_by IS NULL;

  IF v_existing_fallback IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'fallback_already_exists', 'reportId', v_existing_fallback);
  END IF;

  -- Insertar reporte de revisión automática con origen de sistema (created_by IS NULL)
  INSERT INTO public.reports (
    type, status, order_id, business_id, customer_user_id,
    customer_phone, description, evidence_url, created_by
  ) VALUES (
    'prepay_refund_review', 'open', p_order_id, v_order.business_id,
    v_order.customer_user_id, v_order.customer_phone,
    'Fallback automático de sistema: 24 horas transcurridas sin apelación del cliente tras rechazo final de comprobante. Revisar si corresponde devolución manual.',
    v_order.comprobante_prepago_url,
    NULL
  )
  RETURNING id INTO v_report_id;

  -- Registrar evento de auditoría del sistema (actor_role = 'system', actor_user_id = NULL)
  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.fallback_review_created', 'system', NULL,
    jsonb_build_object('reportId', v_report_id));

  RETURN jsonb_build_object('ok', true, 'skipped', false, 'reportId', v_report_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_fallback_appeal_review(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_fallback_appeal_review(uuid) TO service_role;

-- 5. Trigger en orders para encolar outbox atómicamente al cancelar por proof_rejected_final
CREATE OR REPLACE FUNCTION public.handle_orders_outbox_events()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (old.status IS DISTINCT FROM 'cancelled' AND new.status = 'cancelled' AND new.cancel_reason = 'proof_rejected_final') THEN
    INSERT INTO public.outbox_events (event_type, payload, status)
    VALUES (
      'order/proof-rejected-final',
      jsonb_build_object(
        'orderId', new.id,
        'cancelledAt', to_char(new.cancelled_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ),
      'pending'
    );
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_outbox_events ON public.orders;
CREATE TRIGGER trg_orders_outbox_events
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM 'cancelled' AND new.status = 'cancelled' AND new.cancel_reason = 'proof_rejected_final')
  EXECUTE FUNCTION public.handle_orders_outbox_events();

REVOKE ALL ON FUNCTION public.handle_orders_outbox_events() FROM PUBLIC, anon, authenticated;

-- 6. RPC atómica claim_outbox_events para reconciliación concurrente segura con FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_outbox_events(
  p_limit int DEFAULT 20
) RETURNS TABLE (
  out_id uuid,
  out_event_type text,
  out_payload jsonb,
  out_attempts int
)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  -- Reclamar filas en 'processing' con más de 5 minutos atascadas
  UPDATE public.outbox_events
  SET status = 'pending',
      last_error = 'Timeout de procesamiento excedido (5 min)'
  WHERE status = 'processing'
    AND processed_at < now() - interval '5 minutes';

  RETURN QUERY
  WITH claimed AS (
    SELECT e.id
    FROM public.outbox_events e
    WHERE e.status IN ('pending', 'failed')
      AND e.attempts < 5
      AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= now())
    ORDER BY e.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events u
  SET status = 'processing',
      processed_at = now(),
      attempts = u.attempts + 1
  FROM claimed c
  WHERE u.id = c.id
  RETURNING u.id AS out_id, u.event_type AS out_event_type, u.payload AS out_payload, u.attempts AS out_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbox_events(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_events(int) TO service_role;
