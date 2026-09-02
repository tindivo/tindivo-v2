-- ============================================================================
-- ROLLBACK 0206 — `is_compact` nunca quiso decir «compacto»
-- ============================================================================
--
-- La 0206 solo escribe un COMMENT. Volver atrás es quitarlo, y lo único que se
-- consigue es que la próxima auditoría vuelva a denunciar la columna como un
-- desajuste que no existe.
-- ============================================================================

COMMENT ON COLUMN public.menu_items.is_compact IS NULL;
