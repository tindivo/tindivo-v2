-- =============================================================================
-- ROLLBACK 0214 · NO SE PUEDE DESHACER EN UN PASO, Y CONVIENE SABERLO ANTES
-- =============================================================================
--
-- Postgres NO tiene `ALTER TYPE ... DROP VALUE`. Un valor de enum, una vez
-- anadido, se queda. Este fichero existe para decirlo en el sitio donde alguien
-- lo va a buscar, en vez de dejar que lo descubra a mitad de una reversion.
--
-- SI DE VERDAD HAY QUE QUITARLOS, el unico camino es recrear el tipo, y es una
-- operacion con bloqueo sobre `map_landmarks`:
--
--   1. Reasignar las filas que los usen:
--        UPDATE public.map_landmarks
--           SET category = 'otro'
--         WHERE category IN ('restaurante', 'hotel');
--   2. Renombrar el tipo viejo, crear el nuevo sin los dos valores, convertir la
--      columna con USING, y borrar el viejo:
--        ALTER TYPE public.map_landmark_category RENAME TO map_landmark_category_old;
--        CREATE TYPE public.map_landmark_category AS ENUM (
--          'salud','mercado','educacion','religioso','deporte','recreacion',
--          'gobierno','otro'
--        );
--        ALTER TABLE public.map_landmarks
--          ALTER COLUMN category TYPE public.map_landmark_category
--          USING category::text::public.map_landmark_category;
--        DROP TYPE public.map_landmark_category_old;
--   3. Revertir tambien los tres sitios del codigo que la 0214 nombra en su
--      cabecera, o el type-check se cae por `enum-drift.ts`.
--
-- MIENTRAS TANTO, LA REVERSION BARATA es dejar de ofrecerlos: quitar las dos
-- entradas de `MAP_LANDMARK_CATEGORIES` NO vale (rompe el drift), pero filtrar
-- el desplegable del panel si. Las filas ya creadas siguen pintandose.
--
-- Este script no hace nada a proposito.
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Rollback 0214: no-op. Postgres no permite quitar valores de un enum; lee la cabecera de este fichero.';
END
$$;
