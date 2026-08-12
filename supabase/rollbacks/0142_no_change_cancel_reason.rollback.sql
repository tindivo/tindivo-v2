-- =============================================================================
-- ROLLBACK 0142 · no_change en cancel_reason_detail_chk
-- =============================================================================
-- Restaura el CHECK sin 'no_change'.
-- PRECAUCIÓN: falla si ya hay filas con cancel_reason_detail = 'no_change'.
-- El script verifica primero y reporta en vez de fallar en seco.
-- =============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.orders
  WHERE cancel_reason_detail = 'no_change';

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'No se puede hacer rollback de 0142: hay % fila(s) con cancel_reason_detail = ''no_change''. Limpiar primero.',
      v_count
      USING errcode = 'P0001';
  END IF;
END $$;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancel_reason_detail_chk;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_cancel_reason_detail_chk CHECK (
    cancel_reason_detail IS NULL OR cancel_reason_detail IN (
      'out_of_stock',
      'closed',
      'out_of_zone',
      'no_answer',
      'customer_request',
      'duplicate',
      'other'
    )
  );
