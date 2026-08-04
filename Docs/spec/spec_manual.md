# SPEC — ETL del directorio de direcciones (legacy → v2)

**Versión:** 3 · **Fecha:** 2026-08-03
**Destino:** Supabase `zpnipajgwfthxhdtzhly` (tindivo-prod / v2)
**Origen:** Supabase `nwcdxmebsozswnjlblip` (tindivo-delivery / legacy)
**Migración inicial:** `0122` (última aplicada: `0121_release_clears_the_clock`)

## Historial de versiones

**v2 → v3.** Cinco correcciones del agente más siete hallazgos de revisión propia:

| #   | Cambio                                                                                | Origen   |
| --- | ------------------------------------------------------------------------------------- | -------- |
| 1   | `imported_at` vuelve a **nullable** + CHECK pareado con `legacy_address_id`           | Agente   |
| 2   | Citas de línea de `mark-delivered.use-case.ts` corregidas (85, 154, 181, 238)         | Agente   |
| 3   | Contradicción prosa/SQL sobre la FK del puntero: se queda la FK                       | Agente   |
| 4   | **Lookup por referencia antes de INSERT** — obligatorio, no opcional                  | Agente   |
| 5   | La policy no puede expresar `business_manual`: es regla de aplicación                 | Agente   |
| 6   | Derivación de `created_at` refinada (no aplanar todas las direcciones de un teléfono) | Revisión |
| 7   | **RPC `search_address_directory` definido**, antes solo mencionado                    | Revisión |
| 8   | **Columnas de monto/delivery en `orders`** — faltaban por completo                    | Revisión |
| 9   | **Seed de `app_settings`** para las tarifas — faltaba                                 | Revisión |
| 10  | Rate limiting: evaluación honesta, se degrada de "necesario" a "opcional"             | Revisión |
| 11  | Coexistencia con `customer_addresses` (B2C): dirección propuesta, no solo diferida    | Revisión |
| 12  | Nota de escalabilidad con números reales                                              | Revisión |

**Corrección de la v2 que era mía, no del agente:** puse `imported_at NOT NULL`
resolviendo una inconsistencia en la dirección equivocada. Con `NOT NULL`, cada
dirección nueva post-ETL tendría que suministrar un valor, y si el código pone
`now()`, la columna deja de significar "vino del legacy" — que era justo el
rastro que quería preservar.

---

## REGLAS DURAS

1. **Solo `npx supabase db push`.** Ejecutar archivos SQL directamente está
   prohibido, igual que `docker cp` + `psql` y aplicar migraciones vía MCP.
   Rige `CLAUDE.md §Supabase` y `.agents/AGENTS.md §2.1-bis`.
2. **Las migraciones son inmutables.** Todo cambio requiere migración nueva.
3. **Regla 0:** leer cómo lo resolvió `tindivo-delivery` y adaptar. No inventar.
4. **Deuda: detalle y agregado conviven.** `business_charges` es la fuente de
   verdad para el **detalle** de la deuda. `businesses.balance_due` es un
   **agregado derivado, vivo y mantenido** por `generate_delivery_charges:42-45`.
   Ambos se escriben en la misma función y **deben cuadrar siempre**.
   Lo que **NO se porta** es el trigger del **legacy**
   (`20260420010100_triggers.sql:44-56`), porque v2 ya tiene el suyo.
   <br>*(Corrección: una versión anterior decía "`balance_due` está deprecado".
   Era cierto del legacy y falso de v2 — premisa transferida sin verificar.)*
5. El legacy queda **read-only** después del corte. Este ETL corre **una vez**.
6. Cada parte se verifica antes de avanzar. No continuar con discrepancias.

---

## DECISIONES CERRADAS

| Decisión                 | Valor                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| Alcance                  | **Global** — compartido por los 4 negocios                        |
| Identidad                | **Teléfono**. Sin `user_id`                                       |
| Tabla destino            | **`address_directory`** — NUEVA, separada de `customer_addresses` |
| Coordenadas              | `double precision` (no numeric, no PostGIS)                       |
| `source`                 | Enum de 3 valores: quién tocó último, no cómo se capturó          |
| Corte                    | Los 4 negocios migran el **mismo día**                            |
| `address_capture_events` | **No se porta**                                                   |
| Auditoría                | `updated_by` obligatorio                                          |

**Por qué tabla separada:** `public.customer_addresses` ya existe en v2 con
`user_id uuid NOT NULL` — es la libreta de un cliente registrado (con `label`
tipo "Casa"/"Trabajo"). El directorio es de gente que nunca se registró.
Fusionar obligaría a hacer `user_id` nullable y a escribir una policy RLS
condicional sobre columna nullable, cuyo modo de falla es que un cliente vea
direcciones de otro.

### Coexistencia de las dos tablas (hallazgo 11)

Cuando entre el B2C, un cliente registrado pedirá con una dirección de SU
libreta (`customer_addresses`), no del directorio. El motorizado entrega igual y
captura GPS. **¿A qué tabla escribe?**

Dirección propuesta, a confirmar antes de que entre el B2C:

> El pedido guarda **dos punteros nullables y mutuamente excluyentes**:
> `address_directory_id` y `customer_address_id`. El write-back del GPS mira cuál
> está poblado. El directorio NO se contamina con direcciones de clientes
> registrados, y la libreta del cliente no se expone a los negocios.

No se implementa ahora — durante el soft launch todos los pedidos son
`business_manual`. Pero `orders` debe nacer con las dos columnas para no migrar
dos veces.

---

## SEMÁNTICA DE `source`

`source` = **el rol que tocó la fila por última vez**, no el método de captura.

| valor             | significado                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `backfill`        | Estado inicial de la importación. Se pierde apenas alguien edita |
| `driver_verified` | Un motorizado tocó la fila por última vez                        |
| `admin_curated`   | Un admin tocó la fila por última vez                             |

**El método de captura se deduce de `accuracy_m`:**

| qué pasó              | `source`          | `accuracy_m` |
| --------------------- | ----------------- | ------------ |
| GPS del sensor        | `driver_verified` | número       |
| Pin arrastrado a mano | `driver_verified` | **NULL**     |

Invariantes que el código del v2 debe respetar:

- **Nunca escribir `accuracy_m = 0`.** El legacy lo hace en
  `active-order-detail.tsx:681-698` y destruyó 49 filas.
- **Nunca escribir el centinela `999`.** El legacy lo hace en
  `address-capture-modal.tsx:190` (`accuracy ?? 999`) → 16 direcciones falsas.
- Si el motorizado captura GPS y **luego** arrastra el pin: `accuracy_m = NULL`.

El rastro de la importación vive en `imported_at`, no en `source` (que muta).

---

## PARTE 1 — Migración de esquema (`0122`)

```sql
-- =====================================================================
-- address_directory: directorio operativo de direcciones de Tindivo.
-- Indexado por teléfono. Sin dueño. Compartido por todos los negocios.
-- NO confundir con public.customer_addresses (libreta de usuario registrado).
-- =====================================================================

CREATE TYPE public.address_source AS ENUM (
  'backfill',
  'driver_verified',
  'admin_curated'
);

CREATE TABLE public.address_directory (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  phone             text NOT NULL,
  customer_name     text,
  reference         text NOT NULL,

  lat               double precision,
  lng               double precision,
  accuracy_m        double precision,

  source            public.address_source NOT NULL,
  is_default        boolean NOT NULL DEFAULT false,
  times_used        integer NOT NULL DEFAULT 0,
  last_used_at      timestamptz,

  updated_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- Trazabilidad del ETL. NULL = fila nacida en v2.
  legacy_address_id uuid,
  legacy_created_at timestamptz,
  imported_at       timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT address_directory_phone_check
    CHECK (phone ~ '^9\d{8}$'),

  CONSTRAINT address_directory_coords_paired
    CHECK ((lat IS NULL) = (lng IS NULL)),

  -- Los tres campos de importación van juntos o no van.
  -- Impide que una fila nacida en v2 finja ser importada.
  CONSTRAINT address_directory_import_paired
    CHECK ((imported_at IS NULL) = (legacy_address_id IS NULL)),

  -- Caja de San Jacinto. Medido: las 368 direcciones con GPS caen en
  -- lat [-9,15501 .. -9,13729] x lng [-78,28532 .. -78,27360], así que la
  -- holgura real es 4,1 km al norte, 5,0 al sur y 4,8-4,9 al este y oeste.
  -- Rechaza los fixes por IP que contaminaron el legacy (ej. -8,09 / -79,04).
  -- OJO: es una frontera DURA. Rechaza toda coordenada fuera de la caja, sea
  -- basura o no — verificado: un GPS legítimo de 12 m a 11,5 km también se
  -- rechaza, y en el legacy hubo dos. Aceptable porque el polígono de
  -- cobertura tiene ~1,3 km de radio, pero el INSERT lanza excepción: quien
  -- capture direcciones debe tratarla, no dejar que tumbe la entrega.
  CONSTRAINT address_directory_coords_bbox
    CHECK (
      lat IS NULL OR (
        lat BETWEEN -9.20 AND -9.10 AND
        lng BETWEEN -78.33 AND -78.23
      )
    ),

  -- El 999 se excluye por RANGO, no por igualdad: accuracy_m es double
  -- precision y `<> 999` deja pasar un 999.0000001.
  -- (Defecto encontrado probando la 0122 en local: la version anterior de este
  --  CHECK, `> 0 AND < 1000`, ACEPTABA el centinela 999.)
  CONSTRAINT address_directory_accuracy_check
    CHECK (
      accuracy_m IS NULL
      OR (
        accuracy_m > 0
        AND accuracy_m < 1000
        AND accuracy_m NOT BETWEEN 998.5 AND 999.5
      )
    ),

  CONSTRAINT address_directory_accuracy_needs_coords
    CHECK (accuracy_m IS NULL OR lat IS NOT NULL)
);

CREATE INDEX address_directory_phone_idx
  ON public.address_directory (phone);

CREATE UNIQUE INDEX address_directory_default_unique
  ON public.address_directory (phone) WHERE is_default;

-- Idempotencia del ETL: una segunda corrida no puede duplicar filas
CREATE UNIQUE INDEX address_directory_legacy_id_unique
  ON public.address_directory (legacy_address_id)
  WHERE legacy_address_id IS NOT NULL;

-- Guarda anti-duplicados hacia adelante.
-- Se crea en la PARTE 4, después de validar el dedup del import.
-- REQUIERE que el código haga lookup antes de INSERT (ver PARTE 7).
-- CREATE UNIQUE INDEX address_directory_phone_reference_unique
--   ON public.address_directory
--   (phone, lower(btrim(regexp_replace(reference, '\s+', ' ', 'g'))));

CREATE TRIGGER touch_address_directory
  BEFORE UPDATE ON public.address_directory
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

### Tipos de coordenadas — decisión tomada

`lat` y `lng` son **`double precision`**, no `numeric`. El sensor GPS y Leaflet
producen floats, y `numeric` en coordenadas es precisión falsa: guardar al
centímetro un dato que trae 20 m de incertidumbre.

Consecuencia: v2 convive con dos representaciones, y los casts se escriben a
propósito en vez de descubrirlos en el primer error de tipos.

| cruce                                                  | tipo del otro lado | cast                                                    |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------- |
| `public.point_in_coverage_polygon(p_lat, p_lng)`       | `numeric`          | `point_in_coverage_polygon(lat::numeric, lng::numeric)` |
| `orders.delivery_coordinates_lat/lng`                  | `numeric`          | `::numeric` al escribir el snapshot del pedido          |
| `customer_addresses.coordinates_lat/lng` (libreta B2C) | `numeric`          | `::numeric` en cualquier comparación entre ambas tablas |

No confiar en la conversión implícita: en comparaciones mixtas Postgres promueve
a `double precision`, lo contrario de lo que conviene al validar contra el
polígono de cobertura.

> **Referencia cruzada.** La versión completa, con la regla práctica y los puntos
> exactos donde aplica en la UI, vive en `spec_ui_cajera.md` §PARTE G. Este bloque
> es el resumen para quien implemente la `0122`. **Si divergen, manda la Parte G.**

### 1.2 Punteros y montos en `orders`

```sql
-- Puntero al directorio. FK real con ON DELETE SET NULL.
-- El snapshot manda para mostrar e imprimir; el puntero solo sirve para
-- saber a qué fila escribirle el GPS al entregar.
ALTER TABLE public.orders
  ADD COLUMN address_directory_id uuid
  REFERENCES public.address_directory(id) ON DELETE SET NULL;

CREATE INDEX orders_address_directory_id_idx
  ON public.orders (address_directory_id)
  WHERE address_directory_id IS NOT NULL;

-- Desglose de montos: NO hacen falta columnas nuevas de monto.
-- Verificado contra el remoto: v2 ya separa comida y delivery desde 0002.
--   orders.order_amount  numeric NOT NULL  → solo la comida
--   orders.delivery_fee  numeric NOT NULL  → lo que paga el cliente por el envío
-- Única columna nueva del sprint:
ALTER TABLE public.orders
  ADD COLUMN delivery_fee_source text
    CHECK (delivery_fee_source IN ('business', 'system'));
```

**Nomenclatura — corregido respecto a una versión anterior de este spec.** En el
**legacy**, `orders.delivery_fee` efectivamente no era lo que paga el cliente:
era comisión + recargo, o sea lo que el negocio le debe a Tindivo (el trigger
`20260420010100_triggers.sql:44-56` lo sumaba a `balance_due`).

**En v2 el nombre ya es correcto y no hay nada que renombrar.**
`0002_tables.sql:232-234` lo dice explícito:

```sql
-- Pago (delivery_fee lo setea el backend desde app_settings.delivery_bands según banda)
order_amount decimal(10,2) not null,
delivery_fee decimal(10,2) not null,
```

| columna                  | significado en v2                                              |
| ------------------------ | -------------------------------------------------------------- |
| `order_amount`           | Solo la comida. Lo que tipea la cajera                         |
| `delivery_fee`           | S/2,00 o S/2,50. Lo que paga el cliente por el envío           |
| `delivery_distance_band` | `near`/`far`. La fija el **mismo botón** — llave de la comisión |
| `delivery_fee_source`    | `business` (cajera eligió) \| `system` (default B2C) — **NUEVA** |
| `tindivo_commission`     | Lo que el negocio le debe a Tindivo. Snapshot en el pickup     |
| **total al cliente**     | `order_amount + delivery_fee` (derivado, no se persiste)       |

**Crear `food_amount` / `customer_delivery_fee` duplicaría columnas vivas**, que
es el patrón de deuda documentado en el legacy con `client_phone`/`customer_phone`.

El asiento a `business_charges` es **spec aparte**, y `generate_delivery_charges`
**no se toca**: ya consume lo que `advance_order` escribió.

### 1.3 Seed de `app_settings` — NO HACE FALTA

`app_settings.delivery_bands` ya existe y ya lo consume `advance_order`. Medido
en el remoto `zpnipajgwfthxhdtzhly`:

```json
delivery_bands   → {"near": 2, "far": 2.5}
commissions      → {"near": 3.5, "far": 3.5, "pickup": 1}
prepay_threshold → 80
```

**No crear `delivery_fee_default` ni `delivery_fee_options`**: serían una segunda
fuente de verdad sobre el mismo número, y la primera ya alimenta el ledger.

El principio se mantiene —nunca hardcodear tarifas— y ya está satisfecho: los
botones de la cajera se renderizan desde `delivery_bands`, así que subir `far` a
S/4 es editar un JSON en `app_settings`, sin tocar código.

### 1.4 RLS

Sigue el idioma de `0004_rls.sql`: `current_user_has_role` envuelta en subselect.

```sql
ALTER TABLE public.address_directory ENABLE ROW LEVEL SECURITY;

CREATE POLICY address_directory_select ON public.address_directory
  FOR SELECT USING (
    (select public.current_user_has_role('admin'))
    OR (select public.current_user_has_role('business'))
    OR (select public.current_user_has_role('driver'))
  );

CREATE POLICY address_directory_insert ON public.address_directory
  FOR INSERT WITH CHECK (
    (select public.current_user_has_role('admin'))
    OR (select public.current_user_has_role('driver'))
  );

CREATE POLICY address_directory_update ON public.address_directory
  FOR UPDATE
  USING (
    (select public.current_user_has_role('admin'))
    OR (select public.current_user_has_role('driver'))
  )
  WITH CHECK (
    (select public.current_user_has_role('admin'))
    OR (select public.current_user_has_role('driver'))
  );

-- Sin policy de DELETE: nadie borra direcciones.
```

### 1.5 RPC de lectura (hallazgo 7)

La UI de la cajera **no consulta la tabla directo**. El legacy expone
`customer_addresses` al navegador vía `use-customer-addresses.ts`, lo que además
se salta la deduplicación que sí hacía el endpoint.

```sql
CREATE OR REPLACE FUNCTION public.search_address_directory(p_phone text)
RETURNS TABLE (
  id            uuid,
  phone         text,
  customer_name text,
  reference     text,
  lat           double precision,
  lng           double precision,
  has_gps       boolean,
  is_default    boolean,
  times_used    integer,
  last_used_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER          -- respeta RLS: el rol del llamante decide
SET search_path = public, pg_temp
AS $$
  SELECT
    ad.id, ad.phone, ad.customer_name, ad.reference,
    ad.lat, ad.lng,
    (ad.lat IS NOT NULL) AS has_gps,
    ad.is_default, ad.times_used, ad.last_used_at
  FROM public.address_directory ad
  WHERE ad.phone = p_phone
    AND p_phone ~ '^9\d{8}$'      -- exige teléfono exacto, no prefijo
  ORDER BY ad.is_default DESC, ad.last_used_at DESC NULLS LAST
  LIMIT 10;
$$;
```

**`SECURITY INVOKER` a propósito**, no DEFINER: así RLS sigue aplicando y no hay
que replicar la lógica de permisos dentro de la función.

**Grants.** `0009_function_grants.sql` revoca execute a `anon` y `authenticated`.
Sin declarar el grant en el manifiesto correspondiente, la función queda
inaccesible desde el cliente:

```sql
GRANT EXECUTE ON FUNCTION public.search_address_directory(text) TO authenticated;
```

**No devuelve `accuracy_m`.** La cajera no la necesita y es ruido; `has_gps`
basta para pintar el badge.

**Sobre rate limiting (hallazgo 10).** La v2 lo listaba como necesario. Al exigir
teléfono exacto de 9 dígitos, el espacio de enumeración es de 10⁸ — no es
practicable barrerlo. El riesgo real es bajo y **rate limiting queda como mejora
opcional post-launch**, no como requisito. Lo que sí cierra la superficie es el
RPC, que ya está aquí.

### Verificación Parte 1

```sql
-- 1.1 Columnas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='address_directory'
ORDER BY ordinal_position;

-- 1.2 Constraints (deben aparecer los 6)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='public.address_directory'::regclass;

-- 1.3 RLS activo y policies
SELECT relrowsecurity FROM pg_class WHERE oid='public.address_directory'::regclass;
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename='address_directory';

-- 1.4 Enum con 3 valores
SELECT enumlabel FROM pg_enum
WHERE enumtypid='public.address_source'::regtype ORDER BY enumsortorder;

-- 1.5 Columnas nuevas en orders (deben ser 2: el puntero y el origen de tarifa)
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
  AND column_name IN ('address_directory_id','delivery_fee_source');

-- 1.5-bis Las que YA existían siguen ahí y no se duplicaron (deben ser 3)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='orders'
  AND column_name IN ('order_amount','delivery_fee','delivery_distance_band');

-- 1.6 El RPC existe y es ejecutable por authenticated
SELECT p.proname, p.prosecdef,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS puede_authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='search_address_directory';

-- 1.7 app_settings: las claves de tarifa YA existen, no se siembra nada nuevo.
--     Esperado: delivery_bands {"near":2,"far":2.5} y commissions {near,far,pickup}
SELECT key, value FROM app_settings
WHERE key IN ('delivery_bands','commissions');
```

### 1.8 PRUEBA DE PREDICADOS — obligatoria

Las verificaciones 1.1 a 1.7 comprueban que los constraints **existen**. Solo
esta comprueba que **funcionan**.

> **Precedente, aprendido a la mala:** un CHECK que se lee bien no está
> verificado hasta que rechaza lo que dice rechazar.
>
> Probando la `0122` en local apareció que
> `CHECK (accuracy_m > 0 AND accuracy_m < 1000)` **aceptaba el centinela 999**,
> pese a que el comentario de al lado decía "nunca 999". Las siete
> verificaciones estructurales lo dieron por bueno: el constraint existía y
> tenía el nombre correcto. Solo un `INSERT` con 999 lo delató.

Todo va envuelto en `BEGIN` / `ROLLBACK`: no persiste nada.

```sql
BEGIN;
DO $$
BEGIN
  BEGIN INSERT INTO public.address_directory (phone, reference, source, lat, lng, accuracy_m)
        VALUES ('987654321','Casa','driver_verified',-9.148,-78.280,0);
    RAISE NOTICE 'accuracy_m = 0            -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'accuracy_m = 0            -> rechazado  OK'; END;

  BEGIN INSERT INTO public.address_directory (phone, reference, source, lat, lng, accuracy_m)
        VALUES ('987654321','Casa','driver_verified',-9.148,-78.280,999);
    RAISE NOTICE 'accuracy_m = 999          -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'accuracy_m = 999          -> rechazado  OK'; END;

  BEGIN INSERT INTO public.address_directory (phone, reference, source, lat, lng, accuracy_m)
        VALUES ('987654321','Casa','driver_verified',-9.148,-78.280,999.0000001);
    RAISE NOTICE 'accuracy_m = 999.0000001  -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'accuracy_m = 999.0000001  -> rechazado  OK'; END;

  BEGIN INSERT INTO public.address_directory (phone, reference, source, lat, lng, accuracy_m)
        VALUES ('987654321','Trujillo','driver_verified',-8.09,-79.04,5000);
    RAISE NOTICE 'fix por IP (Trujillo)     -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'fix por IP (Trujillo)     -> rechazado  OK'; END;

  BEGIN INSERT INTO public.address_directory (phone, reference, source, lat)
        VALUES ('987654321','Solo lat','driver_verified',-9.148);
    RAISE NOTICE 'lat sin lng               -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'lat sin lng               -> rechazado  OK'; END;

  BEGIN INSERT INTO public.address_directory (phone, reference, source, imported_at)
        VALUES ('987654321','Sin legacy id','backfill', now());
    RAISE NOTICE 'imported_at sin legacy_id -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'imported_at sin legacy_id -> rechazado  OK'; END;

  BEGIN INSERT INTO public.address_directory (phone, reference, source)
        VALUES ('12345','Telefono malo','driver_verified');
    RAISE NOTICE 'telefono invalido         -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'telefono invalido         -> rechazado  OK'; END;

  BEGIN
    INSERT INTO public.address_directory (phone, reference, source, is_default, legacy_address_id, imported_at)
    VALUES ('987654321','Principal A','backfill', true, gen_random_uuid(), now());
    INSERT INTO public.address_directory (phone, reference, source, is_default, legacy_address_id, imported_at)
    VALUES ('987654321','Principal B','backfill', true, gen_random_uuid(), now());
    RAISE NOTICE 'dos is_default por telefono -> ACEPTADO  <-- MAL';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'dos is_default por telefono -> rechazado  OK'; END;

  BEGIN
    INSERT INTO public.address_directory (phone, reference, source, lat, lng, accuracy_m, legacy_address_id, imported_at)
    VALUES ('987654321','SOLIDEX ALTO - POR KINDER','driver_verified',-9.1481,-78.2803,12, gen_random_uuid(), now());
    RAISE NOTICE 'fila valida del ETL       -> aceptada   OK';
  EXCEPTION WHEN others THEN RAISE NOTICE 'fila valida del ETL       -> RECHAZADA <-- MAL: %', SQLERRM; END;
END $$;
ROLLBACK;
```

**Las nueve líneas deben terminar en `OK`.** Cualquier `<-- MAL` significa que un
constraint no hace lo que su comentario promete: **parar y corregir la migración
antes de seguir**, no anotarlo como deuda.

### 1.9 PRUEBA DE POLICIES — obligatoria, distinta de la 1.8

**La 1.8 corre como `postgres` y salta RLS.** Verifica CHECKs e índices; **no
verifica ni una sola policy**. Quién puede escribir en el directorio es la
decisión de diseño central de la Parte 7, y hasta aquí solo estaba revisada a
ojo.

Matriz esperada:

| rol | SELECT | INSERT | UPDATE |
|---|---|---|---|
| `business` (cajera) | sí | **no** | **no** |
| `driver` | sí | sí | sí |
| `customer` | **no** | no | no |
| `anon` | **no** | no | no |

`current_user_has_role` resuelve por `public.user_roles` contra `auth.uid()`
(`SECURITY DEFINER`), y `auth.uid()` lee `request.jwt.claims ->> 'sub'`. Por eso
la prueba crea usuarios de mentira y simula el JWT, todo dentro de
`BEGIN`/`ROLLBACK`.

```sql
BEGIN;
INSERT INTO public.users (id, email, primary_role) VALUES
  ('11111111-1111-1111-1111-111111111111','t-business@test.local','business'),
  ('22222222-2222-2222-2222-222222222222','t-driver@test.local','driver'),
  ('33333333-3333-3333-3333-333333333333','t-customer@test.local','customer');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111','business'),
  ('22222222-2222-2222-2222-222222222222','driver'),
  ('33333333-3333-3333-3333-333333333333','customer');
INSERT INTO public.address_directory (id, phone, reference, source)
VALUES ('44444444-4444-4444-4444-444444444444','987654321','Fila de prueba','backfill');

DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('business','11111111-1111-1111-1111-111111111111'),
    ('driver',  '22222222-2222-2222-2222-222222222222'),
    ('customer','33333333-3333-3333-3333-333333333333'),
    ('anon',    NULL)
  ) v(rol, uid) LOOP
    IF r.uid IS NULL THEN
      EXECUTE 'set local role anon';
      EXECUTE 'select set_config(''request.jwt.claims'','''',true)';
    ELSE
      EXECUTE 'set local role authenticated';
      EXECUTE format('select set_config(''request.jwt.claims'', %L, true)',
                     json_build_object('sub', r.uid)::text);
    END IF;

    -- SELECT: RLS no lanza error, simplemente no devuelve filas.
    -- `anon` sí lanza 42501 porque ni siquiera puede ejecutar la funcion de rol.
    BEGIN
      EXECUTE 'select count(*) from public.address_directory' INTO n;
      RAISE NOTICE '% SELECT -> % filas visibles', rpad(r.rol,9), n;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '% SELECT -> denegado en la capa de GRANT (%)', rpad(r.rol,9), SQLSTATE;
    END;

    BEGIN
      EXECUTE 'insert into public.address_directory (phone, reference, source)
               values (''999888777'',''X'',''driver_verified'')';
      RAISE NOTICE '% INSERT -> PERMITIDO', rpad(r.rol,9);
    EXCEPTION WHEN others THEN
      RAISE NOTICE '% INSERT -> denegado (%)', rpad(r.rol,9), SQLSTATE;
    END;

    BEGIN
      EXECUTE 'update public.address_directory set customer_name = ''tocado''
               where id = ''44444444-4444-4444-4444-444444444444''';
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN RAISE NOTICE '% UPDATE -> PERMITIDO', rpad(r.rol,9);
      ELSE          RAISE NOTICE '% UPDATE -> denegado (0 filas)', rpad(r.rol,9); END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE '% UPDATE -> denegado (%)', rpad(r.rol,9), SQLSTATE;
    END;

    EXECUTE 'reset role';
  END LOOP;
END $$;
ROLLBACK;
```

**Salida esperada** (verificada en local el 2026-08-04 contra la `0122`):

```
business  SELECT -> 1 filas visibles
business  INSERT -> denegado (42501)
business  UPDATE -> denegado (0 filas)
driver    SELECT -> 1 filas visibles
driver    INSERT -> PERMITIDO
driver    UPDATE -> PERMITIDO
customer  SELECT -> 0 filas visibles
customer  INSERT -> denegado (42501)
customer  UPDATE -> denegado (0 filas)
anon      SELECT -> denegado en la capa de GRANT (42501)
anon      INSERT -> denegado (42501)
anon      UPDATE -> denegado (42501)
```

Tres cosas que conviene entender de esa salida, porque se leen mal:

1. **Una denegación de `SELECT` por RLS no da error: da cero filas.** Si ves
   `customer SELECT -> 3 filas visibles`, la policy está abierta de más.
2. **Lo mismo con `UPDATE`:** RLS lo convierte en cero filas afectadas, sin
   excepción. Por eso la prueba mira `ROW_COUNT` y no el error.
3. **`anon` está bloqueado por partida doble.** No falla en la policy sino antes,
   al no poder ejecutar `current_user_has_role` (`0009_function_grants.sql` le
   revocó el `execute`). Sigue siendo el resultado correcto, pero por otra vía.

**No dar la Parte 1 por cerrada** hasta que esta matriz salga exacta. No bloquea
el `db push` — bloquea declararla terminada.

**No avanzar si** falta un constraint, RLS no está activo, `puede_authenticated`
es false, o el security advisor reporta cualquier ERROR sobre esta tabla.

---

## PARTE 2 — Extracción del legacy

Solo lectura sobre `nwcdxmebsozswnjlblip`.

> **La base destino está VACÍA.** Medido en `zpnipajgwfthxhdtzhly` el 2026-08-04:
> **0 negocios, 0 pedidos, 0 cargos**, 3 usuarios. El esquema está completo; los
> datos no existen.
>
> Dos consecuencias que cambian cómo se corre este ETL:
>
> 1. **Este ETL es el primer dato de esa base.** No hay estado anterior contra el
>    cual contrastar, ni histórico que sirva de control. El conteo esperado de
>    664 filas viene **del legacy**, que es el origen — no de v2.
> 2. **Las verificaciones de las Partes 3 y 4 son la única validación que
>    existe.** No son un trámite de cierre: son el único mecanismo que puede
>    detectar que el ETL salió mal. Si se saltan, nada más lo va a notar.

### 2.1 Directorio

```sql
SELECT address_id, phone, customer_name, reference,
       lat, lng, accuracy_m, source, is_default,
       times_used, last_used_at, created_at, updated_at
FROM public.customer_addresses
ORDER BY phone, address_id;
```

Esperado: **664 filas** sobre **595 teléfonos** (medido 2026-08-04; eran 659 el
día anterior, así que sigue creciendo — usar el conteo del día de la corrida como
referencia, no este).

### 2.2 Primer pedido por teléfono

```sql
SELECT client_phone AS phone, MIN(created_at) AS primer_pedido
FROM public.orders
WHERE client_phone IS NOT NULL
GROUP BY client_phone;
```

> **TRAMPA — PostgREST del legacy trunca a 1000 filas EN SILENCIO.**
> Medido el 2026-08-04 durante la corrida real. El legacy tiene `db-max-rows`
> topado en 1000: un `?limit=5000` **no devuelve error**, devuelve 1000 filas y
> un `206`. La primera pasada de este mismo export 2.2 leyó 1000 de 1606 pedidos
> y produjo un `_stg_first_order` con 571 teléfonos en vez de 748 — y un
> `MIN(created_at)` silenciosamente falso para cualquier teléfono cuyo primer
> pedido cayera en las 606 filas no leídas. Ningún síntoma lo delataba.
>
> **Regla para toda lectura futura del legacy:** pedir primero el conteo real con
> el header `Prefer: count=exact` y leer `Content-Range`; si supera 1000,
> paginar con `&order=<pk>&limit=1000&offset=N` y **verificar que
> `filas_leídas = total` antes de agregar nada**. El export 2.1 (664 filas) nunca
> estuvo en riesgo por estar debajo del tope, pero eso fue suerte del tamaño, no
> del método.

### 2.3 Pre-flight — medir antes de transformar

Si algún número se desvía, **parar y reportar**.

```sql
-- 2.3.a Desglose por source
--   Esperado (medido 2026-08-04): backfill 291 (0 GPS) | driver_verified 271
--   (271 GPS) | admin_curated 102 (102 GPS). Total 664 / 373 con GPS.
SELECT source, COUNT(*), COUNT(lat) AS con_gps
FROM customer_addresses GROUP BY 1;

-- 2.3.b Filas sin reference utilizable  ← BLOQUEANTE, ver R1
SELECT COUNT(*) AS sin_reference,
       COUNT(*) FILTER (WHERE lat IS NOT NULL) AS sin_reference_con_gps
FROM customer_addresses
WHERE reference IS NULL OR btrim(reference) = '';

-- 2.3.c Artefactos de accuracy_m
--   Esperado (medido 2026-08-04): 49 ceros | 20 centinelas (999) | 2 fix por IP
--   (>=1000) | 200 genuinas | 102 GPS sin accuracy.
--   Los cuatro primeros suman 271 = driver_verified: TODO valor de accuracy
--   viene de ahi. Las 102 sin accuracy son las admin_curated.
--   OJO: "genuinas" se mide con `> 0 AND < 999`, asi que NO incluye las 999.
SELECT
  COUNT(*) FILTER (WHERE accuracy_m = 0)                         AS ceros,
  COUNT(*) FILTER (WHERE accuracy_m = 999)                       AS centinelas,
  COUNT(*) FILTER (WHERE accuracy_m >= 1000)                     AS fix_por_ip,
  COUNT(*) FILTER (WHERE accuracy_m > 0 AND accuracy_m < 999)    AS genuinas,
  COUNT(*) FILTER (WHERE lat IS NOT NULL AND accuracy_m IS NULL) AS gps_sin_accuracy
FROM customer_addresses;

-- 2.3.d Coordenadas fuera de la caja destino (esperado: 0)
SELECT COUNT(*) FROM customer_addresses
WHERE lat IS NOT NULL
  AND NOT (lat BETWEEN -9.20 AND -9.10 AND lng BETWEEN -78.33 AND -78.23);

-- 2.3.e Teléfonos que no cumplen el CHECK destino (esperado: 0)
SELECT COUNT(*) FROM customer_addresses WHERE phone !~ '^9\d{8}$';

-- 2.3.f Grupos duplicados
SELECT COUNT(*) AS grupos, SUM(n) - COUNT(*) AS filas_a_colapsar
FROM (
  SELECT phone, lower(btrim(regexp_replace(reference,'\s+',' ','g'))) AS ref_norm,
         COUNT(*) AS n
  FROM customer_addresses
  WHERE reference IS NOT NULL
  GROUP BY 1,2 HAVING COUNT(*) > 1
) t;
```

**No hay filtro de datos de prueba que aplicar.** Verificado: el filtro
`phone LIKE '900%' OR reference ILIKE '%test%|%prueba%'` devuelve 7 filas y las
7 son clientes reales y activos (`900` es prefijo válido de celular peruano).

### 2.4 `cashier_first_fill` — CERRADO, medido el 2026-08-04

`create-order.use-case.ts:111-125` (legacy) hace UPDATE al directorio para
rellenar `reference` cuando estaba vacío, etiquetando el evento con
`metadata.source = 'cashier_first_fill'`.

> **Precisión de nomenclatura, importante para leer el dato.**
> `cashier_first_fill` es el nombre de la **rama de código**, no del actor que la
> ejecutó. Que un evento lleve esa etiqueta no significa que lo haya hecho una
> cajera.

**Medición:** la query devolvió **2 eventos**, y ambos tienen
`action = 'admin_edited'` y `driver_id = NULL`. Fueron ejecutados por un **admin
durante el backfill del 23 de junio**, no por una cajera operando el formulario.

**Conclusión: la policy RLS del legacy sí bloqueaba efectivamente al rol
`restaurant`.** La hipótesis se confirma — ese camino nunca escribió cuando lo
corría una cajera, porque `customer_addresses_update` solo concede a `admin` y
`driver`, y un UPDATE filtrado por RLS afecta cero filas sin lanzar error.

**En v2 la restricción se mantiene y ahora es explícita**, no un efecto lateral
de la RLS: la Parte 7 declara que la cajera no escribe en el directorio, y la
policy `address_directory_update` concede solo a `admin` y `driver`.

No hay nada que decidir: la decisión de diseño coincide con lo que el sistema ya
hacía de facto.

---

## PARTE 3 — Transformación en staging

Cargar a `_stg_address_import` en v2 y transformar ahí. **No insertar todavía.**

### Reglas de limpieza — en este orden

| #      | Condición                                | Acción                                                          | Esperado             |
| ------ | ---------------------------------------- | --------------------------------------------------------------- | -------------------- |
| **R0** | `address_id` en la lista de basura       | `descartada := true`. **Reportar las filas, no omitirlas**      | 4                    |
| **R1** | `reference` NULL o vacío                 | **Decisión diferida — ver nota**                                | 0 (medido en 2.3.b)  |
| **R3** | Coordenada = `SAN_JACINTO_CENTER`        | `lat/lng := NULL`, `accuracy_m := NULL`, `source := 'backfill'` | 18                   |
| **R2** | `accuracy_m = 0`                         | `accuracy_m := NULL`. **Conservar lat/lng**                     | 48                   |
| **R4** | `accuracy_m ≈ 999` en otra coordenada    | `accuracy_m := NULL`. **Conservar lat/lng**                     | 4                    |
| **R5** | `accuracy_m >= 1000`                     | `lat/lng := NULL`, `accuracy_m := NULL`                         | 2                    |
| **R6** | Coordenada fuera de la caja              | `lat/lng := NULL`, `accuracy_m := NULL`                         | 0 (red de seguridad) |

**El orden de la tabla es el orden de ejecución: R3 va ANTES que R2.** No es
cosmético. Una de las 18 filas del pin falso trae `accuracy = 0`; si R2 corre
primero le anula el `accuracy` y le conserva la coordenada, y esa coordenada
falsa queda indistinguible de una medición legítima — R3 ya no la puede
reconocer, porque su discriminante es la coordenada y el rastro que la delataba
era el metadato.

**R0 — filas basura, por `address_id` explícito y nunca por patrón.** Cuatro
pruebas y tecleos que quedaron en el legacy (`E2E Push Test`, `Ejemplo / Av.
Mansiche`, `aslkdaskldlasd`, `mashdkashjd`). Se enumeran una por una porque un
patrón sobre `reference` o `customer_name` puede arrastrar direcciones reales
mal escritas. Ninguna tiene GPS y ninguna comparte teléfono con otra dirección,
así que sus 4 teléfonos salen del directorio: 595 → **591**.

**R1 — RESUELTO, medido el 2026-08-04.** Era la única regla que podía frenar el
ETL, porque el destino tiene `reference NOT NULL` y una fila sin referencia no se
puede insertar ni recuperar después.

```
sin_reference: 0 | sin_reference_con_gps: 0
```

**R1 no descarta ninguna fila.** Toda dirección del legacy tiene referencia
utilizable, así que `reference NOT NULL` en el destino no pierde nada y la
decisión de mantenerlo queda confirmada por dato, no por supuesto.

Consecuencia para la verificación 3.1: **`descartadas_r1` debe dar 0.** Si da
cualquier otra cosa, el export de la Parte 2 no corresponde a lo medido y hay que
volver a extraer antes de seguir.

**R3 vs R4 — CORREGIDA (v4).** Las versiones anteriores decían que el
discriminante era `accuracy = 999` a menos de 50 m de la mediana
`-9.148104, -78.280353`. **Es falso, y por eso se escapaban 2 filas.** El
discriminante real es la **coordenada**: cuando el GPS fallaba, el legacy plantaba
el pin en la constante `SAN_JACINTO_CENTER` = **`-9.146872, -78.279047`**, un
valor exacto y repetido al bit. Se detecta con igualdad, no con distancia:

```sql
ABS(lat - (-9.146872)) < 0.000001 AND ABS(lng - (-78.279047)) < 0.000001
```

Medido en el legacy el 2026-08-04, **18 filas** están en esa coordenada exacta, y
solo 16 traen el 999:

| `accuracy_m` | filas | por qué no bastaba el 999                                    |
| ------------ | ----- | ------------------------------------------------------------- |
| 999          | 16    | el caso que la regla vieja sí cubría                          |
| 0            | 1     | reconfirmación: R2 le anulaba el metadato y salvaba el pin falso |
| NULL         | 1     | `admin_curated` con `times_used = 9` — nunca tuvo metadato    |

Las dos últimas son justo las que la coordenada atrapa y el `accuracy` no. La de
`NULL` es la más peligrosa: nueve entregas hechas contra el centro del pueblo,
sin ningún rastro en el metadato que la delatara.

**R4** conserva su sentido: `accuracy ≈ 999` en una coordenada **distinta** al
centro significa que el motorizado sí arrastró el pin — la coordenada es buena y
solo el metadato es basura. Son 4 filas (las 20 con 999 menos las 16 de R3), y la
regla las aísla sola porque R3 ya les puso `accuracy = NULL` a esas 16.

**R5 usa precisión, no distancia.** `accuracy >= 1000` es fix por IP y se
descarta esté donde esté. Un fix preciso pero lejano no es problema de datos: es
un pedido fuera de zona, decisión de negocio. Verificado: dos pedidos a 11,5 km
tenían `accuracy = 12 m` y eran GPS legítimo.

### Deduplicación (R7)

Agrupar por `(phone, lower(btrim(regexp_replace(reference,'\s+',' ','g'))))`.

**Fila ganadora**, en orden:

1. `lat IS NOT NULL`
2. `last_used_at` más reciente
3. `address_id` menor (determinismo)

**Consolidación del grupo:**

- `times_used` := SUM · `last_used_at` := MAX · `legacy_created_at` := MIN
- `is_default` := TRUE si cualquiera lo tenía
- `customer_name` := el de la ganadora; si es NULL, el primero no-NULL del grupo
- `accuracy_m` := el de la ganadora (después de R2–R6)
- `legacy_address_id` := el `address_id` de la ganadora

### `is_default` — máximo uno por teléfono

Si un teléfono queda con más de una en `is_default`, conservar una con el mismo
desempate y poner el resto en `false`. Si queda sin ninguna, marcar la de
`last_used_at` más reciente.

### Fechas (hallazgo 6 — regla refinada)

| columna             | valor                             |
| ------------------- | --------------------------------- |
| `legacy_created_at` | `created_at` del legacy, tal cual |
| `imported_at`       | `now()` de la corrida             |
| `created_at`        | **regla condicional, abajo**      |
| `last_used_at`      | MAX del grupo                     |
| `updated_by`        | `NULL`                            |

```
SI legacy_created_at es del artefacto del backfill (2026-06-23):
    created_at := COALESCE(primer_pedido_del_teléfono, legacy_created_at)
SINO:
    created_at := legacy_created_at
```

**Por qué condicional.** La v2 aplicaba el primer pedido del teléfono a todas las
direcciones. Eso está bien para las 411 filas del backfill, cuyo `created_at` es
artefacto del ETL legacy. Pero para una **segunda** dirección creada en julio,
usar el primer pedido de mayo la backdatea dos meses y falsea el dato. Fuera del
backfill, el `created_at` del legacy es real y se respeta.

### Verificación Parte 3

```sql
-- 3.1 Conservación de filas
SELECT
  (SELECT COUNT(*) FROM _stg_address_import)                  AS crudas,
  (SELECT COUNT(*) FROM _stg_address_import WHERE descartada) AS descartadas_r1,
  (SELECT COUNT(*) FROM _stg_address_import WHERE colapsada)  AS colapsadas_r7,
  (SELECT COUNT(*) FROM _stg_address_import WHERE ganadora)   AS a_insertar;
-- crudas = descartadas_r1 + colapsadas_r7 + a_insertar
--
-- ESPERADO (medido en el legacy 2026-08-04): colapsadas_r7 ≈ 2.
--   664 filas / 595 teléfonos, y contando referencias distintas salen 662.
--   Solo 2 filas son duplicados reales: los 58 teléfonos con varias direcciones
--   tienen lugares GENUINAMENTE distintos, no repetidos.
-- Si colapsa mucho más que 2, la normalización de `reference` está fusionando
--   direcciones distintas. PARAR y revisar antes de insertar.

-- 3.2 times_used se conserva
SELECT
  (SELECT SUM(times_used)       FROM _stg_address_import WHERE NOT descartada) AS antes,
  (SELECT SUM(times_used_final) FROM _stg_address_import WHERE ganadora)       AS despues;

-- 3.3 Cada regla tocó lo esperado
SELECT regla_aplicada, COUNT(*) FROM _stg_address_import GROUP BY 1 ORDER BY 1;

-- 3.4 Ninguna ganadora viola los constraints destino (debe dar 0)
SELECT COUNT(*) FROM _stg_address_import WHERE ganadora AND (
     phone !~ '^9\d{8}$'
  OR (lat IS NULL) <> (lng IS NULL)
  OR (lat IS NOT NULL AND NOT (lat BETWEEN -9.20 AND -9.10
                           AND lng BETWEEN -78.33 AND -78.23))
  OR (accuracy_m IS NOT NULL AND (accuracy_m <= 0 OR accuracy_m >= 1000))
  OR (accuracy_m IS NOT NULL AND lat IS NULL)
  OR reference IS NULL OR btrim(reference) = ''
  OR imported_at IS NULL OR legacy_address_id IS NULL
);

-- 3.5 Máximo un is_default por teléfono (debe dar 0)
SELECT COUNT(*) FROM (
  SELECT phone FROM _stg_address_import WHERE ganadora AND is_default
  GROUP BY phone HAVING COUNT(*) > 1
) t;

-- 3.6 legacy_address_id único entre ganadoras (debe dar 0)
SELECT COUNT(*) FROM (
  SELECT legacy_address_id FROM _stg_address_import WHERE ganadora
  GROUP BY 1 HAVING COUNT(*) > 1
) t;

-- 3.7 created_at nunca posterior a last_used_at (debe dar 0)
SELECT COUNT(*) FROM _stg_address_import
WHERE ganadora AND last_used_at IS NOT NULL AND created_at > last_used_at;
```

**No avanzar si 3.4, 3.5, 3.6 o 3.7 no dan 0, o si 3.1 no cuadra.**

**3.7 — resultado real de la corrida del 2026-08-04: 199, no 0.** No es una fecha
mal derivada. Las 199 son ganadoras del camino NO-backfill, donde la regla
condicional (hallazgo 6) manda respetar el `created_at` del legacy, y ese
`created_at` cae **entre 0,072 y 0,585 segundos DESPUÉS** de su `last_used_at`.
Ninguna pasa del minuto. Es el legacy escribiendo el pedido y la dirección en la
misma transacción: `last_used_at` toma el timestamp del pedido y la fila de la
dirección se inserta unos milisegundos más tarde. Las 407 del backfill dan 0
inversiones, porque ahí `created_at` sale del primer pedido.

Dicho de otro modo: **3.7 y el hallazgo 6 no pueden dar 0 los dos a la vez.** La
regla vieja (aplanar todas las direcciones al primer pedido del teléfono) hacía
pasar 3.7 justamente porque borraba el `created_at` real que ahora se respeta.

**RESUELTO — se aplasta con `LEAST`.** Decisión tomada el 2026-08-04:
`created_at_final := LEAST(created_at_final, last_used_final)` sobre esas filas.
El ajuste es de milisegundos, operativamente invisible, y deja cierto el
invariante "una dirección no se usó antes de existir" — con lo cual 3.7 vuelve a
servir de compuerta en vez de quedar como excepción permanente que hay que
recordar. El paso va con guarda dura: si afecta un número distinto de 199, el
bloque aborta la transacción y hay que reportar antes de seguir
(`etl-parte3-staging.sql`, sección 5). Corrido: 199 filas, y 3.7 pasó a **0**.

**Observación del dedup, sin cambio de regla.** En el único grupo que colapsó
(teléfono 923642122), la ganadora se quedó con `accuracy_m` NULL mientras una de
las colapsadas traía una medición legítima de 35 m, que se pierde. **No se
cambia:** coordenada y `accuracy_m` son un par, y tomarlos de filas distintas
—una precisión que no corresponde a esa coordenada— es peor que perder el dato.
Queda anotado para que nadie lo "arregle" después sin ver el porqué.

---

## PARTE 4 — Inserción y cierre

1. Insertar solo las filas `ganadora`.
2. Correr las verificaciones.
3. **Solo si todo cuadra**, y **solo después de que el lookup de la Parte 7 esté
   implementado**, crear el índice anti-duplicados:

```sql
CREATE UNIQUE INDEX address_directory_phone_reference_unique
  ON public.address_directory
  (phone, lower(btrim(regexp_replace(reference, '\s+', ' ', 'g'))));
```

4. Borrar `_stg_address_import`.

### Verificación Parte 4

```sql
-- 4.1 Conteo contra el staging
--   Esperado: 658 = 664 crudas − 4 basura (R0) − 2 colapsadas (R7).
--   R1 no descarta ninguna (medido: 0 filas sin reference).
--   MEDIDO 2026-08-04: 658. ✓
SELECT COUNT(*) FROM address_directory;   -- = "a_insertar" de 3.1

-- 4.2 Teléfonos únicos.  Esperado: 591 (595 − los 4 de R0, que no comparten
--   teléfono con ninguna otra dirección).  MEDIDO: 591. ✓
SELECT COUNT(DISTINCT phone) FROM address_directory;

-- 4.3 Cobertura de GPS  ← LA VERIFICACIÓN QUE MÁS DICE
--   Esperado: 351 con GPS de 658 = 53,3%
--     373 con coordenadas en el origen (271 driver_verified + 102 admin_curated)
--     − 18 anuladas por R3 (pin en SAN_JACINTO_CENTER)
--     −  2 anuladas por R5 (fix por IP, accuracy >= 1000)
--     = 353 ANTES del dedup
--     −  2 que se lleva R7: las tres filas del grupo colapsado tenian GPS
--     = 351
--   OJO: la cuenta 373 − 18 − 2 es PRE-dedup. Restar el dedup al final o el
--   numero no cuadra y parece que la limpieza fallo.
--   Si se desvia, PARAR y revisar la limpieza ANTES de crear el indice unico.
--   MEDIDO: 351 / 658 = 53,3%. ✓
SELECT COUNT(*) AS total, COUNT(lat) AS con_gps,
       ROUND(100.0*COUNT(lat)/COUNT(*),1) AS pct
FROM address_directory;

-- 4.3-bis Cobertura de accuracy_m
--   Esperado: 199 = las 200 genuinas menos 1 que se lleva el dedup (la
--   colapsada del grupo traia accuracy 35 y la ganadora no traia ninguna).
--   NO restar las 4 filas de R4: tenian accuracy 999, que nunca estuvo dentro
--   de las 200 genuinas (medidas con `> 0 AND < 999`). Restarlas produce una
--   falsa alarma de ~196.
--   MEDIDO: 199, y las 199 son driver_verified — todo el accuracy del
--   directorio viene de ahi, como en el origen. ✓
SELECT COUNT(*) AS total, COUNT(accuracy_m) AS con_accuracy FROM address_directory;

-- 4.4 Desglose por source
SELECT source, COUNT(*), COUNT(lat) AS con_gps FROM address_directory GROUP BY 1;

-- 4.5 Sin artefactos de accuracy (los tres deben dar 0)
SELECT
  COUNT(*) FILTER (WHERE accuracy_m = 0)     AS ceros,
  COUNT(*) FILTER (WHERE accuracy_m = 999)   AS centinelas,
  COUNT(*) FILTER (WHERE accuracy_m >= 1000) AS fix_ip
FROM address_directory;

-- 4.6 Sin duplicados residuales (debe dar 0)
SELECT COUNT(*) FROM (
  SELECT phone, lower(btrim(regexp_replace(reference,'\s+',' ','g')))
  FROM address_directory GROUP BY 1,2 HAVING COUNT(*) > 1
) t;

-- 4.7 Todas las filas son importadas (debe dar 0 justo después del ETL)
SELECT COUNT(*) FROM address_directory WHERE imported_at IS NULL;

-- 4.8 El RPC devuelve algo para un teléfono conocido
--   OJO: el 2026-08-04 este RPC AÚN NO EXISTE (es de la Parte 7), así que 4.8
--   no se puede correr tal cual al cerrar el ETL. Sustituto equivalente:
--     SELECT * FROM public.address_directory WHERE phone = '923642122'
--      ORDER BY is_default DESC, last_used_at DESC NULLS LAST;
SELECT * FROM public.search_address_directory('923642122');
```

**Hallazgo de 4.8 — casi-duplicados que R7 no ve, y el índice único tampoco.**
El teléfono 923642122 quedó con tres filas, y dos son el mismo lugar escrito
distinto: `RENOVACION CASA DE LALI` y `RENOVACION CASA DE LALI O LILI`. Sus
referencias normalizadas diferen, así que ni el dedup R7 las agrupó ni el
`address_directory_phone_reference_unique` de la Parte 4 las va a rechazar: ese
índice solo ataja el texto **idéntico** salvo espacios y mayúsculas.

**Decisión (2026-08-04): esto NO se arregla con fuzzy automático.** `pg_trgm`
decidiendo solo si dos referencias son la misma casa se equivoca en los dos
sentidos, y **fusionar dos direcciones distintas es peor que tener dos
casi-iguales** — una entrega a la casa equivocada cuesta más que una fila de
sobra en la lista. La solución es de UI: mostrarle al motorizado las direcciones
que ese teléfono YA tiene **antes** de dejarlo escribir una nueva, y que elija
él. Decisión humana, no algorítmica. Desarrollado en
`Docs/10-flujo-motorizados.md §7`.

Consecuencia para la Parte 7: el índice único
`address_directory_phone_reference_unique` **sigue siendo correcto** (ataja el
texto idéntico) y el lookup previo al INSERT también, pero ninguno de los dos
resuelve las casi-duplicadas. Ese es un problema de UI, no de datos, y no hay
que pedirle al índice que lo tape.

---

## PARTE 5 — Validación geográfica

```sql
-- 5.1 Direcciones con GPS FUERA del polígono de cobertura
SELECT id, phone, reference, lat, lng, source
FROM address_directory
WHERE lat IS NOT NULL
  AND NOT public.point_in_coverage_polygon(lat::numeric, lng::numeric)
ORDER BY reference;
```

El polígono es **no convexo**: puede haber direcciones dentro del bounding box
pero fuera del polígono.

**No borrar ni modificar esas filas.** Son direcciones reales a las que se
entregó. Listarlas y revisarlas con Jesús.

### 5.2 Bug latente — migración aparte

`point_in_coverage_polygon` tiene un fallback hardcodeado en
`-9.1547, -78.5042` con radio 15 km. **Esa longitud está ~24 km al oeste de San
Jacinto** (real: -78,28): con radio de 15 km el pueblo entero quedaría fuera de
cobertura y todo pedido se rechazaría.

Hoy no se dispara porque las claves de `app_settings` existen. Corregir el
default a `-9.148104, -78.280353` con radio 3 km.

---

## PARTE 6 — Constantes del mapa (CREACIÓN)

`SAN_JACINTO_CENTER` y `SAN_JACINTO_DEFAULT_ZOOM` **no existen en v2** — hay que
crearlas.

| constante                  | valor                   |
| -------------------------- | ----------------------- |
| `SAN_JACINTO_CENTER`       | `-9.148104, -78.280353` |
| `SAN_JACINTO_DEFAULT_ZOOM` | `15`                    |

Justificación: mediana de las 368 direcciones con GPS; la caja mide 1,97 km N-S
× 1,29 km E-O, y el zoom 15 (≈4,72 m/px) la encuadra en 700 px.

**Son para centrar el mapa cuando NO hay coordenada previa. NO usarlas como
fallback cuando el GPS falla** — ese es el defecto que produjo las 16
direcciones falsas.

---

## PARTE 7 — Reglas de escritura al directorio

| actor                 | INSERT | UPDATE | garantizado por |
| --------------------- | ------ | ------ | --------------- |
| Motorizado (`driver`) | Sí     | Sí     | RLS (rol)       |
| Admin (`admin`)       | Sí     | Sí     | RLS (rol)       |
| Cajera (`business`)   | **No** | **No** | RLS (rol)       |
| Cliente (`customer`)  | No     | No     | RLS (rol)       |

> **La restricción "solo en pedidos `business_manual`" es regla de APLICACIÓN,
> no de base de datos.** La policy solo comprueba el rol; no puede expresar esa
> condición. No leerla como control de seguridad: hay que implementarla y
> testearla en el caso de uso.

### 7.1 FIX obligatorio — el nombre del pedido no se propaga

En el legacy, `mark-delivered.use-case.ts` asigna el nombre del pedido a la fila
del directorio en tres puntos:

| qué                                             | línea         |
| ----------------------------------------------- | ------------- |
| `address.customerName = order.props.clientName` | **85**        |
| `address.customerName = effectiveName`          | **154, 181**  |
| `matchingAddress.customerName = …`              | (ver archivo) |
| `customerAddresses.insert({...})`               | **238**       |

Con `effectiveName = capture.customerName?.trim() || order.props.clientName ||
null`: si el motorizado no tipea nombre, se propaga el de la cajera. La línea 85
es el caso más claro: asigna `order.props.clientName` sin intermediarios.

**Consecuencia:** el nombre que la cajera escribe pisa el directorio global que
ven los otros 3 negocios, sin que ella lo sepa.

**En v2:** el nombre del pedido se queda en el pedido.
`address_directory.customer_name` solo lo modifica el motorizado (desde el modal
de corrección) o el admin.

### 7.2 Lookup por referencia ANTES de INSERT — obligatorio

Con `address_directory_phone_reference_unique` activo, si el motorizado crea una
dirección cuya referencia normaliza igual a una existente del mismo teléfono, el
INSERT viola la unicidad. Y como la captura va en `try/catch` **no bloqueante**,
la entrega procede y **la dirección se pierde en silencio** — el mismo modo de
falla ya documentado en `times_used`.

**El legacy ya resuelve esto** (`mark-delivered.use-case.ts:213-233`): busca
primero una coincidencia por referencia case-insensitive y actualiza en vez de
insertar. **Ese lookup se porta. No es opcional.**

```
1. Normalizar la referencia igual que el índice
2. SELECT ... WHERE phone = ? AND normalizada = ?
3. Si existe  → UPDATE (coordenadas, accuracy, source, updated_by)
4. Si no      → INSERT
```

**Orden de implementación:** el índice único de la Parte 4 **no se crea** hasta
que este lookup esté implementado y testeado. Al revés se rompe en producción.

### 7.3 Creación diferida — se porta el patrón

La dirección de un cliente nuevo **no se crea al crear el pedido**: se crea
cuando el motorizado marca "Entregado", ya con coordenadas
(`mark-delivered.use-case.ts:238`). Por eso la policy puede excluir a `business`
de INSERT sin romper nada.

Consecuencia aceptada: si el pedido no llega a `delivered` (cancelado,
rechazado, cliente ausente), la dirección nunca se crea y el cliente sigue siendo
"nuevo" la próxima vez.

---

## NOTA DE ESCALABILIDAD (hallazgo 12)

Números medidos, para dimensionar sin adivinar:

| métrica                  | valor hoy | proyección a 12 meses                       |
| ------------------------ | --------- | ------------------------------------------- |
| Filas en el directorio   | 659       | ~2.000–2.500                                |
| Clientes nuevos/semana   | ~30–45    | igual o menos (mercado finito: ~5.000 hab.) |
| Direcciones por teléfono | máx. 4    | máx. ~5                                     |
| Pedidos/semana           | ~110      | según crecimiento                           |

**Implicaciones:**

- El índice B-tree sobre `phone` responde en microsegundos a esta escala. No hay
  problema de rendimiento que resolver, ni ahora ni en el horizonte visible.
- El índice único usa una expresión con `regexp_replace`: se computa en cada
  INSERT/UPDATE. A ~45 escrituras por semana, irrelevante.
- **El mercado es finito.** San Jacinto tiene ~5.000 habitantes, así que el
  directorio tiende a un techo natural de unos pocos miles de filas. No se
  necesita particionado, archivado ni caché.
- **La escalabilidad real que importa no es de volumen sino de modelo:** la
  coexistencia con `customer_addresses` cuando entre el B2C (ver arriba). Ese es
  el punto donde un atajo hoy cuesta caro después, no el tamaño de la tabla.

**No optimizar prematuramente.** Cualquier propuesta de PostGIS, caché o
desnormalización debe justificarse con un número medido, no con anticipación.

---

## RIESGOS CONOCIDOS — declarados, no resueltos

Se dejan documentados a propósito. **No implementar nada de esto ahora**; se
decide después del launch.

### R-A · Los montos del pedido son mutables y sin rastro

`[MEDIDO]` — `orders_before_write` es el único trigger BEFORE sobre `orders` (31
líneas) y solo genera `short_id` y sella timestamps de estado. **No valida ni
congela ningún monto.**

Consecuencias:

- `order_amount`, `delivery_fee` y `delivery_distance_band` se pueden modificar
  con un `UPDATE` directo después de creado el pedido. Nada en la DB lo impide.
- **Ese `UPDATE` no deja rastro.** `order_status_history` solo captura cambios de
  `status`; `order_event_log` y `domain_events` solo contienen lo que los RPC
  escriben explícitamente. Un cambio de monto por fuera de un RPC es invisible.
- `advance_order` sobrescribe `delivery_distance_band`, `commission_amount`,
  `delivery_fee_charged` y `tindivo_commission` en cada pickup sin conservar el
  valor anterior.

**Mitigación propuesta (no implementada):** un trigger `BEFORE UPDATE` que, si
cambia alguno de esos campos en un pedido ya `delivered`, o bien lo rechace, o
bien escriba el valor viejo y el nuevo en `order_event_log`. Coste bajo; la razón
de no hacerlo ya es que hoy no hay ningún camino de la aplicación que los
modifique, así que solo cubre error humano con acceso directo a la DB.

### R-B · `balance_due` puede desincronizarse de `business_charges`

`[MEDIDO]` — ambos se escriben en la misma transacción
(`generate_delivery_charges:25-45`, `settle_business_charges:57-64`), así que el
camino feliz es atómico. Las vías de desfase:

1. **Ajuste manual.** Nada impide `UPDATE businesses SET balance_due = …`. Sin
   validación ni registro.
2. **Rama de reversión.** `generate_delivery_charges:48-57` borra los cargos
   `pending` pero descuenta `balance_due` por el monto **completo**. Si algún
   cargo ya estaba `settled`, el agregado baja sin contrapartida. Hoy
   inalcanzable porque `delivered` es terminal — ver `CLAUDE.md` invariante 8.
3. **Cargos con `report_id` en vez de `order_id`.** Si alguna ruta los inserta
   sin tocar `balance_due`, se desfasa en silencio. `NO VERIFICADO`: no audité
   todas las rutas que insertan en `business_charges`.

**Mitigación propuesta:** la query de reconciliación de la auditoría §2.7, como
chequeo periódico. Es barata y detecta las tres vías.

### R-C · REGLA GENERAL — toda escritura al directorio dentro de un `try/catch` necesita ruta de reporte, no solo log

El legacy envuelve la captura de dirección en un `try/catch` no bloqueante
(`mark-delivered.use-case.ts:60-62`, `:89-91`) con la justificación correcta: **la
entrega no debe fallar porque falle un contador.** Ese principio se porta.

Lo que **no** se porta es su consecuencia: hoy el `catch` solo hace
`console.error`. Si algo falla, la entrega procede y la dirección se pierde sin
que nadie se entere.

**Van dos casos identificados donde eso ocurriría, y no son hipotéticos:**

| # | causa | dónde se detectó |
|---|---|---|
| 1 | Choque con el índice único `(phone, reference normalizada)` al crear una dirección cuya referencia normaliza igual que una existente | Parte 4 del ETL; el legacy lo evita buscando primero por referencia (`mark-delivered.use-case.ts:213-233`) |
| 2 | Rechazo del CHECK `address_directory_coords_bbox` en una captura fuera de la caja | Prueba de predicados 1.8; verificado que un GPS legítimo de 12 m a 11,5 km se rechaza |

Que aparezcan dos por vías independientes indica que **el patrón se repite**: cada
constraint nuevo que se añada a la tabla es una forma más de que una dirección
desaparezca en silencio.

**Regla, aplicable a todo el código de v2 que escriba en `address_directory`:**

> Un `catch` que solo loguea es aceptable para un contador. **No lo es para una
> dirección.** Toda escritura al directorio dentro de un `try/catch` debe dejar
> una señal recuperable —`order_event_log` con el `SQLSTATE` y la fila que se
> intentó escribir, o una bandeja de revisión en el admin— para que la dirección
> perdida se pueda reponer después.

No es trabajo de este ETL: es una condición para el código que escriba en la
tabla, y va escrita aquí porque es donde se documentan sus constraints.

### R-D · Sin CHECK de rango sobre los montos

`[MEDIDO]` — `delivery_fee` es `NOT NULL` pero no tiene CHECK. Un 0 o un S/6,00
pasan. Y `generate_delivery_charges:20-22` sale sin asentar nada cuando
`fee + comisión <= 0`: el pedido se entrega y **no genera deuda**.

Hoy no puede ocurrir porque la tarifa es una constante dentro del RPC. **En
cuanto la Parte 0 de `spec_ui_cajera.md` dé libertad de elección, este riesgo se
activa** — por eso esa parte exige validar contra `delivery_bands` en vez de
aceptar valor libre.

---

## FUERA DE ALCANCE

- **Migración de pedidos.** No se portan. El v2 arranca con historial vacío; el
  legacy queda read-only para consultar el histórico.
- **Migración de deuda / `business_charges`.** Spec aparte. Hay 56 pedidos con
  inconsistencias entre banda y fee que resolver antes.
- **`address_capture_events`.** No se porta.
- **Zonas de cobertura con tarifa diferenciada.** Post-launch.
- **El trigger del legacy a `restaurants.balance_due`.** No se porta — v2 ya
  mantiene `businesses.balance_due` desde `generate_delivery_charges:42-45`.
  No confundir: no se porta **el trigger viejo**, no es que el agregado sobre.
- **Rate limiting del RPC.** Opcional post-launch (ver 1.5).

---

## NOTAS PARA EL CÓDIGO DEL V2

1. **`times_used` y `last_used_at` se incrementan al entregar**, no al crear el
   pedido. En el legacy vive dentro de un `try/catch` no bloqueante: si falla, la
   entrega procede y el contador se queda atrás en silencio. Portar ese
   comportamiento — la entrega no debe fallar por un contador.

2. **Corrección por el motorizado:** solo en pedidos con
   `source = 'business_manual'`. Corrige la fila existente, nunca crea una nueva.
   Durante el pedido activo actualiza **también el snapshot del pedido**; después
   de entregado, solo el directorio.

3. **`updated_by` se puebla en cada UPDATE** con el `user_id` del motorizado o
   admin. Es la única forma de rastrear una dirección que quedó mal, dado que no
   hay control de concurrencia (last-write-wins).
