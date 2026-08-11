-- =============================================================================
-- 0142 · Agrega 'no_change' al CHECK constraint de cancel_reason_detail
-- =============================================================================
--
-- POR QUÉ.
--   El motivo de cancelación "No hay vuelto" es el único instrumento de medición
--   para validar si el umbral max_change = S/50 está bien calibrado. Sin él no
--   hay forma de saber si el límite bloqueó pedidos de más.
--
--   Precedente: en el legacy, 121 de 127 cancelaciones tienen cancel_reason_code
--   nulo o texto libre inservible. Sin taxonomía no se mide nada.
--
-- QUÉ CAMBIA.
--   - DROP + ADD CONSTRAINT en orders_cancel_reason_detail_chk para incluir
--     'no_change' junto a los 7 valores existentes.
--   - La columna cancel_reason_detail sigue siendo nullable.
--
-- NO CAMBIA.
--   - Ninguna fila existente. El valor no existe en la base hoy.
--   - La firma de advance_order. Este cambio es solo de constraint DDL.
--
-- ROLLBACK: supabase/rollbacks/0142_no_change_cancel_reason.rollback.sql
--   Restaura el CHECK sin 'no_change'. Falla intencionalmente si ya hay filas
--   con ese valor (el script verifica y reporta el conteo).
-- =============================================================================

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
      'no_change',
      'other'
    )
  );
