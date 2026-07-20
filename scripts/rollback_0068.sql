-- =============================================================================
-- scripts/rollback_0068.sql
-- Script de Reversión Segura (Down Migration) para 0068_appeal_fallback_rpc.sql
-- Encapsulado dentro de una transacción única (BEGIN / COMMIT)
-- =============================================================================

BEGIN;

-- 1. Eliminar trigger y función de outbox en orders
DROP TRIGGER IF EXISTS trg_orders_outbox_events ON public.orders;
DROP FUNCTION IF EXISTS public.handle_orders_outbox_events();

-- 2. Eliminar RPCs creadas en 0068
DROP FUNCTION IF EXISTS public.claim_outbox_events(int);
DROP FUNCTION IF EXISTS public.create_fallback_appeal_review(uuid);

-- 3. Eliminar índice de fallback
DROP INDEX IF EXISTS public.uidx_reports_order_fallback;

-- 4. Eliminar tabla outbox_events
DROP TABLE IF EXISTS public.outbox_events;

COMMIT;
