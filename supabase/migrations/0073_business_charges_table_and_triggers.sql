-- =============================================================================
-- 0073_business_charges_table_and_triggers.sql
-- Refactorización Módulo Financiero - Parte 1
--
-- 1. Tabla business_charges (Ledger de cargos individuales)
-- 2. Trigger generate_delivery_charges (Reemplaza trg_orders_balance_due)
-- 3. Registro de refund_charge en register_appeal_refund y cancelaciones de prepago
-- 4. Reset de balance_due a 0 y limpieza de app_settings de contingencia
-- =============================================================================

-- 1.1 Nueva tabla business_charges
CREATE TABLE IF NOT EXISTS public.business_charges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  order_id uuid,
  report_id uuid,
  charge_type text NOT NULL
    CHECK (charge_type IN (
      'commission',
      'delivery_fee',
      'refund_charge'
    )),
  amount numeric NOT NULL CHECK (amount > 0),
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'settled')),
  settlement_id uuid,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_charges_pkey PRIMARY KEY (id),
  CONSTRAINT business_charges_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id),
  CONSTRAINT business_charges_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT business_charges_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES public.reports(id),
  CONSTRAINT business_charges_settlement_id_fkey
    FOREIGN KEY (settlement_id) REFERENCES public.settlements(id)
);

CREATE INDEX IF NOT EXISTS idx_business_charges_business_pending
  ON public.business_charges (business_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_business_charges_order
  ON public.business_charges (order_id);

CREATE INDEX IF NOT EXISTS idx_business_charges_settlement
  ON public.business_charges (settlement_id)
  WHERE settlement_id IS NOT NULL;

-- Habilitar RLS
ALTER TABLE public.business_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business can view own charges" ON public.business_charges;
CREATE POLICY "Business can view own charges"
  ON public.business_charges FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role can manage charges" ON public.business_charges;
CREATE POLICY "Service role can manage charges"
  ON public.business_charges FOR ALL
  USING (true)
  WITH CHECK (true);


-- 1.2 Reemplazo de trigger de entrega
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

    -- Si tindivo_commission es null o 0, no generar cargos
    IF COALESCE(new.tindivo_commission, 0) <= 0 THEN
      RETURN new;
    END IF;

    v_delivery_fee := COALESCE(new.delivery_fee, 0);
    v_commission := COALESCE(new.tindivo_commission, 0) - v_delivery_fee;

    -- Cargo por delivery fee (si aplica, no aplica para pickup)
    IF v_delivery_fee > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'delivery_fee', v_delivery_fee,
         'Delivery fee pedido #' || v_short_id);
    END IF;

    -- Cargo por comisión Tindivo (siempre que la diferencia sea > 0)
    IF v_commission > 0 THEN
      INSERT INTO public.business_charges
        (business_id, order_id, charge_type, amount, description)
      VALUES
        (new.business_id, new.id, 'commission', v_commission,
         'Comisión pedido #' || v_short_id);
    END IF;

    -- Actualizar balance_due (misma lógica que antes para mantener sincronización)
    UPDATE public.businesses
      SET balance_due = balance_due + COALESCE(new.tindivo_commission, 0)
      WHERE id = new.business_id;

  -- Si sale de delivered, revertir
  ELSIF old.status = 'delivered' AND new.status <> 'delivered' THEN
    -- Eliminar cargos pendientes de este pedido
    DELETE FROM public.business_charges
      WHERE order_id = new.id
        AND status = 'pending';

    UPDATE public.businesses
      SET balance_due = GREATEST(0, balance_due - COALESCE(old.tindivo_commission, 0))
      WHERE id = new.business_id;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_balance_due ON public.orders;
CREATE TRIGGER trg_orders_balance_due
  AFTER UPDATE OF STATUS ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_delivery_charges();


-- 1.3 Modificar register_appeal_refund para registrar refund_charge en business_charges
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

  -- Actualizar el reporte
  UPDATE public.reports
  SET refund_status = 'completed',
      refund_proof_path = p_refund_proof_path,
      refund_amount = p_amount,
      refund_completed_at = now(),
      updated_at = now()
  WHERE id = p_report_id;

  -- 1. create_contingency_advance YA actualiza balance_due
  PERFORM public.create_contingency_advance(
    v_report.order_id,
    p_amount,
    'Devolución por apelación aprobada — comprobante rechazado erróneamente',
    'restaurante',
    v_admin_user_id,
    p_refund_proof_path
  );

  -- 2. Registrar la fila en business_charges (NO actualiza balance_due directamente para no duplicar)
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


-- 1.4 Modificar trg_prepaid_cancel_auto_debt para insertar refund_charge
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
      -- create_contingency_advance YA actualiza balance_due
      PERFORM public.create_contingency_advance(
        new.id,
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente',
        'restaurante',
        new.cancelled_by
      );

      -- Insertar fila en business_charges sin tocar balance_due adicionalmente
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description
      ) VALUES (
        new.business_id,
        new.id,
        'refund_charge',
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente'
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
  END IF;

  RETURN new;
END;
$$;


-- 1.5 Limpieza de datos pre-lanzamiento
UPDATE public.businesses SET balance_due = 0;

DELETE FROM public.app_settings
  WHERE key IN ('contingency_fund_balance', 'contingency_fund_initial');
