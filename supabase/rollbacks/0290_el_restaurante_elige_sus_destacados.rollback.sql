-- ============================================================================
-- ROLLBACK 0290 — el restaurante elige sus destacados
-- ============================================================================
--
-- Borra las dos columnas: se pierde lo que cada restaurante marcó como destacado y el nombre de su sección. Solo es
-- seguro mientras ninguna app dependa del campo `featured` de la carta (es opcional y aditivo).
-- ============================================================================

alter table public.businesses drop constraint if exists businesses_featured_title_check;
alter table public.businesses drop column if exists featured_title;
alter table public.menu_items drop column if exists is_featured;
