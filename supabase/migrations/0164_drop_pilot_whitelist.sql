-- =============================================================================
-- 0164 · Elimina pilot_whitelist tras el lanzamiento público
-- =============================================================================
--
-- QUÉ HACE
-- Elimina la tabla temporal `pilot_whitelist` creada en la 0135 para el piloto
-- cerrado, ahora que Tindivo ha sido lanzado públicamente.
--
-- No hay foreign keys, vistas ni policies dependientes (la tabla no tenía policies
-- y su acceso era solo por service_role).
--
-- Idempotente: `drop table if exists`.

drop table if exists public.pilot_whitelist;
