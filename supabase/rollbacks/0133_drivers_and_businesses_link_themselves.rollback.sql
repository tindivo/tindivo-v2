-- =============================================================================
-- ROLLBACK de la 0133 · se apaga la auto-vinculación
-- =============================================================================
--
-- 0133 · Motorizados y negocios se vinculan solos.
--
-- Quita los dos triggers y sus funciones. `driver_restaurants` NO se toca: las
-- filas que el backfill creó se quedan, y deben quedarse — borrarlas dejaría a
-- los motorizados sin ver pedidos, que es exactamente el fallo que la 0133
-- vino a cerrar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ LEER ANTES DE EJECUTAR
--
--   Revertir esto devuelve el sistema al estado en que dar de alta un
--   motorizado lo deja SIN VER NINGÚN PEDIDO, sin error y sin aviso. Le pasó a
--   Ernesto Cruz durante dos días y costó tres rondas de diagnóstico, porque el
--   síntoma —"no me llegan pedidos"— apuntaba a las notificaciones y no a una
--   tabla pivote vacía.
--
--   Si el motivo para revertir es que hacen falta FLOTAS DEDICADAS (que un
--   motorizado atienda solo ciertos locales), esto NO es lo que hay que hacer:
--   para eso está la pantalla de asignación del panel, que permite desvincular
--   lo que sobre. Los triggers solo fijan el punto de partida.
--
--   El motivo legítimo para revertir es que aparezcan negocios que NO reparten
--   a domicilio y no deban recibir motorizados por defecto. En ese caso lo
--   correcto no es quitar los triggers sino acotarlos por
--   `businesses.primary_capability` — está señalado en la cabecera de la 0133.
--
-- CÓMO APLICARLO: con el CLI de Supabase, nunca pegándolo en el editor SQL.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_drivers_link_businesses ON public.drivers;
DROP TRIGGER IF EXISTS trg_businesses_link_drivers ON public.businesses;

DROP FUNCTION IF EXISTS public.link_driver_to_all_businesses();
DROP FUNCTION IF EXISTS public.link_business_to_all_drivers();

COMMIT;


-- ── Verificación posterior ──────────────────────────────────────────────────
--
--   SELECT tgname FROM pg_trigger t
--     JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE NOT t.tgisinternal
--      AND tgname IN ('trg_drivers_link_businesses', 'trg_businesses_link_drivers');
--
-- Debe devolver 0 filas.
--
-- Y comprobar que NO se perdieron vínculos (deben seguir todos):
--
--   SELECT count(*) FROM public.driver_restaurants;
