-- ============================================================================
-- 0202 — La plaza no era la casa de nadie
-- ============================================================================
--
-- LO QUE PASÓ, MEDIDO EN PROD EL 2026-09-01.
--
-- `apps/customer/components/map-picker.tsx` escribía el centro de cobertura
-- como coordenada del formulario nada más montar, «para que Guardar funcione
-- aunque el usuario nunca abra el mapa», y `canSave` solo miraba la calle y la
-- referencia. Quien llenaba los dos textos sin enterarse de que había que
-- arrastrar el mapa guardaba la plaza de San Jacinto como su casa, con el botón
-- en naranja y sin un solo aviso.
--
-- Tres personas de treinta lo hicieron. Las tres son `is_default = true`:
--
--   2026-08-21  Calle iquitos#31            Frente cevicheria samy
--   2026-08-25  Virgen del Carmen           A pocos metros del parque de Solidex alto
--   2026-08-30  Solidex bajo mz 5 lt 6      Por la ferretería noralongo, familia Balta
--
-- Las tres con coordenada EXACTA `-9.1465000, -78.2779000` — el centro de
-- cobertura a siete decimales, que ninguna mano produce arrastrando un mapa. Y
-- fíjate en las referencias: escribieron direcciones buenas. Hicieron su parte.
-- Dos de esos tres pedidos ya salieron hacia la plaza.
--
-- Es el mismo defecto que la 0147 documenta del v1 —«el legacy plantaba el pin
-- en el centro del pueblo con el botón Confirmar habilitado: 18 direcciones
-- falsas»— y que el app del motorizado ya había cerrado por su lado. Al app del
-- cliente le llegó hoy.
--
-- QUÉ HACE ESTA MIGRACIÓN.
--
--   1. `location_confirmed_at` — cuándo una persona dijo «aquí es mi puerta».
--      NULL significa que ese punto no lo eligió nadie.
--   2. `location_accuracy_m` — los metros del sensor. La columna que faltaba:
--      el mapa YA calculaba la precisión y las tres pantallas que guardan la
--      tiraban a la basura, así que a posteriori no había forma de separar un
--      GPS de ±8 m de una plaza puesta por defecto. Hubo que cazar estos tres
--      casos comparando coordenadas a mano.
--
--      MISMO CONVENIO QUE LA 0147, a propósito: NULL = el pin se arrastró a
--      mano, así que no hay medida del sensor. No es «desconocido», es «esto no
--      es una medición, es una decisión». Por eso no hace falta una columna
--      aparte de origen.
--
-- LO QUE NO HACE: no toca ni una coordenada. Dejar la plaza puesta es más
-- seguro que ponerla a NULL —nada aguas abajo tiene que aprender un caso nuevo—
-- y el motorizado sigue teniendo la referencia de texto, que es buena. Lo único
-- que cambia es que ahora está DICHO que ese punto no lo eligió nadie, y la app
-- puede pedirle a esas tres personas que lo corrijan.
--
-- EL BACKFILL CONFIRMA POR EXCLUSIÓN, y el centro sale de `app_settings`, no de
-- una constante escrita aquí: si mañana se mueve el centro de cobertura, esta
-- migración ya corrió y no se relee. La igualdad es EXACTA sobre `numeric`, sin
-- épsilon: el valor por defecto se escribía copiando esa misma cifra, así que
-- casa al último decimal. Un margen de tolerancia solo añadiría falsos
-- positivos —una casa de verdad a diez metros de la plaza— sin capturar ni una
-- fila más.
--
-- ROLLBACK: supabase/rollbacks/0202_the_town_square_was_never_anyones_house.rollback.sql
-- ============================================================================

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_accuracy_m integer;

COMMENT ON COLUMN public.customer_addresses.location_confirmed_at IS
  'Cuándo una persona confirmó este punto en el mapa. NULL = el punto no lo eligió nadie (heredado del defecto del centro de cobertura); la app pide corregirlo.';

COMMENT ON COLUMN public.customer_addresses.location_accuracy_m IS
  'Metros de precisión del sensor. NULL = el pin se puso a mano, así que no hay medida (mismo convenio que capture_delivery_address, 0147).';

-- Precisión imposible: 0 era el centinela del legacy que destruyó la medida de
-- 49 filas (0147). Aquí la ausencia de medida es NULL y nada más.
ALTER TABLE public.customer_addresses
  DROP CONSTRAINT IF EXISTS customer_addresses_location_accuracy_positive;
ALTER TABLE public.customer_addresses
  ADD CONSTRAINT customer_addresses_location_accuracy_positive
  CHECK (location_accuracy_m IS NULL OR location_accuracy_m > 0);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Se da por confirmada toda dirección CON coordenada que no sea exactamente el
-- centro del pueblo. No es que sepamos que estuvieron bien puestas: es que no
-- tenemos motivo para dudar de ellas, y marcarlas todas para revisión mandaría
-- a veintisiete personas a arreglar algo que no está roto.
WITH centro AS (
  SELECT (value ->> 'centerLat')::numeric AS lat,
         (value ->> 'centerLng')::numeric AS lng
  FROM public.app_settings
  WHERE key = 'coverage'
)
UPDATE public.customer_addresses a
SET location_confirmed_at = a.created_at
FROM centro c
WHERE a.location_confirmed_at IS NULL
  AND a.coordinates_lat IS NOT NULL
  AND a.coordinates_lng IS NOT NULL
  AND NOT (a.coordinates_lat = c.lat AND a.coordinates_lng = c.lng);

-- Índice parcial: las filas por corregir son un puñado y las consulta la libreta
-- del cliente en cada carga. Parcial y no total porque lo normal es que esta
-- lista esté vacía, y un índice sobre la columna entera sería casi todo relleno.
CREATE INDEX IF NOT EXISTS customer_addresses_unconfirmed_idx
  ON public.customer_addresses (user_id)
  WHERE location_confirmed_at IS NULL;
