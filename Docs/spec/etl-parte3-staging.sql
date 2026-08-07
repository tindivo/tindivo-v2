-- =============================================================================
-- ETL del directorio de direcciones · PARTES 2-3 — Extracción y transformación
-- Destino: zpnipajgwfthxhdtzhly (tindivo-prod)
-- Origen:  nwcdxmebsozswnjlblip (tindivo-delivery / legacy)
-- Spec: Docs/spec/spec_manual.md, Partes 2 y 3
-- =============================================================================
--
-- NO es una migración. Es un script de una sola corrida, manual, que NO va en
-- supabase/migrations/. Deja el staging listo; NO inserta en address_directory
-- (eso es la Parte 4).
--
-- CORRIDO EL 2026-08-04 contra tindivo-prod. Este archivo refleja lo que se
-- ejecutó, no lo que se planeaba ejecutar. Tres diferencias con la versión
-- anterior, todas medidas:
--   · Los datos NO entran por CSV (ver bloque de extracción abajo).
--   · R3 discrimina por COORDENADA y corre ANTES que R2 (18 filas, no 16).
--   · R0 descarta 4 filas basura por address_id explícito.
--
-- Resultados de la corrida:
--   664 crudas · 4 descartadas (R0) · 2 colapsadas (R7) · 658 a insertar
--   591 teléfonos · 351 con GPS · 199 con accuracy_m · times_used 1296 = 1296
-- =============================================================================


-- ── 0 · Staging ------------------------------------------------------------

DROP TABLE IF EXISTS _stg_address_import;
CREATE TABLE _stg_address_import (
  -- columnas tal cual salen del export 2.1
  address_id        uuid,
  phone             text,
  customer_name     text,
  reference         text,
  lat               double precision,
  lng               double precision,
  accuracy_m        double precision,
  source            text,
  is_default        boolean,
  times_used        integer,
  last_used_at      timestamptz,
  created_at        timestamptz,
  updated_at        timestamptz,

  -- columnas de trabajo
  regla_aplicada    text,
  descartada        boolean NOT NULL DEFAULT false,
  colapsada         boolean NOT NULL DEFAULT false,
  ganadora          boolean NOT NULL DEFAULT false,
  grupo_key         text,
  times_used_final  integer,
  last_used_final   timestamptz,
  legacy_created_min timestamptz,
  is_default_final  boolean,
  customer_name_final text,
  created_at_final  timestamptz,
  imported_at       timestamptz
);

DROP TABLE IF EXISTS _stg_first_order;
CREATE TABLE _stg_first_order (
  phone         text PRIMARY KEY,
  primer_pedido timestamptz
);


-- ── 0-bis · Extracción del legacy SIN archivos intermedios ------------------
-- Nada de CSV. El CSV mete a Excel, al UTF-8 y al CRLF en la cadena, y este
-- dataset tiene referencias con saltos de línea embebidos (p.ej. la del
-- teléfono 962836654, 81 caracteres con un LF en la posición 32) y comas dentro
-- del texto. Con CSV eso se rompe; con JSON de Postgres a Postgres, no.
--
-- v2 lee al legacy por su cuenta vía extensión `http` contra el PostgREST del
-- legacy, y el JSON se parsea con json_to_recordset. Los datos nunca tocan
-- disco ni pasan por un cliente intermedio.
--
--   CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
--
-- La secret key (sb_secret_...) NO se versiona: se pasa en el momento de la
-- corrida y se ROTA al terminar, porque queda en los logs de consultas de v2.
--
-- >>> TRAMPA CRÍTICA — el PostgREST del legacy trunca a 1000 filas EN SILENCIO.
--     `db-max-rows = 1000`. Un ?limit=5000 devuelve 206 y 1000 filas, sin error.
--     ANTES de cada lectura: pedir el conteo con `Prefer: count=exact` y leer el
--     header Content-Range. Si supera 1000, paginar con
--     &order=<pk>&limit=1000&offset=N y verificar filas_leídas = total.
--     En la corrida real esto produjo un _stg_first_order con 571 teléfonos en
--     vez de 748 (leyó 1000 de 1606 pedidos) y hubo que rehacerlo. <<<
--
-- 2.1 · Directorio  -> 664 filas (bajo el tope, una sola llamada)
-- 2.2 · Primer pedido por teléfono -> 1606 pedidos EN DOS PÁGINAS -> 748 teléfonos
--
-- Verificación de fidelidad de la carga (dio 0 en ambos sentidos):
--   SELECT count(*) FROM (SELECT ... FROM legacy EXCEPT SELECT ... FROM _stg) d;


-- ── 1 · Reglas de limpieza, en ESTE orden -----------------------------------
-- Cada UPDATE etiqueta `regla_aplicada` para que la verificación 3.3 pueda
-- contar cuántas filas tocó cada regla.

-- R0 · basura explícita, por address_id y NUNCA por patrón.
--   Un patrón sobre reference/customer_name arrastraría direcciones reales mal
--   escritas. Se enumeran una por una y se REPORTAN antes de descartarlas.
--   Las cuatro: E2E Push Test · Ejemplo/Av. Mansiche · aslkdaskldlasd ·
--   mashdkashjd. Ninguna tiene GPS, ninguna comparte teléfono con otra
--   dirección: sus 4 teléfonos salen del directorio (595 -> 591).
--   Esperado: 4 filas.
UPDATE _stg_address_import
   SET descartada = true, regla_aplicada = 'R0_basura_explicita'
 WHERE address_id IN ('5edca29c-364f-4277-ab50-18ef35f953f4',
                      '004269be-921a-4a48-a701-8c7c75710fe0',
                      '667fc9d7-4b33-458a-9cab-7c3aad0a0f70',
                      '63e3e9e1-6f59-458a-9a38-a4d11571a4c6');

-- R1 · reference NULL o vacío -> descartar.
--   Medido: 0 filas. Si aquí sale algo, PARAR: el destino tiene
--   reference NOT NULL y esas coordenadas no se recuperan después.
UPDATE _stg_address_import
   SET descartada = true, regla_aplicada = 'R1_sin_reference'
 WHERE NOT descartada AND (reference IS NULL OR btrim(reference) = '');

-- R3 · pin plantado en SAN_JACINTO_CENTER -> anular TODO.  ¡VA ANTES QUE R2!
--   El discriminante es la COORDENADA, no el accuracy. Cuando el GPS fallaba,
--   el legacy plantaba el pin en la constante -9.146872, -78.279047, exacta y
--   repetida al bit, y el motorizado confirmaba sin arrastrar. Dato falso.
--   De las 18 filas en esa coordenada, solo 16 traen el 999: una trae
--   accuracy = 0 y otra accuracy = NULL (admin_curated, times_used = 9). Esas
--   dos se escapaban de la regla vieja, que filtraba por 999 + distancia.
--
--   POR QUÉ ANTES QUE R2: si R2 corre primero, a la fila con accuracy = 0 le
--   anula el metadato y le CONSERVA la coordenada falsa, que queda
--   indistinguible de una medición legítima. El rastro que la delataba era
--   justo el metadato que R2 borra.
--   Esperado: 18 filas.
UPDATE _stg_address_import
   SET lat = NULL, lng = NULL, accuracy_m = NULL, source = 'backfill',
       regla_aplicada = 'R3_pin_en_centro'
 WHERE NOT descartada
   AND lat IS NOT NULL
   AND abs(lat - (-9.146872)) < 0.000001
   AND abs(lng - (-78.279047)) < 0.000001;

-- R2 · accuracy_m = 0 -> anular accuracy, CONSERVAR coordenadas.
--   Son reconfirmaciones con `accuracy: 0` hardcodeado en el cliente legacy
--   (active-order-detail.tsx:694). La coordenada es buena; el metadato no.
--   Esperado: 48 filas (las 49 con cero menos la que ya se llevó R3).
UPDATE _stg_address_import
   SET accuracy_m = NULL, regla_aplicada = 'R2_accuracy_cero'
 WHERE NOT descartada AND accuracy_m = 0;

-- R4 · centinela 999 en coordenada DISTINTA al centro -> solo el metadato.
--   Ahí el motorizado sí arrastró el pin: la coordenada es buena.
--   No necesita condición de distancia porque R3 ya dejó en NULL el accuracy
--   de las 16 del centro. Esperado: 4 filas.
UPDATE _stg_address_import
   SET accuracy_m = NULL, regla_aplicada = 'R4_centinela_arrastrado'
 WHERE NOT descartada AND accuracy_m BETWEEN 998.5 AND 999.5;

-- R5 · accuracy_m >= 1000 -> fix por IP, anular TODO.
--   Se descarta por PRECISIÓN, no por distancia: un fix preciso pero lejano
--   es un pedido fuera de zona, no un dato malo.  Esperado: 2 filas.
UPDATE _stg_address_import
   SET lat = NULL, lng = NULL, accuracy_m = NULL,
       regla_aplicada = 'R5_fix_por_ip'
 WHERE NOT descartada AND accuracy_m >= 1000;

-- R6 · coordenada fuera de la caja destino -> anular. Red de seguridad.
--   Esperado: 0 filas (ya medido en 2.3.d).
UPDATE _stg_address_import
   SET lat = NULL, lng = NULL, accuracy_m = NULL,
       regla_aplicada = COALESCE(regla_aplicada || '+', '') || 'R6_fuera_de_caja'
 WHERE NOT descartada AND lat IS NOT NULL
   AND NOT (lat BETWEEN -9.20 AND -9.10 AND lng BETWEEN -78.33 AND -78.23);


-- ── 2 · R7 · Deduplicación --------------------------------------------------
-- Agrupa por (teléfono, referencia normalizada). Medido: 1 grupo, 3 filas,
-- 2 colapsadas (teléfono 923642122, "RENOVACION CASA DE LALI").
--
-- OJO con el desempate: las tres filas de ese grupo tenían GPS, así que el
-- dedup se lleva 2 coordenadas y 1 accuracy. Por eso el total final es 351 con
-- GPS y 199 con accuracy, y no 353/200: la cuenta 373 - 18 (R3) - 2 (R5) es
-- ANTES del dedup.

UPDATE _stg_address_import
   SET grupo_key = phone || '|' || lower(btrim(regexp_replace(reference, '\s+', ' ', 'g')))
 WHERE NOT descartada;

-- Ganadora del grupo. Desempate: 1) tiene GPS  2) last_used_at más reciente
-- 3) address_id menor (determinismo).
WITH ranked AS (
  SELECT address_id,
         row_number() OVER (
           PARTITION BY grupo_key
           ORDER BY (lat IS NOT NULL) DESC,
                    last_used_at DESC NULLS LAST,
                    address_id ASC
         ) AS rn
  FROM _stg_address_import
  WHERE NOT descartada
)
UPDATE _stg_address_import s
   SET ganadora = (r.rn = 1),
       colapsada = (r.rn > 1)
  FROM ranked r
 WHERE s.address_id = r.address_id;

-- Consolidación de los campos del grupo sobre la fila ganadora.
WITH agg AS (
  SELECT grupo_key,
         SUM(times_used)                       AS suma_usos,
         MAX(last_used_at)                     AS ultimo_uso,
         MIN(created_at)                       AS primer_created,
         bool_or(is_default)                   AS alguna_default,
         (array_remove(array_agg(customer_name ORDER BY last_used_at DESC NULLS LAST), NULL))[1]
                                               AS primer_nombre
  FROM _stg_address_import
  WHERE NOT descartada
  GROUP BY grupo_key
)
UPDATE _stg_address_import s
   SET times_used_final   = a.suma_usos,
       last_used_final    = a.ultimo_uso,
       legacy_created_min = a.primer_created,
       is_default_final   = a.alguna_default,
       customer_name_final = COALESCE(s.customer_name, a.primer_nombre)
  FROM agg a
 WHERE s.grupo_key = a.grupo_key AND s.ganadora;


-- ── 3 · is_default: máximo uno por teléfono ---------------------------------
-- El índice único parcial del destino lo exige. Mismo desempate.

WITH ranked_def AS (
  SELECT address_id,
         row_number() OVER (
           PARTITION BY phone
           ORDER BY (lat IS NOT NULL) DESC, last_used_final DESC NULLS LAST, address_id ASC
         ) AS rn
  FROM _stg_address_import
  WHERE ganadora AND is_default_final
)
UPDATE _stg_address_import s
   SET is_default_final = (r.rn = 1)
  FROM ranked_def r
 WHERE s.address_id = r.address_id;

-- Teléfonos que quedaron sin ninguna principal: marcar la de uso más reciente.
WITH sin_default AS (
  SELECT phone FROM _stg_address_import
   WHERE ganadora GROUP BY phone
  HAVING bool_or(COALESCE(is_default_final, false)) = false
), elegida AS (
  SELECT DISTINCT ON (s.phone) s.address_id
    FROM _stg_address_import s JOIN sin_default d ON d.phone = s.phone
   WHERE s.ganadora
   ORDER BY s.phone, (s.lat IS NOT NULL) DESC, s.last_used_final DESC NULLS LAST, s.address_id
)
UPDATE _stg_address_import s
   SET is_default_final = true
  FROM elegida e
 WHERE s.address_id = e.address_id;


-- ── 4 · Fechas · regla CONDICIONAL (hallazgo 6 del spec) --------------------
-- La versión anterior de este script aplanaba TODAS las ganadoras al primer
-- pedido del teléfono. Eso contradice el hallazgo 6, que es la decisión vigente:
-- solo se rederiva el created_at de las 411 filas del artefacto del backfill
-- (2026-06-23). Fuera de ahí el created_at del legacy es real y se respeta —
-- si no, una segunda dirección creada en julio se backdatea a mayo.
--
-- CONSECUENCIA MEDIDA: la verificación 3.7 da 199, no 0. Son ganadoras
-- no-backfill cuyo created_at cae 0,072-0,585 s DESPUÉS de su last_used_at,
-- porque el legacy escribía pedido y dirección en la misma transacción. No es
-- una fecha mal derivada. Ver spec_manual.md, nota de 3.7.

UPDATE _stg_address_import s
   SET created_at_final = CASE
         WHEN s.legacy_created_min::date = date '2026-06-23'
           THEN COALESCE(f.primer_pedido, s.legacy_created_min)
         ELSE s.legacy_created_min
       END,
       imported_at = now()
  FROM _stg_first_order f
 WHERE s.phone = f.phone AND s.ganadora;

-- Las que no tengan pedido en el histórico caen a su legacy_created_at.
-- (En la corrida real: 0 filas, los 591 teléfonos tenían pedido.)
UPDATE _stg_address_import
   SET created_at_final = COALESCE(created_at_final, legacy_created_min),
       imported_at      = COALESCE(imported_at, now())
 WHERE ganadora;


-- ── 5 · Corrección de 3.7 · LEAST -------------------------------------------
-- ESPERADO: exactamente 199 filas. Si toca más o menos, PARAR y reportar antes
-- de seguir — el bloque aborta la transacción solo.
--
-- POR QUÉ: son ganadoras del camino NO-backfill cuyo created_at del legacy cae
-- entre 0,072 y 0,585 segundos DESPUÉS de su last_used_at. Ninguna pasa del
-- minuto. Es el legacy escribiendo el pedido y la dirección en la misma
-- transacción: last_used_at toma el timestamp del pedido y la fila de la
-- dirección se inserta unos milisegundos más tarde. Las 407 del backfill dan 0
-- inversiones, porque ahí created_at sale del primer pedido.
--
-- El ajuste es de milisegundos, operativamente invisible, y deja cierto el
-- invariante "una dirección no se usó antes de existir". Después de esto, 3.7
-- debe dar 0 — volver a correrla.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM _stg_address_import
   WHERE ganadora AND last_used_final IS NOT NULL
     AND created_at_final > last_used_final;

  IF n <> 199 THEN
    RAISE EXCEPTION 'ABORTADO: la correccion 3.7 afectaria % filas, se esperaban 199', n;
  END IF;

  UPDATE _stg_address_import
     SET created_at_final = least(created_at_final, last_used_final)
   WHERE ganadora AND last_used_final IS NOT NULL
     AND created_at_final > last_used_final;
END $$;
