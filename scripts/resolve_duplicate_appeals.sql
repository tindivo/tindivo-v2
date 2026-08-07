-- =============================================================================
-- scripts/resolve_duplicate_appeals.sql
-- Script manual de deduplicación física de apelaciones pre-migración 0067
-- =============================================================================

BEGIN;

-- 1. Crear tabla de respaldo si no existe
CREATE TABLE IF NOT EXISTS public.reports_duplicate_archive (
  LIKE public.reports INCLUDING ALL,
  archived_at timestamptz DEFAULT now(),
  archive_reason text DEFAULT 'Duplicado no canónico de apelación'
);

-- 2. Respaldar reportes duplicados no canónicos (todos excepto el más reciente por pedido)
INSERT INTO public.reports_duplicate_archive
SELECT r.*, now(), 'Duplicado no canónico pre-0067'
FROM public.reports r
WHERE r.type = 'rejected_proof_disputed'
  AND r.id NOT IN (
    SELECT DISTINCT ON (order_id) id
    FROM public.reports
    WHERE type = 'rejected_proof_disputed'
    ORDER BY order_id, created_at DESC
  );

-- 3. Renombrar type y marcar status = 'dismissed' con nota de resolución en los registros no canónicos respaldados
-- para que no queden como revisiones internas abiertas y sean excluidos de uidx_reports_order_appeal
UPDATE public.reports r
SET type = 'prepay_refund_review',
    status = 'dismissed',
    resolution_note = 'Duplicado de apelación cerrado por deduplicación pre-0067',
    resolved_at = now(),
    resolved_by = COALESCE(r.created_by, r.customer_user_id),
    description = COALESCE(description, '') || ' [Archivado por deduplicación pre-0067]'
WHERE r.type = 'rejected_proof_disputed'
  AND r.id IN (SELECT id FROM public.reports_duplicate_archive);

-- 4. Verificar ausencia de duplicados
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM (
    SELECT order_id
    FROM public.reports
    WHERE type = 'rejected_proof_disputed'
    GROUP BY order_id
    HAVING COUNT(*) > 1
  ) t;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Aún existen % duplicados no resueltos', v_remaining;
  ELSE
    RAISE NOTICE 'Deduplicación física completada exitosamente. Se puede aplicar la migración 0067.';
  END IF;
END $$;

COMMIT;
