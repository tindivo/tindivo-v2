-- =============================================================================
-- ROLLBACK de la 0132 · el turno vuelve a martes-sábado
-- =============================================================================
--
-- 0132 · El turno por defecto del motorizado es toda la semana.
--
-- Devuelve `drivers.operating_days` a su default anterior `{tue..sat}` y
-- deshace la actualización de las filas que la 0132 tocó.
--
-- ⚠️ ESTE ROLLBACK CASI NUNCA ES LO QUE QUERÉS. La 0132 no cambia
-- comportamiento —esas columnas no las lee ningún código— así que revertirla no
-- arregla nada roto: solo devuelve un dato incorrecto (decir que el motorizado
-- no trabaja domingos cuando sí lo hace). Tiene sentido únicamente si se decide
-- que el reparto vuelve a ser de martes a sábado.
--
-- LÍMITE CONOCIDO: el UPDATE de abajo no distingue entre una fila que la 0132
-- cambió y una que alguien puso a los siete días a mano después. Si alguien
-- editó turnos entre medias, revisar antes:
--
--   SELECT full_name, operating_days, updated_at FROM public.drivers;
--
-- CÓMO APLICARLO: con el CLI de Supabase, nunca pegándolo en el editor SQL.
-- =============================================================================

BEGIN;

ALTER TABLE public.drivers
  ALTER COLUMN operating_days
  SET DEFAULT ARRAY['tue', 'wed', 'thu', 'fri', 'sat'];

UPDATE public.drivers
   SET operating_days = ARRAY['tue', 'wed', 'thu', 'fri', 'sat']
 WHERE operating_days = ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

COMMIT;


-- ── Verificación posterior ──────────────────────────────────────────────────
--
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='drivers'
--      AND column_name='operating_days';
--
-- No debe contener 'sun'.
