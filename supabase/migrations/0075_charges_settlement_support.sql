-- =============================================================================
-- 0075_charges_settlement_support.sql
-- Refactorización Módulo Financiero - Parte 3
--
-- 1. Agregar columna payment_id a public.business_charges (referenciando restaurant_payments)
-- 2. Índice sobre payment_id
-- 3. RPC public.settle_business_charges para liquidación atómica FIFO de cargos
-- =============================================================================

-- 1. Columna payment_id en business_charges
ALTER TABLE public.business_charges
  ADD COLUMN IF NOT EXISTS payment_id uuid
  REFERENCES public.restaurant_payments(id);

CREATE INDEX IF NOT EXISTS idx_business_charges_payment
  ON public.business_charges (payment_id)
  WHERE payment_id IS NOT NULL;


-- 2. RPC settle_business_charges
CREATE OR REPLACE FUNCTION public.settle_business_charges(
  p_business_id uuid,
  p_charge_ids uuid[],
  p_total_amount numeric,
  p_payment_method text DEFAULT 'yape',
  p_note text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_biz public.businesses;
  v_sum numeric;
  v_count int;
  v_payment_id uuid;
  v_operator uuid := p_admin_user_id;
BEGIN
  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Monto total inválido' USING errcode = 'P0001';
  END IF;

  IF p_charge_ids IS NULL OR array_length(p_charge_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Debe seleccionar al menos un cargo a liquidar' USING errcode = 'P0001';
  END IF;

  SELECT * INTO v_biz FROM public.businesses WHERE id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negocio no encontrado' USING errcode = 'P0002';
  END IF;

  -- Verificar que los cargos pertenecen al negocio, están en status 'pending' y sumar exacto
  SELECT coalesce(sum(amount), 0), count(*)
    INTO v_sum, v_count
    FROM public.business_charges
    WHERE id = ANY(p_charge_ids)
      AND business_id = p_business_id
      AND status = 'pending';

  IF v_count <> array_length(p_charge_ids, 1) THEN
    RAISE EXCEPTION 'Uno o más cargos no están disponibles o no pertenecen a este negocio'
      USING errcode = 'P0001';
  END IF;

  IF abs(v_sum - p_total_amount) > 0.005 THEN
    RAISE EXCEPTION 'El monto total (S/ %) no coincide con la suma de los cargos seleccionados (S/ %)',
      p_total_amount, v_sum USING errcode = 'P0001';
  END IF;

  IF v_operator IS NULL THEN
    v_operator := auth.uid();
  END IF;

  -- 1. Insertar el pago en restaurant_payments
  INSERT INTO public.restaurant_payments (
    business_id, amount, payment_method, paid_at, registered_by, note
  ) VALUES (
    p_business_id, p_total_amount, p_payment_method, now(), v_operator, p_note
  ) RETURNING id INTO v_payment_id;

  -- 2. Marcar los cargos como settled vinculados a payment_id (NO settlement_id)
  UPDATE public.business_charges
    SET status = 'settled',
        payment_id = v_payment_id,
        settled_at = now()
    WHERE id = ANY(p_charge_ids);

  -- 3. Descontar el monto liquidado del balance_due del negocio
  UPDATE public.businesses
    SET balance_due = GREATEST(0, balance_due - p_total_amount)
    WHERE id = p_business_id;

  -- Auto-desbloqueo por mora si la deuda llega a 0
  UPDATE public.businesses
    SET is_blocked = false,
        blocked_for_debt = false,
        block_reason = NULL
    WHERE id = p_business_id
      AND blocked_for_debt = true
      AND balance_due = 0;

  RETURN jsonb_build_object(
    'ok', true,
    'paymentId', v_payment_id,
    'settledCount', v_count,
    'totalAmount', p_total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_business_charges(uuid, uuid[], numeric, text, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_business_charges(uuid, uuid[], numeric, text, text, uuid) TO service_role;
