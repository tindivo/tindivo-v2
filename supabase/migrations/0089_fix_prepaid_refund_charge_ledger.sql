-- =============================================================================
-- 0089 · Integración de devoluciones de prepago en public.business_charges
-- =============================================================================
-- Actualiza handle_prepaid_refund_on_cancel() para registrar el cargo de devolución
-- ('refund_charge') en el ledger unificado public.business_charges al cancelar
-- un pedido prepagado verificado, garantizando el respaldo contable de balance_due.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_prepaid_refund_on_cancel()
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

  -- El no-show o comprobante rechazado final no generan devolución automática al restaurante
  IF v_reason = 'no_show' OR v_reason = 'proof_rejected_final' THEN
    RETURN new;
  END IF;

  IF new.payment_proof_status = 'verified'
     AND v_amount > 0
     AND v_reason IN ('business_cancelled', 'admin_cancelled', 'pending_acceptance_timeout') THEN
    BEGIN
      -- 1. Insertar cargo por devolución en business_charges (Ledger)
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description
      ) VALUES (
        new.business_id,
        new.id,
        'refund_charge',
        v_amount,
        'Prepago verificado cancelado por el restaurante — devolución al cliente'
      );

      -- 2. Actualizar balance_due del negocio
      UPDATE public.businesses
        SET balance_due = balance_due + v_amount
        WHERE id = new.business_id;

    EXCEPTION WHEN OTHERS THEN
      -- En caso de fallo inesperado, derivar a la bandeja de reportes de admin
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

REVOKE ALL ON FUNCTION public.handle_prepaid_refund_on_cancel() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_prepaid_refund_on_cancel() TO service_role;
