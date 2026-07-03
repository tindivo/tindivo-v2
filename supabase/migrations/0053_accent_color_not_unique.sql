-- =============================================================================
-- 0053 · El color de papelito ya NO es único entre negocios activos.
--
-- La paleta establecida de 12 colores (BUSINESS_ACCENT_PALETTE en
-- @tindivo/contracts) reemplaza al hex libre en los formularios; dos negocios
-- activos pueden compartir color (DECISIONS §21, 2026-07-02). El índice único
-- parcial de 0002 hacía fallar el alta con 'conflict' al repetir un color
-- (p. ej. el default del form 'e11d48' ya ocupado por La Florencia).
--
-- NO se crea índice de reemplazo: ninguna query filtra, ordena ni joinea por
-- accent_color (solo aparece en SELECTs y payloads jsonb presentacionales);
-- un índice normal sería costo de escritura sin lectura que lo aproveche.
-- El CHECK accent_color_format (minúsculas sin #) se mantiene intacto.
-- Idempotente.
-- =============================================================================

drop index if exists public.businesses_accent_color_active_idx;

comment on column public.businesses.accent_color is
  'Hex en minúsculas sin # (CHECK accent_color_format). Paleta sugerida: BUSINESS_ACCENT_PALETTE en @tindivo/contracts. NO único desde 0053.';
