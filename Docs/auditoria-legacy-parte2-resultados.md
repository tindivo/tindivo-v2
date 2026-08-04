# Auditoría parte 2 — RESULTADOS MEDIDOS

Complementa `auditoria-parte2.md` (análisis de código + anexo con L1–L7 completos).
Aquí van los puntos que dependían de la DB, ya ejecutados.

## Fuentes

- **DB:** proyecto Supabase `nwcdxmebsozswnjlblip` (legacy v1), consultada por el
  usuario desde el editor SQL del panel. Yo no ejecuté ninguna query.
  **Cero escrituras.**
- **Código:** `D:\Tinkuy Creativo\Proyectos\Tindivo\Code\tindivo-delivery` @ `ff1e65c`.
- **Restaurantes reales (confirmado por el usuario):** Priamo, La Florencia,
  Al punto, Pollería Nadia. Chipi, Misky Juguería y Donde Paul Y Nardi son
  cuentas de prueba del propio usuario. Solo Chipi tiene `is_test_account = true`;
  las otras dos figuran como `false`.

---

## H1 · DDL de `orders` — [MEDIDO]

64 columnas (posición ordinal 6 ausente → columna eliminada en algún momento).
Confirmado contra el inventario de `types.gen.ts`: coinciden una a una.

Nota: mi conteo inicial de 66 fue error de conteo por líneas
(`delivery_distance_band` ocupa tres por el enum multilínea).

Tipos relevantes: `delivery_lat`/`delivery_lng`/`customer_location_accuracy_m`
son `double precision`; dinero es `numeric(10,2)`; `status`, `source`,
`payment_status`, `delivery_distance_band` son enums; `delivery_coordinates` y
`restaurant_coordinates_cache` son `USER-DEFINED` (PostGIS).
`source` default `'restaurant_pwa'::order_source`.

## H2 · DDL de `customer_addresses` — [MEDIDO]

13 columnas. `lat`, `lng`, `accuracy_m` son **`double precision`** y **nullable**.
`phone` es `text NOT NULL`; `address_id` uuid con `gen_random_uuid()`;
`times_used integer NOT NULL DEFAULT 0`; `source text NOT NULL`.

Comparación contra B2 de la parte 1: **NO REALIZADA** — no dispongo del texto de
la parte 1 en esta sesión.

## H3 · Constraints e índices — [MEDIDO]

**El CHECK de `source`, que era el punto de interés:**
```
CHECK ((source = ANY (ARRAY['driver_verified'::text, 'admin_curated'::text, 'backfill'::text])))
```
Idéntico a la migración `20260623123200`. `[INFERIDO]` de la parte anterior
queda promovido a `[MEDIDO]`. **`'manual'` no existe.**

Otros:
- `customer_addresses_phone_check`: `phone ~ '^9\d{8}$'`
- PK compuesta `(phone, address_id)` + UNIQUE separado sobre `address_id`
  (es el que sostiene la FK desde `orders`)
- `customer_addresses_default_unique`: UNIQUE parcial sobre `(phone) WHERE is_default`
  → máximo una principal por teléfono. Valida la lógica de
  `mark-delivered.use-case.ts:235-236`.
- **NO hay CHECK alguno sobre `lat`, `lng` ni `accuracy_m`.** Nada a nivel de DB
  impide persistir coordenadas basura.
- Índices redundantes: `idx_orders_short_id` (duplica el UNIQUE
  `orders_short_id_key`) y `customer_addresses_phone_idx` (`phone` ya es
  columna líder de la PK).
- No hay índice sobre `orders.client_phone`.

## H4 · Columnas duplicadas — [MEDIDO]

Sobre 1.660 pedidos:

| columna | no nulos |
|---|---|
| `client_phone` | 1.600 |
| `customer_phone` | **4** |
| `delivery_address` | **8** |
| `customer_address` | **4** |
| `delivery_reference` | 1.503 |
| `delivery_lat` | 659 |
| `customer_location_accuracy_m` | **4** |
| `customer_address_id` | 619 |
| `client_phone IS DISTINCT FROM customer_phone` | 1.596 |

**Interpretación:** los 1.596 "difieren" son NULL contra no-NULL, no divergencia
de valor: 1.600 − 4 = 1.596. En los 4 casos donde ambas están pobladas,
coinciden. Esos 4 son exactamente los 4 pedidos `customer_pwa` (ver H7).

**Vivas: `client_phone` y `delivery_reference`.** `customer_phone`,
`customer_address`, `delivery_address` y `customer_location_accuracy_m` están
muertas fuera del flujo del PWA de cliente.

Código: el motorizado lee `delivery_lat` con fallback a la dirección guardada
(`active-order-detail.tsx:687`); el dominio usa `order.clientPhone`
(`mark-delivered.use-case.ts:122,197,214,239`).

## H5 · Tasa de repetición sin sesgo de backfill — [MEDIDO]

956 pedidos en 60 días · 639 de cliente recurrente · **66,8%**.

El 66% que reportaste en la parte 1 **sobrevive** al método que usa el primer
pedido histórico en vez de `customer_addresses.created_at`. Ese número era bueno.

## H6 · `times_used` — [MEDIDO] + [MEDIDO sobre código]

**No es un contador muerto.** 659 direcciones, ninguna en 0, cola larga:

| times_used | n |
|---|---|
| 1 | 410 |
| 2 | 117 |
| 3 | 48 |
| 4 | 32 |
| 5 | 19 |
| 6 | 10 |
| 7 | 7 |
| 8 | 7 |
| 9 | 4 |
| 10, 11, 14, 22, 25 | 1 c/u |

Se incrementa **solo al entregar**, en cinco puntos de
`mark-delivered.use-case.ts` (`:83, :152, :179, :228, :247`), nunca al crear el
pedido. `last_used_at` se actualiza en los mismos puntos. Todo dentro de
`try/catch` no bloqueante (`:60-62`, `:89-91`): si el update falla, la entrega
procede y el contador se queda atrás en silencio.

## H7 · Cómo se determina que un pedido es "manual" — [MEDIDO]

```
restaurant_pwa  1656
customer_pwa       4
```

`order_source` es un enum de exactamente dos valores
(`types.gen.ts:2017`). **No existe `'manual'`** ni ningún otro flag equivalente.
`grep -rn "'manual'"` sobre migraciones, contracts y API: sin coincidencias.

**La premisa de la parte 1 sobre `source='manual'` era falsa en ambas tablas.**

## H8 · Datos de prueba — [MEDIDO]

El filtro propuesto devolvió **7 filas, y ninguna es dato de prueba**: SHEYLA,
JAZMIN, LUIS, YALI, DIANA, JOSELYN, con referencias reales ("COCHARCA, 2DA
ENTRADA", "SAN JOSE BAJO - CALLE LOS CEDROS - DETRAS DEL COLEGIO") y dos usadas
el mismo día de la consulta. `900` es un prefijo válido de celular peruano, que
el CHECK `^9\d{8}$` admite igual que cualquier otro. Cero coincidencias por
`%test%` o `%prueba%`.

**Conclusión: no hay filtro de datos de prueba que aplicar sobre
`customer_addresses`.** Excluir esas 7 habría eliminado clientes activos.

Desglose por `source`:

| source | n | con GPS | del backfill |
|---|---|---|---|
| backfill | 291 | **0** | 291 |
| driver_verified | 266 | 266 | 53 |
| admin_curated | 102 | 102 | 67 |

**Las 291 direcciones de backfill (44% del directorio) no tienen coordenadas.
Ninguna.** Todo el GPS existente son 368 filas entre `driver_verified` y
`admin_curated`.

---

## I1 · Centro y bounding box — [MEDIDO]

| fuente | centro_lat | centro_lng | lat_min | lat_max | lng_min | lng_max | n |
|---|---|---|---|---|---|---|---|
| customer_addresses | -9,1481041 | -78,2803528 | -9,1550132 | -9,1372888 | -78,2853207 | -78,2736013 | 368 |
| orders | -9,1483096 | -78,2803903 | -9,1555301 | **-8,09** | **-79,04** | -78,2736013 | 659 |

Las medianas de ambas fuentes coinciden dentro de ~23 m. La caja de
`customer_addresses` mide **1,97 km (N-S) × 1,29 km (E-O)**.

`orders` contiene coordenadas imposibles (ver I2).

## I2 · Outliers — [MEDIDO]

**En `customer_addresses`: NINGUNO.** La query pedía >5 km del centro; la más
lejana de las 368 está a **1,285 km**. Ordenadas descendente, las 50 primeras
van de 1,285 a 0,566 km. No hay basura geográfica que descartar por lejanía.

**En `orders`: 5 pedidos de 659 (0,76%), y son tres fenómenos distintos** — no
uno. No contaminaron el directorio: viven solo en el snapshot del pedido.

| pedido | coords | accuracy_m | source | km | lectura |
|---|---|---|---|---|---|
| `2PCRHG2G` | -8,09 / -79,04 | **5000** | customer_pwa | 144,28 | fix por IP (~Trujillo) |
| `6R72PPC6` | -9,075 / -78,595 | null | restaurant_pwa | 35,49 | ~Chimbote |
| `KMMH52MX` | -9,075 / -78,595 | null | restaurant_pwa | 35,49 | ídem, misma sesión (+30 min) |
| `WGA2DE22` | -9,0466 / -78,2997 | **12** | customer_pwa | 11,48 | **GPS legítimo, fuera de zona** |
| `HHQVWZCX` | -9,0466 / -78,2997 | **12** | customer_pwa | 11,48 | ídem, misma sesión (+1 h) |

El `accuracy = 5000` del primero es la firma característica de un fix por IP: los
navegadores reportan ese orden de magnitud al resolver por proveedor de red.
**Tercer modo de fallo, distinto del pin en el centro del pueblo.**

Los dos últimos, en cambio, **no son basura**: 12 m es un GPS real de una persona
real a 11,5 km. Ver la corrección del punto 3 en la prioridad de arreglo.

**Señal a vigilar (con salvedad):** de los 4 pedidos `customer_pwa` que existen en
toda la historia (H7), **3 aparecen en esta lista**. Con n=4 no es una conclusión
sino una anécdota, pero el PWA de cliente es un frontend de primera clase en v2 y
es el único canal con evidencia de producir coordenadas fuera del pueblo.
Conviene instrumentarlo desde el día 1.

Observación sobre los 49 ceros de `accuracy_m` (ver J1): en el listado de
outliers aparecen varios en posiciones plausibles, mezclados con vecinos de
precisión 4–24 m. **Sus coordenadas están bien; lo perdido es el metadato.**
No son filas a descartar.

## I3 · Zoom inicial — [ESTIMADO]

Con la caja de 1,97 × 1,29 km y resolución Leaflet
`156543,03 × cos(9,15°) / 2^z ≈ 154.553 / 2^z` m/px:

| zoom | m/px | alto cubierto en 700 px |
|---|---|---|
| 14 | 9,43 | 6,60 km |
| **15** | **4,72** | **3,30 km** ✔ |
| 16 | 2,36 | 1,65 km ✘ (corta el extremo norte) |

**Zoom 15 es correcto**, que es justo el valor de `SAN_JACINTO_DEFAULT_ZOOM`.

`SAN_JACINTO_CENTER` = (-9,146872, -78,279047) está **~200 m al noreste** de la
mediana real (-9,148104, -78,280353). Recentrarlo es gratis.

---

## J1 · Distribución de `accuracy_m` — [MEDIDO]

Los 266 valores no nulos son exactamente los 266 `driver_verified`. Los 102
`admin_curated` tienen GPS con `accuracy_m` NULL (encaja con
`ca_gps_sin_accuracy = 102`).

| rango | n | % del genuino |
|---|---|---|
| ≤10 m | 74 | 37,6% |
| 11–25 m | 64 | 32,5% |
| 26–50 m | 29 | 14,7% |
| 51–100 m | 28 | 14,2% |
| >500 m | 2 | 1,0% |
| **genuinas** | **197** | |
| `0` (artefacto) | 49 | — |
| `999` (centinela) | 20 | — |

**El 26% de las capturas (69 de 266) no son mediciones.**

En `orders`: 655 de los 659 pedidos con coordenadas no tienen accuracy. La señal
vive en `customer_addresses`, no en `orders`.

## J2 · Llamada a la Geolocation API — [MEDIDO sobre código]

`packages/ui/src/patterns/address-capture-modal.tsx:117-145` y `:155-175`.

| | |
|---|---|
| `enableHighAccuracy` | `true` |
| `timeout` | 20.000 ms |
| `maximumAge` | **30.000 ms** (acepta fix cacheado de 30 s) |
| muestras | **una** (`getCurrentPosition`, sin best-of-N) |
| umbral de descarte | **ninguno** al capturar; `accuracy <= 500` solo decide si se guarda la *referencia de texto* (`mark-delivered.use-case.ts:185,200`) |
| reintento | solo manual, botón "Usar mi ubicación actual" |
| visible al motorizado | sí: `Precisión del GPS: ~Xm`, y aviso de arrastrar el pin si >50 m |

## J3 · Comportamiento ante fallo — [MEDIDO] · **DEFECTO CONFIRMADO**

Permiso denegado y timeout caen en el mismo callback (`:131-139`): plantan el pin
en `SAN_JACINTO_CENTER`, ponen `accuracy = null` y dejan "Confirmar" habilitado.
En `:190`, `const finalAccuracy = accuracy ?? 999`.

**Medición:** de las 20 direcciones con `accuracy_m = 999`, **16 están a menos de
50 m del centro de San Jacinto**. Las otras 4 están lejos → ahí el motorizado sí
arrastró el pin (coordenada buena, accuracy basura).

El defecto predicho desde el código queda probado con dato: 16 direcciones son
"el GPS falló y se guardó el centro del pueblo como domicilio", marcadas
`driver_verified` e indistinguibles de una captura real salvo por el 999.

**Segundo defecto, no previsto — `accuracy: 0` hardcodeado.**
`active-order-detail.tsx:681-698`: cuando el pedido ya tiene coordenadas, el
motorizado nunca abre el modal; la app reutiliza las existentes y envía
`accuracy: 0` con `omitted: false`. El caso de uso lo trata como captura real y
ejecuta `address.accuracyM = 0` + `source = 'driver_verified'` (`:176-177`).
El contrato no lo detecta: `accuracy: z.number()` sin default (`dto.ts:250`).

Consecuencia: **una dirección capturada con 12 m genuinos queda en 0 tras la
siguiente entrega.** La columna se degrada sola con el uso. Explica los 49 ceros.

## J4 · Dispositivos — NO ENCONTRADO

No hay registro de user-agent ni tipo de dispositivo. `address_capture_events`
guarda `order_id`, `driver_id`, `phone`, `action`, `accuracy_reported`,
`distance_dragged_m`, `metadata` jsonb — y el código nunca escribe UA en él.

---

## K1 · Volumen por restaurante, 8 semanas — [MEDIDO]

Solo restaurantes reales (827 pedidos):

| | pedidos | % |
|---|---|---|
| Priamo | 552 | **66,7%** |
| Pollería Nadia | 120 | 14,5% |
| La Florencia | 103 | 12,5% |
| Al punto | 52 | 6,3% |

(Descartados: Chipi 67, Misky Juguería 2, Donde Paul Y Nardi 2 — cuentas de
prueba del usuario. Solo Chipi lleva `is_test_account = true`.)

## K2 · Direcciones nuevas post-backfill — [MEDIDO]

245 reales: Priamo 158 (**64,5%**), La Florencia 36, Pollería Nadia 33,
Al punto 18. (Chipi 3, descartada.)

## K3 · Solapamiento de clientes — [MEDIDO] · **la métrica que decide**

90 días, solo restaurantes reales:

- **591 clientes**
- **527 (89,2%) piden en un solo restaurante**
- 64 (10,8%) solapan
- 462 compran en Priamo
- **57 (12,3% de los de Priamo) compran también en otro sitio**

La versión contaminada con las cuentas de prueba daba 14,9%.

**Veredicto: se retira la recomendación de ventana ≤7 días de la parte 1.**
57 clientes en un trimestre no justifican forzar un corte apresurado.

**DECISIÓN POSTERIOR DEL USUARIO: los 4 restaurantes migran de una sola vez.**
Eso deja esta sección sin objeto operativo. Sin periodo escalonado no hay
directorio que se estanque, no hay divergencia asimétrica y no hay que decidir
qué lado manda al fusionar. Los números quedan como contexto del piloto, no como
insumo de decisión.

## K4 · Endpoint de direcciones — [MEDIDO sobre código]

**La UI de la cajera no usa el endpoint.** `use-customer-addresses.ts` va directo
a Supabase desde el navegador, sin `restaurant_id`. Solo RLS la contiene. Efecto
secundario: se salta la deduplicación por referencia del endpoint
(`route.ts:45-71`), así que **la cajera sí ve duplicados** que el endpoint habría
colapsado.

- **Auth:** Bearer JWT → `admin.auth.getUser` → perfil en `users` → `is_active`
  → rol en `['restaurant']` → la ruta exige `restaurantId`. Cliente de datos con
  el JWT del usuario, así que aplica RLS.
- **Rate limiting: NO EXISTE.** `grep -rln "rate.limit|rateLimit|ratelimit"`
  sobre `apps/api`: sin coincidencias.
- **Scoping por restaurante: NO LO HAY.** La query filtra solo por teléfono, y la
  policy RLS es abierta por rol:
  ```sql
  CREATE POLICY customer_addresses_select ON public.customer_addresses
    FOR SELECT USING (
      'admin' = ANY(public.current_user_roles())
      OR 'restaurant' = ANY(public.current_user_roles())
      OR 'driver' = ANY(public.current_user_roles())
    );
  ```
  Cualquier cuenta con rol `restaurant` puede leer el directorio completo de los
  4 restaurantes iterando teléfonos de 9 dígitos, sin límite de tasa.
  `[INFERIDO]` en cuanto a que la policy vigente sea exactamente esa (leída de
  migración, no de `pg_policies`).
- **Escritura:** el archivo solo exporta `GET`. La policy de INSERT/UPDATE
  excluye a `restaurant` (solo `admin` y `driver`). La cajera lee todo pero no
  escribe nada.
- **Latencia:** NO MEDIDA.

---

# Prioridad de arreglo para el port a v2

Ordenada por daño medido, no por intuición:

1. **No persistir el fallback de GPS.** Si `getCurrentPosition` falla, no plantar
   el pin en el centro con "Confirmar" habilitado. Origen de 16 direcciones
   falsas (J3).
2. **No enviar `accuracy: 0`.** En el camino "Caso A", mandar `null` o no tocar
   `accuracy_m`. Deja de destruir precisiones buenas en cada entrega (49 filas
   afectadas).
3. **Descartar coordenadas por IP — por PRECISIÓN, no por distancia.**
   Corrección de una versión anterior de esta lista, que proponía un radio
   máximo de ~5 km. La query 20 demuestra que ese filtro produce falsos
   positivos: de los 5 pedidos fuera de radio, **2 tienen `accuracy = 12 m`**
   (GPS legítimo de un cliente a 11,5 km) y se habrían descartado sin motivo.
   El discriminante correcto es `accuracy >= 1000` ⇒ fix por IP ⇒ descartar,
   esté donde esté. Un fix preciso pero lejano no es un problema de datos sino
   un pedido fuera de zona, que es una decisión de negocio.
4. **CHECK en DB sobre `lat`/`lng`.** Hoy no hay ninguno; nada impide guardar
   basura.
5. **Best-of-N y `maximumAge: 0`.** Solo después de lo anterior. Atacaría las 30
   lecturas >50 m, el 15% del genuino. Ganancia real pero menor: cuando el GPS
   mide de verdad, el 70% ya cae dentro de 25 m.
6. **Rate limiting y scoping** en el endpoint de direcciones (K4).

---

# Puntos no cerrados

- **H2 contra B2** y **H5 contra las queries de D7**: no comparables, no dispongo
  del texto de la parte 1 en esta sesión.
- **K4 latencia:** no medida, requiere credenciales contra la API legacy.
- **J4:** NO ENCONTRADO (sin registro de dispositivo).
- **L6 en la ruta indicada:** NO EXISTE. El write-back ocurre en
  `POST /api/v1/driver/orders/[id]/delivered`.
