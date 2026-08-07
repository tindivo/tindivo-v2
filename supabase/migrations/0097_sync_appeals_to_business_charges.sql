-- =============================================================================
-- 0097 · Sincronización Contable de Apelaciones y business_charges
-- =============================================================================
-- 1. Actualizar resolve_fraud_claim para que al aprobar un reclamo de cobertura
--    asignado al restaurante (actor_charged = 'restaurante'), inserte un cargo por
--    devolución en business_charges (charge_type = 'refund_charge') y actualice
--    balance_due en businesses.
-- 2. Backfill retroactivo de adelantos en contingency_advances cargados al restaurante
--    hacia business_charges para garantizar cuadre 100% perfecto de la lista de deuda.

-- 1. Actualizar resolve_fraud_claim RPC
CREATE OR REPLACE FUNCTION public.resolve_fraud_claim(
  p_claim_id uuid,
  p_resolver uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
) RETURNS public.fraud_coverage_claims
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.fraud_coverage_claims;
  v_order public.orders;
BEGIN
  SELECT * INTO v_row FROM public.fraud_coverage_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim no existe' USING errcode = 'P0002'; END IF;
  IF v_row.status <> 'pending' THEN RETURN v_row; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_row.order_id;

  UPDATE public.fraud_coverage_claims
    SET status = (CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END)::public.fraud_claim_status,
        resolved_at = now(), resolved_by = p_resolver, resolution_note = p_note, updated_at = now()
  WHERE id = p_claim_id
  RETURNING * INTO v_row;

  IF p_approve THEN
    INSERT INTO public.contingency_advances
      (order_id, customer_phone, amount, reason, actor_charged, status, operator)
    VALUES (
      v_row.order_id, COALESCE(v_order.customer_phone, ''), v_row.amount,
      'Cobertura de fraude aprobada: ' || v_row.reason, 'tindivo', 'activo', p_resolver
    );

    IF v_order.business_id IS NOT NULL THEN
      INSERT INTO public.business_charges (
        business_id, order_id, charge_type, amount, description, status
      ) VALUES (
        v_order.business_id,
        v_row.order_id,
        'refund_charge',
        v_row.amount,
        'Devolución por cobertura de fraude — ' || v_row.reason,
        'pending'
      );

      UPDATE public.businesses
        SET balance_due = balance_due + v_row.amount
        WHERE id = v_order.business_id;
    END IF;
  END IF;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_fraud_claim(uuid, uuid, boolean, text) TO service_role;

-- 2. Backfill atómico retroactivo para adelantos de contingencia activos del restaurante
INSERT INTO public.business_charges (
  business_id,
  order_id,
  charge_type,
  amount,
  description,
  status,
  created_at
)
SELECT 
  o.business_id,
  ca.order_id,
  'refund_charge',
  ca.amount,
  ca.reason,
  'pending',
  ca.created_at
FROM public.contingency_advances ca
JOIN public.orders o ON o.id = ca.order_id
WHERE ca.actor_charged = 'restaurante'
  AND ca.status = 'activo'
  AND o.business_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.business_charges bc
    WHERE bc.order_id = ca.order_id
      AND bc.charge_type = 'refund_charge'
  );
