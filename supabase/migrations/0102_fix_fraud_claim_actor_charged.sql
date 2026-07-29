-- =============================================================================
-- 0102 · Fix bug #5 — resolve_fraud_claim cargaba el adelanto a Tindivo
-- =============================================================================
--
-- QUÉ BUG CORRIGE
-- Al aprobar un reclamo de cobertura de fraude, `resolve_fraud_claim` insertaba en
-- `contingency_advances` con `actor_charged = 'tindivo'`. El valor correcto es
-- `'restaurante'`.
--
-- POR QUÉ 'restaurante' ES LO CORRECTO
-- Cuando se aprueba la cobertura, **el restaurante es quien se hace cargo** del monto:
-- por eso la misma RPC le genera un `refund_charge` en `business_charges` y le sube la
-- deuda. Tindivo únicamente ADELANTA el dinero al cliente; no lo asume. Etiquetar el
-- adelanto como 'tindivo' contradice el cargo que la propia función crea acto seguido.
--
-- EVIDENCIA DE QUE ERA UN BUG Y NO UNA DECISIÓN
--   1. La cabecera de 0097_sync_appeals_to_business_charges.sql (líneas 4-5) describe el
--      comportamiento deseado como «al aprobar un reclamo de cobertura asignado al
--      restaurante (actor_charged = 'restaurante')» — pero el cuerpo que envía escribe
--      'tindivo'. La intención declarada ya contradecía al código.
--   2. El backfill de esa MISMA migración (0097, línea 87) filtra
--      `WHERE ca.actor_charged = 'restaurante'`. Es decir: las filas que la RPC estaba
--      escribiendo con 'tindivo' quedaban fuera de su propia conciliación contable.
--   3. Test de integración `resolve-fraud-claim.integration.test.ts`, assert (A):
--      `expected 'tindivo' to be 'restaurante'`.
--
-- ALCANCE: UNA SOLA PALABRA
-- El cuerpo se copia literal de la versión VIVA (0097) y cambia únicamente el literal
-- 'tindivo' -> 'restaurante' en el INSERT a `contingency_advances`. Verificado contra
-- `pg_proc.prosrc`: había exactamente 1 ocurrencia de 'tindivo' en toda la función, así
-- que el reemplazo no es ambiguo. NO se toca el INSERT a `business_charges`, ni el
-- `UPDATE businesses.balance_due`, ni la rama de rechazo, ni la firma.
--
-- Se preservan: firma (incluido `p_note text DEFAULT NULL`), RETURNS, LANGUAGE plpgsql,
-- SECURITY DEFINER y `SET search_path = ''` (invariante #3 de CLAUDE.md).
-- `CREATE OR REPLACE` conserva el ACL existente (postgres + service_role); se re-emite el
-- GRANT igual que en 0097 para que el archivo sea autoexplicativo.
--
-- No se editan 0037, 0038, 0039 ni 0097: son migraciones ya aplicadas e inmutables
-- (AGENTS.md §2.1). Este cambio toca lógica de dinero -> gate humano antes de prod (§2.2).

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
      -- FIX #5: era 'tindivo'. El restaurante se hace cargo; Tindivo solo adelanta.
      'Cobertura de fraude aprobada: ' || v_row.reason, 'restaurante', 'activo', p_resolver
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
