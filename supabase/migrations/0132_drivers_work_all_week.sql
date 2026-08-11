-- =============================================================================
-- 0132 · El turno por defecto del motorizado es toda la semana
-- =============================================================================
--
-- `drivers.operating_days` nacía en `{tue,wed,thu,fri,sat}` — un default que ya
-- no describe la operación: el piloto reparte los siete días. `shift_start` y
-- `shift_end` (18:00 / 23:00) sí eran correctos y no se tocan.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HONESTIDAD SOBRE EL ALCANCE
--
--   Estas tres columnas HOY NO LAS LEE NADIE. Se buscó en todo el repo: fuera
--   del `seed-e2e.ts`, ninguna función, endpoint ni pantalla las consulta. El
--   cierre de turno (`close_drivers_outside_schedule`) usa el horario de la
--   PLATAFORMA (`app_settings.platform_schedule`), no el del motorizado.
--
--   O sea: esta migración NO cambia ningún comportamiento. Corrige un dato que
--   estaba mal y que hoy solo se lee con los ojos, en el panel. Se hace igual
--   porque el día que se cableen —turnos por persona es una función razonable—
--   el punto de partida tiene que ser el real y no un default heredado.
--
--   Si en cambio se decide que los turnos por motorizado no van a existir, lo
--   correcto es BORRAR las tres columnas, no mantenerlas mintiendo.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ TAMBIÉN SE ACTUALIZAN LAS FILAS EXISTENTES
--
--   Cambiar solo el DEFAULT dejaría a los motorizados ya dados de alta —los dos
--   del piloto— con el valor viejo, así que el panel seguiría diciendo que
--   Ernesto no trabaja domingos. Un default nuevo que solo aplica a los futuros
--   es media corrección.
--
--   El UPDATE es acotado a propósito: solo toca las filas que conservan el
--   default viejo EXACTO. A quien ya tenga un horario distinto no se le pisa,
--   porque eso sería una elección deliberada de alguien.
-- =============================================================================

ALTER TABLE public.drivers
  ALTER COLUMN operating_days
  SET DEFAULT ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

UPDATE public.drivers
   SET operating_days = ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
 WHERE operating_days = ARRAY['tue', 'wed', 'thu', 'fri', 'sat'];


-- ── Guard: que el default quede escrito de verdad ───────────────────────────
DO $$
DECLARE v_default text;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'drivers'
     AND column_name = 'operating_days';

  IF v_default IS NULL OR v_default NOT LIKE '%sun%' THEN
    RAISE EXCEPTION '0132 abortada: el default de operating_days no incluye domingo (%)', v_default
      USING errcode = 'P0001';
  END IF;
END $$;
