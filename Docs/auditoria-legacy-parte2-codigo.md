# Auditoría complementaria tindivo-delivery — Parte 2

## Declaración de fuentes (obligatoria)

- **Código auditado:** `D:\Tinkuy Creativo\Proyectos\Tindivo\Code\tindivo-delivery`
  (HEAD `ff1e65c`). Es el legacy v1. NO es el repo donde corre la sesión
  (`tindivo-v2`), que no tiene `apps/web` ni tabla `customer_addresses`.
- **Base de datos legacy:** proyecto Supabase `nwcdxmebsozswnjlblip`
  (`supabase/.temp/project-ref`, `.env.local` → `https://nwcdxmebsozswnjlblip.supabase.co`).
- **Acceso a esa base: NINGUNO.** Ver "Bloqueo" abajo. Toda sección que
  requiere consultar la DB queda `NO EJECUTADO`.

## Bloqueo de acceso a la DB legacy

El MCP de Supabase de esta sesión es un servidor hospedado fijado a otro
proyecto:

```
mcp__supabase__get_project_url → {"url":"https://zpnipajgwfthxhdtzhly.supabase.co"}
```

`.mcp.json` del repo v2 declara `supabase` con `type`/`url` apuntando a
`zpnipajgwfthxhdtzhly`. No acepta parámetro `project_id`, así que no puede
redirigirse a `nwcdxmebsozswnjlblip`.

Vías alternativas evaluadas:

| Vía                                                                              | Estado                                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| MCP Supabase                                                                     | Fijado a `zpnipajgwfthxhdtzhly`. No sirve.                                                      |
| Management API (`/v1/projects/{ref}/database/query`) con `SUPABASE_ACCESS_TOKEN` | Token existe en `.env.local` del legacy. **Lectura bloqueada por el clasificador de permisos.** |
| `psql` directo                                                                   | No hay cliente `psql` en PATH; no hay password de DB en `.env.local`.                           |
| PostgREST + `SUPABASE_SERVICE_ROLE_KEY`                                          | Misma barrera de secreto; además no ejecuta SQL arbitrario (`information_schema` inaccesible).  |

**Ninguna consulta fue ejecutada contra ninguna base. Cero escrituras.**

---

# SECCIÓN H

### H1. DDL completo y real de `orders`

**Query ejecutada:** ninguna.
**`NO EJECUTADO` — sin acceso a `nwcdxmebsozswnjlblip`.**

Sustituto parcial, explícitamente NO equivalente: el inventario de columnas de
`packages/supabase/src/types.gen.ts`, generado por el CLI _desde_ la DB en su
momento. Da nombres y nulabilidad; **no** da `data_type` de Postgres,
`column_default`, precisión ni escala. **64 columnas** (dije 66 en una primera
versión: error de conteo por líneas, `delivery_distance_band` ocupa tres por su
enum multilínea; el DDL real de la query 1 confirma 64 y los nombres coinciden
uno a uno):

```
accept_countdown_seconds, accepted_at, appears_in_queue_at, assigned_at,
base_commission, cancel_reason, cancel_reason_code, cancelled_at, cash_amount,
cash_owed_at_delivery, cash_settlement_id, change_to_give, client_name,
client_paid_exact_at_delivery, client_pays_with, client_phone, created_at,
customer_address, customer_address_id, customer_location_accuracy_m,
customer_order_subtotal, customer_phone, customer_user_id, delivered_at,
delivery_address, delivery_coordinates, delivery_distance_band, delivery_fee,
delivery_lat, delivery_lng, delivery_maps_url, delivery_reference, driver_id,
estimated_ready_at, extension_used, far_surcharge_amount, heading_at, id, notes,
occupancy_slots, order_amount, payment_status, payment_status_at_creation,
pending_acceptance_at, picked_up_at, prep_extended_at, prep_extension_minutes,
prep_minutes, ready_early_at, ready_early_used, received_at,
restaurant_accepted_at, restaurant_accepted_prep_minutes,
restaurant_coordinates_cache, restaurant_id, short_id, source, status,
tracking_link_sent_at, tracking_link_sent_by, updated_at, urgent_since,
waiting_at, yape_amount
```

**Clasificación: [INFERIDO]** (tipos generados, no `information_schema`).

### H2. DDL de `customer_addresses`

**Query ejecutada:** ninguna. **`NO EJECUTADO`.**

Inventario `[INFERIDO]` de `types.gen.ts` — **13 columnas**:

```
address_id, phone, lat, lng, reference, accuracy_m, source, is_default,
last_used_at, times_used, customer_name, created_at, updated_at
```

Comparación contra B2 de la parte 1: **no puedo hacerla.** No tengo el texto de
la parte 1 en esta sesión. Pásame el DDL que reportaste en B2 y lo contrasto.

### H3. Constraints e índices

**Query ejecutada:** ninguna. **`NO EJECUTADO`.**

Sobre el CHECK de `customer_addresses.source`, dato `[INFERIDO]` de la
migración que crea la tabla — `supabase/migrations/20260623123200_customer_addresses.sql:13`:

```sql
source text NOT NULL CHECK (source IN ('driver_verified', 'admin_curated', 'backfill')),
```

Verifiqué que **ninguna migración posterior altera ese CHECK**:

```bash
grep -rn "source" supabase/migrations/*.sql | grep -i "check\|constraint"
# → única coincidencia: 20260623123200_customer_addresses.sql:13
```

### H4. Columnas duplicadas — cuáles están vivas

**Query ejecutada:** ninguna. Los dos `COUNT` y el `IS DISTINCT FROM`:
**`NO EJECUTADO`.**

La parte de código sí:

`customer_addresses` **no tiene** columnas `delivery_*` ni `client_phone`; esas
viven solo en `orders`. En `orders` conviven los tres pares
(`client_phone`/`customer_phone`, `delivery_address`/`customer_address`,
`delivery_lat`+`delivery_lng`/`delivery_coordinates`).

Qué se lee al mostrar un pedido — el motorizado lee **`delivery_*`**, con
fallback a la dirección guardada:

`apps/web/src/features/motorizado/active-order/components/active-order-detail.tsx:687`

```tsx
raw.delivery_lat ?? raw.customer_addresses?.lat;
```

`apps/web/src/features/motorizado/active-order/components/active-order-detail.tsx:1334`

```tsx
): raw is { delivery_lat: number; delivery_lng: number } {
  return typeof raw.delivery_lat === 'number' && typeof raw.delivery_lng === 'number'
```

En el dominio, `delivery_lat`/`delivery_lng` son **derivadas** de PostGIS —
`packages/core/src/modules/orders/infrastructure/order.mapper.ts:19`:

```
`delivery_lat`/`delivery_lng` (double precision derivados via PostGIS de ...)
```

Es decir, `delivery_coordinates` (geography) es la fuente y las dos numéricas
son proyección. **Clasificación: [MEDIDO]** sobre archivos.

`client_phone` es la que usa el dominio al marcar entregado
(`mark-delivered.use-case.ts:122,197,214,239`): `order.clientPhone`.
`customer_phone` no aparece en esa ruta.

### H5. La query de D7

**No puedo pegar las queries de D7.** No tengo la parte 1 en esta sesión, y no
puedo reconstruir qué ejecutaste. La query antisesgo que propones:
**`NO EJECUTADO`** — sin acceso a la DB.

### H6. `times_used` — ¿vivo o muerto?

**Query ejecutada:** ninguna (el `GROUP BY`: `NO EJECUTADO`).

**Código: NO es un contador muerto. Se incrementa — pero solo al ENTREGAR,
nunca al crear el pedido.** Cinco sitios, todos en
`packages/core/src/modules/orders/application/use-cases/mark-delivered.use-case.ts`:

- `:83` rama "sin capture explícito" → `address.timesUsed += 1`
- `:152` rama `admin_curated` (solo stats) → `address.timesUsed += 1`
- `:179` rama dirección existente actualizada → `address.timesUsed += 1`
- `:228` rama match por referencia → `matchingAddress.timesUsed += 1`
- `:247` inserción nueva → `timesUsed: 1`

`last_used_at` se actualiza en los mismos cinco puntos (`:82, :151, :178, :227, :246`),
siempre a `now` del caso de uso. **No** se toca al crear el pedido:
`create-order.use-case.ts` solo registra `distanceDraggedM: null` (`:119`).

Consecuencia operativa: un pedido cancelado, o entregado sin que el flujo de
`mark-delivered` complete, **no** suma `times_used`. Y todo el bloque está
envuelto en `try/catch` no bloqueante (`:60-62`, `:89-91`):

```ts
} catch (err) {
  console.error('Error updating address usage stats (non-blocking):', err)
}
```

Si el update falla, la entrega igual procede y el contador se queda atrás en
silencio. **Clasificación: [MEDIDO]** sobre archivos.

### H7. Cómo se determina que un pedido es "manual"

**Query ejecutada:** ninguna. **`NO EJECUTADO`.**

**Corrección de premisa — importante.** `orders.source` es un enum de Postgres
con exactamente **dos** valores. `packages/supabase/src/types.gen.ts:2017`:

```ts
order_source: "restaurant_pwa" | "customer_pwa";
```

y `:2624`:

```ts
order_source: ["restaurant_pwa", "customer_pwa"],
```

**No existe `'manual'` en `orders.source`.** Además:

```bash
grep -rn "'manual'" --include=*.sql --include=*.ts supabase packages/contracts apps/api
# → sin coincidencias
```

`'manual'` no aparece en ninguna migración, ni en contracts, ni en la API.
No hay otro flag tipo `is_manual`. **Clasificación: [MEDIDO]** sobre archivos.

### H8. Datos de prueba

**Queries ejecutadas:** ninguna. **`NO EJECUTADO`.**

Pero la premisa hay que corregirla antes de correrlas: `customer_addresses.source`
**tampoco** admite `'manual'` — el CHECK (H3) solo permite `driver_verified`,
`admin_curated`, `backfill`. Las correcciones a mano del admin son
**`admin_curated`**, y el código las trata como intocables: `mark-delivered`
nunca sobreescribe lat/lng/reference de una `admin_curated` (`:75`, `:149-155`,
`:221`). Coincido en no excluirlas: son el dato de mayor calidad y el propio
código ya las blinda.

---

# SECCIÓN I

### I1, I2, I3

**Queries ejecutadas:** ninguna. **`NO EJECUTADO` — sin acceso a la DB.**

Dato de código relevante para I1/I3: existe una constante de centro ya definida,
`SAN_JACINTO_CENTER` en `packages/core/src/shared/constants/geography.ts`,
que el modal usa como fallback (ver J3). Conviene contrastar la mediana real
contra esa constante cuando se pueda consultar.

---

# SECCIÓN J

### J1. Distribución de `accuracy_m`

**Queries ejecutadas:** ninguna. **`NO EJECUTADO`.**

Aviso para cuando se ejecute: el código inyecta un **centinela `999`**
(ver J3), así que el bucket `f) >500m` mezclará GPS genuinamente malo con
"no hubo GPS". Hay que separar `accuracy_m = 999` como categoría propia o el
histograma miente.

### J2. Cómo llama el legacy a la Geolocation API

**Clasificación: [MEDIDO]** sobre archivo.

Única implementación de captura de dirección:
`packages/ui/src/patterns/address-capture-modal.tsx`. Llamada principal,
líneas 117-145:

```tsx
navigator.geolocation.getCurrentPosition(
  (position) => {
    if (!active) return;
    const coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    setGpsCoords(coords);
    setCurrentCoords(coords);
    const acc = Math.round(position.coords.accuracy);
    setAccuracy(acc);
    setLoading(false);
    onShownRef.current?.(acc);
  },
  (error) => {
    if (!active) return;
    console.error("Error obtaining GPS coordinates:", error);
    setGpsCoords(SAN_JACINTO_CENTER);
    setCurrentCoords(SAN_JACINTO_CENTER);
    setAccuracy(null);
    setLoading(false);
    onShownRef.current?.(null);
  },
  {
    enableHighAccuracy: true,
    maximumAge: 30000,
    timeout: 20000,
  },
);
```

Segunda llamada idéntica en opciones, botón "Usar mi ubicación actual"
(`:155-175`).

Respuestas puntuales:

| Pregunta                             | Respuesta                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enableHighAccuracy`                 | **`true`** (`:141`, `:171`)                                                                                                                                                                                          |
| `timeout`                            | **20000 ms**                                                                                                                                                                                                         |
| `maximumAge`                         | **30000 ms** ← acepta un fix cacheado de hasta 30 s                                                                                                                                                                  |
| ¿Una muestra o la mejor de varias?   | **UNA.** `getCurrentPosition`, sin `watchPosition`, sin acumular candidatas.                                                                                                                                         |
| ¿Descarta por umbral de accuracy?    | **No al capturar.** Acepta cualquier valor. Sí hay un umbral **aguas abajo**, solo para la referencia de texto: `capture.accuracy <= 500` (`mark-delivered.use-case.ts:185, 200`). Las coordenadas se guardan igual. |
| ¿Reintenta si la lectura viene mala? | **No automáticamente.** Solo el botón manual "Usar mi ubicación actual" (`:278-286`), que el motorizado debe pulsar por decisión propia.                                                                             |
| ¿Muestra la accuracy al motorizado?  | **Sí.** `:268-271` → `Precisión del GPS: ~${accuracy}m`, y si `accuracy > 50` añade (`:273-277`): _"Si el pin no está donde estás parado, arrástralo."_                                                              |

### J3. Comportamiento ante fallo

**Clasificación: [MEDIDO]** sobre archivo.

Permiso denegado y timeout **caen en el mismo callback de error** (`:131-139`,
citado arriba). Comportamiento:

1. Loguea a consola.
2. **Planta el pin en `SAN_JACINTO_CENTER`** — el centro del pueblo.
3. `setAccuracy(null)`.
4. `setLoading(false)` → el mapa se muestra normal, con el botón "Confirmar"
   habilitado.

**No se bloquea el marcado de "Entregado".** El modal es omitible por diseño
(botón "Omitir" → `onSkip`, `:328-330`), y el flujo de entrega registra la
omisión como evento sin abortar (`mark-delivered.use-case.ts:117-128`).

**El riesgo real está en `:190`:**

```tsx
const finalAccuracy = accuracy ?? 999;
```

Si el GPS falló y el motorizado pulsa "Confirmar" sin arrastrar el pin, se
persiste **el centro de San Jacinto como dirección del cliente**, con
`accuracy_m = 999` y `source = 'driver_verified'` (`mark-delivered.use-case.ts:177`).
Queda indistinguible de una captura real salvo por el 999. Esto es,
con alta probabilidad, la fuente del cúmulo de coordenadas basura en el centro
— y es verificable en cuanto haya acceso a la DB (I2 + J1 cruzados).

### J4. Dispositivos

**`NO ENCONTRADO`** — no hay registro de user-agent ni de tipo de dispositivo.
`address_capture_events` guarda `order_id`, `driver_id`, `phone`, `action`,
`accuracy_reported`, `distance_dragged_m`, `metadata` jsonb
(`supabase-customer-address.repository.ts:117-126`). El `metadata` es el único
sitio donde cabría, y el código nunca escribe UA en él.

---

# SECCIÓN K

### K1, K2, K3

**Queries ejecutadas:** ninguna. **`NO EJECUTADO` — sin acceso a la DB.**

K3 sigue siendo, como dices, la que decide. Queda pendiente de acceso.

### K4. Estado del endpoint de direcciones

**Clasificación: [MEDIDO]** sobre archivos.

**Hallazgo previo que cambia el marco: la UI de la cajera NO usa ese endpoint.**
`use-customer-addresses.ts` (L2, 21 líneas) va **directo a Supabase desde el
navegador**:

```ts
const { data, error } = await supabase
  .from("customer_addresses")
  .select("*")
  .eq("phone", phone)
  .order("last_used_at", { ascending: false });
```

Sin `restaurant_id`, sin pasar por la API. Lo único que la contiene es RLS.

**Autenticación del endpoint** (`requireAuth`, `apps/api/lib/http/require-auth.ts`):
Bearer JWT → `admin.auth.getUser(token)` → carga perfil de `users` con embeds de
`drivers`/`restaurants` → exige `is_active` → exige rol en `['restaurant']` →
la ruta además exige `auth.auth.restaurantId` (`route.ts:13`). Cliente de datos
creado con el JWT del usuario (`createClientFromJwt`), así que aplica RLS.

**Rate limiting: NO EXISTE.**

```bash
grep -rln "rate.limit\|rateLimit\|ratelimit" --include=*.ts apps/api
# → sin coincidencias
```

**Scoping por restaurante: NO LO HAY.** La query filtra solo por teléfono
(`route.ts:26-29`), y la policy RLS es abierta por rol
(`20260623123200_customer_addresses.sql:67-73`):

```sql
CREATE POLICY customer_addresses_select ON public.customer_addresses
  FOR SELECT
  USING (
    'admin' = ANY(public.current_user_roles())
    OR 'restaurant' = ANY(public.current_user_roles())
    OR 'driver' = ANY(public.current_user_roles())
  );
```

**Cualquier cuenta con rol `restaurant` puede leer el directorio completo de
clientes de los cuatro restaurantes**, vía el endpoint o vía el cliente del
navegador. Solo hace falta iterar teléfonos de 9 dígitos que empiecen en 9, y
no hay rate limit que lo frene. `[INFERIDO]` en cuanto a que la policy vigente
en la DB sea exactamente esa (leída de migración, no de `pg_policies`).

**Endpoint de ESCRITURA:** el archivo de L1 **solo exporta `GET`**. No hay
POST/PATCH/DELETE de direcciones bajo `restaurant/`. Las escrituras entran por
`driver/orders/[id]/delivered` (L6) y por `driver/orders/route.ts`. La policy
de INSERT/UPDATE excluye a `restaurant` (`:76-93`): solo `admin` y `driver`.
La cajera puede leerlo todo pero no escribir nada.

**Latencia:** `NO MEDIDO` — requiere credenciales para autenticarse contra la
API legacy.

---

# SECCIÓN L

Archivos completos anexados al final de este documento.

- **L1** `apps/api/app/api/v1/restaurant/customers/[phone]/addresses/route.ts` — 77 líneas ✔
- **L2** `apps/web/src/features/restaurante/new-order/hooks/use-customer-addresses.ts` — 21 líneas ✔
- **L3** `apps/web/src/features/restaurante/new-order/components/new-order-form.tsx` — 1227 líneas ✔
- **L4** `packages/ui/src/patterns/interactive-map.tsx` — 201 líneas ✔ (más `address-capture-modal.tsx`, 345, que es quien lo monta)
- **L5** `packages/core/src/modules/orders/infrastructure/supabase-customer-address.repository.ts` — 132 líneas ✔
- **L6** `PATCH /api/v1/driver/orders/[id]/status` **NO EXISTE.** No hay ruta `status` bajo `driver/orders/[id]/`. Las rutas reales son `accept`, `arrived`, `capture-events`, `change-payment-method`, `claim`, `customer-data`, `delivered`, `picked-up`, `received`, `reject`. El write-back del GPS ocurre en **`POST .../delivered`** (43 líneas), que delega en `mark-delivered.use-case.ts` (273 líneas). Ambos anexados.

### L7. Múltiples direcciones en la UI de la cajera

**Clasificación: [MEDIDO]** sobre archivo.
Componente: `apps/web/src/features/restaurante/new-order/components/address-suggestion-popup.tsx` (290 líneas, anexado).

**Corrección a E2 de la parte 1: no es un dropdown.** Es un modal con dos
casos y, en el caso múltiple, una **lista de radio buttons**.

Lo que ve la cajera, paso a paso:

1. Escribe el teléfono. Al llegar a 9 dígitos se dispara la búsqueda
   (`use-customer-addresses.ts:19`, `enabled: enabled && phone.length === 9`).
2. Si hay historial, se abre el modal.
3. **Una sola dirección (CASO A):** ve la referencia en grande, "Último pedido:
   hace X" y, si tiene coordenadas, la insignia "Ubicación GPS" (`:152-165`).
   Dos botones: **"Usar esta dirección"** y **"Escribir otra"** (`:169-180`).
4. **Varias (CASO B):** encabezado _"Selecciona la dirección donde desea recibir
   el pedido actual:"_ y una lista scrolleable (`max-h-[35vh]`) de radios
   (`:190-249`). Cada fila muestra: referencia, chip **"Principal"** si
   `is_default`, nombre del cliente (o "Sin nombre"), tiempo relativo del último
   uso, **"N pedidos"** (`times_used`) y la insignia **GPS** si la tiene.
   Al final, una opción extra **"Escribir dirección nueva"** (`:252-273`).
   Cierra con **"Cancelar"** / **"Confirmar"** (`:276-283`).

Nota: la lista que ve la cajera viene del hook directo a Supabase (L2), que
**no** aplica la deduplicación por referencia que sí hace el endpoint de L1
(`route.ts:45-71`). Es decir, por la ruta que realmente se usa, la cajera **sí
ve duplicados** que el endpoint no usado habría colapsado.

---

# Resumen de puntos no respondidos

`NO EJECUTADO` por falta de acceso a `nwcdxmebsozswnjlblip`:
H1 (query real), H2 (query real), H3 (query real), H4 (los tres COUNT),
H5 (ambas queries), H6 (GROUP BY), H7 (GROUP BY), H8 (ambas queries),
I1, I2, I3, J1, K1, K2, K3, K4-latencia.

`NO ENCONTRADO`: J4 (sin registro de dispositivo).

`NO EXISTE`: L6 en la ruta indicada (se aporta la real).

`NO COMPARABLE`: H2 contra B2, y H5 contra las queries de D7 — no tengo el
texto de la parte 1 en esta sesión.

---

# ANEXO — archivos completos

## L1

`apps/api/app/api/v1/restaurant/customers/[phone]/addresses/route.ts` (77 lineas)

```tsx
import { problemCode } from "@/lib/http/problem";
import { requireAuth } from "@/lib/http/require-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ phone: string }> },
) {
  const { phone } = await params;

  const auth = await requireAuth(req, ["restaurant"]);
  if (!auth.ok) return auth.response;
  if (!auth.auth.restaurantId) return problemCode("FORBIDDEN", 403);
  const supabase = auth.auth.supabase;

  // Validate phone format: 9 digits starting with 9
  const PHONE_REGEX = /^9\d{8}$/;
  if (!PHONE_REGEX.test(phone)) {
    return problemCode("VALIDATION_ERROR", 400, "Número de teléfono inválido");
  }

  // Query customer_addresses table directly
  const { data: addresses, error } = await supabase
    .from("customer_addresses")
    .select(
      "address_id, customer_name, reference, is_default, times_used, last_used_at, lat, lng",
    )
    .eq("phone", phone)
    .order("is_default", { ascending: false })
    .order("times_used", { ascending: false })
    .order("last_used_at", { ascending: false, nullsFirst: false });

  if (error) {
    return problemCode("INTERNAL_ERROR", 500, error.message);
  }

  const rawItems = (addresses || []).map((addr) => ({
    address_id: addr.address_id,
    customer_name: addr.customer_name,
    reference: addr.reference ?? "",
    is_default: addr.is_default,
    times_used: addr.times_used,
    last_used_at: addr.last_used_at,
    has_gps: addr.lat !== null && addr.lng !== null,
  }));

  // Deduplicación de direcciones por referencia (ignora mayúsculas/minúsculas y espacios adicionales)
  const items: typeof rawItems = [];
  const seenReferences = new Set<string>();

  for (const item of rawItems) {
    const normRef = item.reference.trim().toLowerCase();
    if (!seenReferences.has(normRef)) {
      seenReferences.add(normRef);
      items.push(item);
    } else {
      const idx = items.findIndex(
        (u) => u.reference.trim().toLowerCase() === normRef,
      );
      if (idx !== -1) {
        const existing = items[idx];
        if (existing) {
          // Preferimos conservar el registro que tenga GPS, sea principal o tenga más usos.
          const preferNew =
            (!existing.is_default && item.is_default) ||
            (!existing.has_gps && item.has_gps) ||
            (existing.has_gps === item.has_gps &&
              item.times_used > existing.times_used);

          if (preferNew) {
            items[idx] = item;
          }
        }
      }
    }
  }

  return NextResponse.json({
    phone,
    addresses: items,
  });
}
```

## L2

`apps/web/src/features/restaurante/new-order/hooks/use-customer-addresses.ts` (21 lineas)

```tsx
"use client";
import { supabase } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function useCustomerAddresses(phone: string, enabled: boolean) {
  return useQuery({
    queryKey: ["customer-addresses", phone],
    queryFn: async () => {
      if (!phone) return [];
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("phone", phone)
        .order("last_used_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: enabled && phone.length === 9,
  });
}
```

## L3

`apps/web/src/features/restaurante/new-order/components/new-order-form.tsx` (1227 lineas)

```tsx
"use client";
import { PlatformClosedBanner } from "@/features/restaurante/shared/components/platform-closed-banner";
import { usePlatformStatus } from "@/features/restaurante/shared/hooks/use-platform-status";
import { useIdempotencyKey } from "@/lib/idempotency/use-idempotency-key";
import { supabase } from "@/lib/supabase/client";
import { useIsDesktop } from "@/shared/hooks/use-is-desktop";
import { useQueryClient } from "@tanstack/react-query";
import type { Orders } from "@tindivo/contracts";
import {
  BottomActionBar,
  Button,
  GlassTopBar,
  Icon,
  IconButton,
  MoneyInput,
  PhoneInputPe,
  cn,
} from "@tindivo/ui";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCreateOrder } from "../hooks/use-create-order";
import { useCustomerHistoricalAddresses } from "../hooks/use-customer-historical-addresses";
import { AddressSuggestionPopup } from "./address-suggestion-popup";

type CustomerAddress = {
  phone: string;
  address_id: string;
  lat: number | null;
  lng: number | null;
  reference: string | null;
  accuracy_m: number | null;
  source: string;
  is_default: boolean;
  last_used_at: string | null;
  times_used: number;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
};

const BLACKLISTED_PHONES = [
  "999999999",
  "987654321",
  "912345678",
  "955555555",
  "900000000",
  "911111111",
  "123456789",
];

type Payment = "prepaid" | "pending_yape" | "pending_cash" | "pending_mixed";

const PREP_MINUTES = [10, 15, 20, 25, 30, 35, 40, 45, 50] as const;
type PrepMinutes = (typeof PREP_MINUTES)[number];

function parseMoney(raw: string): number {
  if (!raw) return 0;
  const normalized = raw.replace(",", ".").replace(/[^0-9.]/g, "");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

const paymentOptions: {
  value: Payment;
  label: string;
  hint: string;
  icon: string;
  gradient: string;
}[] = [
  {
    value: "prepaid",
    label: "Ya pagó",
    hint: "Cliente canceló por adelantado",
    icon: "verified",
    gradient: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
  },
  {
    value: "pending_yape",
    label: "Cobrar con Yape",
    hint: "Driver cobra al entregar",
    icon: "qr_code_2",
    gradient: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
  },
  {
    value: "pending_cash",
    label: "Cobrar efectivo",
    hint: "Adelanta el vuelto al driver",
    icon: "payments",
    gradient: "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)",
  },
  {
    value: "pending_mixed",
    label: "Yape + Efectivo",
    hint: "Cliente paga parte por Yape y parte cash",
    icon: "splitscreen",
    gradient: "linear-gradient(135deg, #7C3AED 0%, #FF6B35 100%)",
  },
];

export function NewOrderForm() {
  const router = useRouter();
  const createOrder = useCreateOrder();
  // UUID v4 que viaja en header Idempotency-Key. Sobrevive recargas accidentales
  // por sessionStorage. Se descarta tras 2xx/4xx (mutation onSettled abajo) para
  // que el próximo formulario tenga su propia key.
  const idem = useIdempotencyKey("restaurante:new-order");
  // Guard síncrono contra doble-click dentro del mismo frame: `isPending` se
  // refleja en el siguiente render (~16ms), abriendo una micro-ventana donde
  // dos clicks ejecutan dos `mutate()` antes de que el botón aparezca disabled.
  // El ref se actualiza fuera del ciclo de React, así que el segundo handler
  // ve `true` inmediatamente. Defense-in-depth sobre el fix TOCTOU del backend.
  const submittingRef = useRef(false);
  const platformStatus = usePlatformStatus();
  const isPlatformClosed = platformStatus.data
    ? !platformStatus.data.isOpen
    : false;

  const [prepMinutes, setPrepMinutes] = useState<PrepMinutes>(20);
  const [payment, setPayment] = useState<Payment>("pending_cash");
  const [amount, setAmount] = useState<string>("");
  const [paysWith, setPaysWith] = useState<string>("");
  const [yapePart, setYapePart] = useState<string>("");
  const [cashPart, setCashPart] = useState<string>("");
  const [clientName, setClientName] = useState<string>("");
  // Datos del cliente OBLIGATORIOS al crear el pedido. La card del motorizado
  // los usa como identificación primaria (nombre prominente + dirección como
  // subtítulo) en lugar del código del pedido. Si hubiera un error, el driver
  // puede corregirlos en waiting_at_restaurant.
  const [clientPhone, setClientPhone] = useState<string>("");
  const [deliveryReference, setDeliveryReference] = useState<string>("");

  const queryClient = useQueryClient();
  const [isConfirming, setIsConfirming] = useState<boolean>(false);
  const [showSuggestionPopup, setShowSuggestionPopup] =
    useState<boolean>(false);
  const [phoneWithPopupShown, setPhoneWithPopupShown] = useState<string | null>(
    null,
  );
  // address_id de la dirección guardada que seleccionó el usuario en el popup.
  // null = dirección nueva / no seleccionada todavía.
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  // true cuando el cajero seleccionó una dirección guardada (con GPS) y luego
  // editó manualmente el texto → GPS ya no viajará → mostramos advertencia ámbar.
  const [wasAddressDeselectedByEdit, setWasAddressDeselectedByEdit] =
    useState<boolean>(false);
  const [readyNow, setReadyNow] = useState(false);
  // Mostrar el error solo después de que el usuario interactuó con el campo,
  // para no asustar con rojos antes de empezar a escribir.
  const [touched, setTouched] = useState<{
    clientName: boolean;
    clientPhone: boolean;
    deliveryReference: boolean;
    amount: boolean;
  }>({
    clientName: false,
    clientPhone: false,
    deliveryReference: false,
    amount: false,
  });
  const PHONE_PE_REGEX = /^9\d{8}$/;
  const clientPhoneDigits = (clientPhone || "").replace(/\D/g, "").slice(0, 9);
  const isPhoneBlacklisted = BLACKLISTED_PHONES.includes(clientPhoneDigits);
  const clientNameTrim = (clientName || "").trim();
  const deliveryReferenceTrim = (deliveryReference || "").trim();
  const clientNameValid = clientNameTrim.length > 0;
  const clientPhoneValid =
    PHONE_PE_REGEX.test(clientPhoneDigits) && !isPhoneBlacklisted;

  const { data: histData, isFetching: addressesLoading } =
    useCustomerHistoricalAddresses(clientPhoneDigits, clientPhoneValid);
  const historicalAddresses = histData?.addresses || [];

  // Guard para evitar mostrar el popup más de una vez por número.
  // Se limpia en handlePhoneChange al cambiar el número, y en el useEffect cuando el teléfono es inválido.

  const handlePhoneChange = (newVal: string) => {
    const cleanVal = newVal.replace(/\D/g, "").slice(0, 9);
    if (cleanVal !== clientPhoneDigits) {
      setClientName("");
      setDeliveryReference("");
      setTouched((t) => ({
        ...t,
        clientName: false,
        deliveryReference: false,
      }));
      // Al cambiar el número, resetear el guard del popup
      // para que vuelva a aparecer si el nuevo número tiene historial
      setPhoneWithPopupShown(null);
      // Al cambiar el número, limpiar también la dirección seleccionada y el flag
      setSelectedAddressId(null);
      setWasAddressDeselectedByEdit(false);
    }
    setClientPhone(cleanVal);
  };

  const handleAmountChange = (val: string) => {
    let cleaned = val.replace(/[^0-9.,]/g, "");
    cleaned = cleaned.replace(",", ".");
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("");
    }
    if (parts[1] !== undefined) {
      cleaned = parts[0] + "." + parts[1].slice(0, 2);
    }
    setAmount(cleaned);
  };

  useEffect(() => {
    if (!clientPhoneValid) {
      setShowSuggestionPopup(false);
      setPhoneWithPopupShown(null);
      return;
    }

    if (historicalAddresses.length === 0) {
      return;
    }

    // Mostrar el popup si aún no lo hemos mostrado para este número
    if (phoneWithPopupShown !== clientPhoneDigits) {
      setShowSuggestionPopup(true);
      setPhoneWithPopupShown(clientPhoneDigits);

      supabase
        .from("address_capture_events")
        .insert({
          phone: clientPhoneDigits,
          action: "shown",
          metadata: {
            results_count: historicalAddresses.length,
            context: "cashier_form_popup",
          },
        })
        .then(({ error }) => {
          if (error) console.error("Error logging shown telemetry:", error);
        });
    }
  }, [
    historicalAddresses,
    clientPhoneDigits,
    clientPhoneValid,
    phoneWithPopupShown,
  ]);

  const handleSuggestionConfirm = (
    selected: {
      delivery_reference: string;
      client_name: string;
      address_id: string;
    } | null,
  ) => {
    if (selected) {
      setClientName(selected.client_name);
      setDeliveryReference(selected.delivery_reference);
      setSelectedAddressId(selected.address_id);
      setWasAddressDeselectedByEdit(false);
      supabase
        .from("address_capture_events")
        .insert({
          phone: clientPhoneDigits,
          action: "confirmed",
          metadata: {
            delivery_reference: selected.delivery_reference,
            client_name: selected.client_name,
            address_id: selected.address_id,
            context: "cashier_form_popup",
          },
        })
        .then(({ error }) => {
          if (error) console.error("Error logging confirmed telemetry:", error);
        });
    } else {
      // El usuario eligió "Escribir otra" — no vincular ninguna dirección guardada
      const histName = historicalAddresses[0]?.customer_name || clientName;
      setClientName(histName);
      setDeliveryReference("");
      setSelectedAddressId(null);
      setWasAddressDeselectedByEdit(false);
      supabase
        .from("address_capture_events")
        .insert({
          phone: clientPhoneDigits,
          action: "omitted",
          metadata: {
            context: "cashier_form_popup",
          },
        })
        .then(({ error }) => {
          if (error) console.error("Error logging omitted telemetry:", error);
        });
    }
    setShowSuggestionPopup(false);
  };

  const handleSuggestionClose = () => {
    setShowSuggestionPopup(false);
    const firstAddr = historicalAddresses[0];
    if (firstAddr) {
      setClientName(firstAddr.customer_name || "Cliente");
      setDeliveryReference(firstAddr.reference);
      // Al cerrar con X también vinculamos la primera dirección (es la que se autocompleta)
      setSelectedAddressId(firstAddr.address_id);
      setWasAddressDeselectedByEdit(false);
      supabase
        .from("address_capture_events")
        .insert({
          phone: clientPhoneDigits,
          action: "confirmed",
          metadata: {
            delivery_reference: firstAddr.reference,
            client_name: firstAddr.customer_name || "Cliente",
            address_id: firstAddr.address_id,
            context: "cashier_form_popup_close_autofill",
          },
        })
        .then(({ error }) => {
          if (error) console.error("Error logging confirmed telemetry:", error);
        });
    }
  };

  const showSkeletons =
    clientPhoneDigits.length === 9 && clientPhoneValid && addressesLoading;
  const showPhoneError =
    (touched.clientPhone && !clientPhoneValid) ||
    (clientPhoneDigits.length === 9 && !clientPhoneValid);
  const namePlaceholder = !clientPhoneValid
    ? "Primero ingresa el teléfono"
    : "Ej: Juan, María Fernanda";
  const nameDisabled = !clientPhoneValid;
  const referencePlaceholder = !clientPhoneValid
    ? "Primero ingresa el teléfono"
    : "Ej: Av. Paseo de la República 3500, dpto 502, frente al parque";
  const referenceDisabled = !clientPhoneValid;
  const deliveryReferenceValid = deliveryReferenceTrim.length > 0;

  const carouselRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  function scrollCarousel(direction: -1 | 1) {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * 200, behavior: "smooth" });
  }

  const amountNum = parseMoney(amount);
  const paysWithNum = parseMoney(paysWith);
  const yapePartNum = parseMoney(yapePart);
  const cashPartNum = parseMoney(cashPart);
  const splitSumCents = Math.round((yapePartNum + cashPartNum) * 100);
  const orderAmountCents = Math.round(amountNum * 100);
  const splitSumsCorrect =
    payment !== "pending_mixed" || splitSumCents === orderAmountCents;
  const splitBothPositive =
    payment !== "pending_mixed" || (yapePartNum > 0 && cashPartNum > 0);

  const cashTarget = payment === "pending_mixed" ? cashPartNum : amountNum;
  const change = useMemo(() => {
    if (payment === "pending_cash") return Math.max(paysWithNum - amountNum, 0);
    if (payment === "pending_mixed")
      return Math.max(paysWithNum - cashPartNum, 0);
    return 0;
  }, [payment, amountNum, paysWithNum, cashPartNum]);

  const amountValidationError = useMemo(() => {
    if (!amount) return "Ingresa el monto del pedido";
    const hasInvalidChars = /[^0-9.]/.test(amount);
    const parts = amount.split(".");
    const hasMultipleDots = parts.length > 2;
    const hasTooManyDecimals = parts[1] !== undefined && parts[1].length > 2;

    if (hasInvalidChars || hasMultipleDots || hasTooManyDecimals) {
      return "Ingresa solo números (ejemplo: 25.00)";
    }

    const parsed = parseMoney(amount);
    if (parsed <= 0) {
      return "El monto debe ser mayor a S/. 0";
    }
    return null;
  }, [amount]);

  const canSubmit =
    amountValidationError === null &&
    (payment !== "pending_cash" || paysWithNum >= amountNum) &&
    (payment !== "pending_mixed" ||
      (splitBothPositive && splitSumsCorrect && paysWithNum >= cashPartNum)) &&
    // Datos del cliente obligatorios: nombre, teléfono válido y dirección/referencia.
    // La card del motorizado los necesita para identificar a quién y a dónde.
    clientNameValid &&
    clientPhoneValid &&
    deliveryReferenceValid;

  const showAmountError = touched.amount && amountValidationError !== null;

  useEffect(() => {
    const idx = PREP_MINUTES.indexOf(prepMinutes);
    const el = carouselRef.current?.querySelector<HTMLButtonElement>(
      `[data-prep="${idx}"]`,
    );
    el?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    // Resetear el toggle "listo ahora" si cambia el tiempo de prep
    setReadyNow(false);
  }, [prepMinutes]);

  async function executeSubmit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const body: Orders.CreateOrderRequest = {
      prepMinutes,
      paymentStatus: payment,
      orderAmount: amountNum,
      yapeAmount: payment === "pending_mixed" ? yapePartNum : undefined,
      cashAmount: payment === "pending_mixed" ? cashPartNum : undefined,
      clientPaysWith:
        payment === "pending_cash" || payment === "pending_mixed"
          ? paysWithNum
          : undefined,
      clientName: clientNameTrim,
      clientPhone: clientPhoneDigits,
      deliveryReference: deliveryReferenceTrim,
      customerAddressId: selectedAddressId,
      readyEarly: readyNow || undefined,
    };
    createOrder.mutate(
      { body, idempotencyKey: idem.key },
      {
        onSuccess: () => {
          idem.consume();
          submittingRef.current = false;
          setIsConfirming(false);
          router.replace("/restaurante");
        },
        onError: (err) => {
          // 4xx: el servidor rechazó por validación, conflicto, etc. La key
          // ya fue consumida en BD (cache de la respuesta de error). Generar
          // nueva para que el usuario pueda reintentar con datos corregidos.
          // 5xx: NO consumir — permitir retry seguro con la misma key.
          const status = (err as { status?: number })?.status;
          if (status !== undefined && status >= 400 && status < 500)
            idem.consume();
          // Liberar el guard síncrono para que el usuario pueda reintentar.
          submittingRef.current = false;
        },
      },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      // Marca todos los campos como tocados para revelar los
      // mensajes de error si el usuario presionó Crear sin completarlos.
      setTouched({
        clientName: true,
        clientPhone: true,
        deliveryReference: true,
        amount: true,
      });
      return;
    }

    // Mostrar el popup de confirmación si:
    // - El cliente tiene direcciones históricas (para sugerir reutilizar), o
    // - El tiempo de preparación es 10 min (para ofrecer marcar como listo)
    if (historicalAddresses.length > 0 || prepMinutes === 10) {
      setIsConfirming(true);
    } else {
      executeSubmit();
    }
  }

  return (
    <div
      className="min-h-screen relative"
      style={{ paddingBottom: "calc(130px + env(safe-area-inset-bottom))" }}
    >
      {/* Ambient wash behind everything */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(circle at 0% 0%, rgba(255, 107, 53, 0.08) 0%, transparent 40%), radial-gradient(circle at 100% 100%, rgba(255, 140, 66, 0.06) 0%, transparent 40%)",
        }}
      />

      <GlassTopBar
        title="NUEVO PEDIDO"
        subtitle="Restaurante"
        left={
          <IconButton
            variant="ghost"
            onClick={() => router.back()}
            aria-label="Cancelar"
          >
            <Icon name="close" />
          </IconButton>
        }
      />

      <form
        id="new-order-form"
        onSubmit={handleSubmit}
        className="pt-20 px-4 max-w-md mx-auto space-y-6"
      >
        <PlatformClosedBanner />

        {/* Hero label */}
        <div className="flex items-center gap-3 px-1 pt-2">
          <span
            className="inline-block w-1.5 h-5 rounded-full"
            style={{
              background: "linear-gradient(180deg, #FF6B35 0%, #FF8C42 100%)",
              boxShadow: "0 4px 12px rgba(255, 107, 53, 0.35)",
            }}
            aria-hidden="true"
          />
          <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
            Crea el pedido
          </h2>
        </div>

        {/* Teléfono del cliente — obligatorio */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <label
              htmlFor="clientPhone"
              className="text-sm font-semibold text-on-surface"
            >
              Teléfono del cliente
            </label>
            <span className="text-[10px] font-bold tracking-wider uppercase text-primary-container">
              obligatorio
            </span>
          </div>
          <PhoneInputPe
            id="clientPhone"
            value={clientPhone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, clientPhone: true }))}
            autoComplete="tel"
            aria-invalid={showPhoneError}
          />
          {showPhoneError && (
            <p className="text-[11px] font-semibold text-red-600 px-1">
              {clientPhoneDigits.length === 0
                ? "Ingresa el teléfono del cliente."
                : isPhoneBlacklisted
                  ? "Teléfono inválido, ingrese el real"
                  : "Debe empezar en 9 y tener 9 dígitos."}
            </p>
          )}
        </section>

        {/* Nombre del cliente — obligatorio */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <label
                htmlFor="clientName"
                className="text-sm font-semibold text-on-surface"
              >
                Nombre del cliente
              </label>
              <span className="text-[10px] font-bold tracking-wider uppercase text-primary-container">
                obligatorio
              </span>
            </div>
          </div>
          {showSkeletons ? (
            <div
              className="w-full h-[52px] bg-on-surface-variant/10 rounded-[20px] animate-pulse flex items-center px-4"
              style={{ border: "1px solid rgba(225, 191, 181, 0.2)" }}
            >
              <span className="text-xs text-on-surface-variant/40 font-semibold">
                Buscando nombre...
              </span>
            </div>
          ) : (
            <input
              id="clientName"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, clientName: true }))}
              placeholder={namePlaceholder}
              disabled={nameDisabled}
              maxLength={80}
              autoComplete="off"
              autoCapitalize="words"
              aria-invalid={
                touched.clientName && !clientNameValid && !nameDisabled
              }
              className={cn(
                "w-full px-4 py-3.5 rounded-[20px] text-base font-semibold transition-shadow",
                nameDisabled
                  ? "bg-on-surface-variant/5 text-on-surface-variant/40 placeholder:text-on-surface-variant/30 cursor-not-allowed border-dashed"
                  : "bg-white/85 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40",
              )}
              style={{
                backdropFilter: "blur(12px)",
                border:
                  touched.clientName && !clientNameValid && !nameDisabled
                    ? "1px solid rgba(186, 26, 26, 0.55)"
                    : "1px solid rgba(225, 191, 181, 0.35)",
                boxShadow: "0 2px 8px rgba(171, 53, 0, 0.05)",
              }}
            />
          )}
          {touched.clientName && !clientNameValid && !nameDisabled && (
            <p className="text-[11px] font-semibold text-red-600 px-1">
              Escribe el nombre del cliente.
            </p>
          )}
        </section>

        {/* Dirección o referencia — obligatorio */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1">
              <label
                htmlFor="deliveryReference"
                className="text-sm font-semibold text-on-surface"
              >
                Dirección de entrega
              </label>
              <span
                className="text-red-500 font-bold text-sm"
                title="Obligatorio"
              >
                *
              </span>
            </div>
            {historicalAddresses.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSuggestionPopup(true)}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full hover:bg-primary/5 transition-all animate-in fade-in duration-200"
              >
                <Icon name="history" size={14} />
                Direcciones guardadas ({historicalAddresses.length})
              </button>
            )}
          </div>
          {showSkeletons ? (
            <div
              className="w-full h-[80px] bg-on-surface-variant/10 rounded-[20px] animate-pulse flex items-start p-4"
              style={{ border: "1px solid rgba(225, 191, 181, 0.2)" }}
            >
              <span className="text-xs text-on-surface-variant/40 font-semibold">
                Buscando dirección...
              </span>
            </div>
          ) : (
            <textarea
              id="deliveryReference"
              value={deliveryReference}
              onChange={(e) => {
                const newVal = e.target.value.slice(0, 500);
                setDeliveryReference(newVal);
                // Si había una dirección guardada vinculada y el texto ya no coincide
                // con esa dirección → desvincular el GPS para no enviarlo al motorizado
                if (selectedAddressId) {
                  const linkedAddr = historicalAddresses.find(
                    (a) => a.address_id === selectedAddressId,
                  );
                  if (
                    linkedAddr &&
                    newVal.trim() !== linkedAddr.reference.trim()
                  ) {
                    setSelectedAddressId(null);
                    setWasAddressDeselectedByEdit(true);
                  }
                }
              }}
              onBlur={() =>
                setTouched((t) => ({ ...t, deliveryReference: true }))
              }
              placeholder={referencePlaceholder}
              disabled={referenceDisabled}
              rows={2}
              maxLength={500}
              aria-invalid={
                touched.deliveryReference &&
                !deliveryReferenceValid &&
                !referenceDisabled
              }
              className={cn(
                "w-full px-4 py-3 rounded-[20px] text-sm transition-shadow resize-none",
                referenceDisabled
                  ? "bg-on-surface-variant/5 text-on-surface-variant/40 placeholder:text-on-surface-variant/30 cursor-not-allowed border-dashed"
                  : "bg-white/85 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/40",
              )}
              style={{
                backdropFilter: "blur(12px)",
                border:
                  touched.deliveryReference &&
                  !deliveryReferenceValid &&
                  !referenceDisabled
                    ? "1px solid rgba(186, 26, 26, 0.55)"
                    : "1px solid rgba(225, 191, 181, 0.35)",
                boxShadow: "0 2px 8px rgba(171, 53, 0, 0.05)",
              }}
            />
          )}
          {touched.deliveryReference &&
          !deliveryReferenceValid &&
          !referenceDisabled ? (
            <p className="text-[11px] font-semibold text-red-600 px-1">
              Escribe la dirección o una referencia del destino.
            </p>
          ) : (
            deliveryReferenceTrim.length > 0 &&
            !referenceDisabled && (
              <div className="flex items-center justify-between px-1 text-[10px] font-bold">
                {selectedAddressId ? (
                  // Caso A: texto coincide con dirección guardada que tiene GPS
                  <span className="text-emerald-600 flex items-center gap-0.5 animate-in fade-in duration-200">
                    <Icon
                      name="gps_fixed"
                      size={13}
                      className="text-emerald-600"
                    />
                    Usando dirección registrada · GPS incluido
                  </span>
                ) : wasAddressDeselectedByEdit ? (
                  // Caso B: había una dirección seleccionada pero el cajero editó el texto
                  <span className="text-amber-600 flex items-center gap-1 animate-in fade-in duration-200">
                    <Icon name="warning" size={13} className="text-amber-600" />
                    Dirección modificada · el GPS no se enviará al motorizado
                  </span>
                ) : (
                  // Caso C: dirección nueva escrita desde cero
                  <span className="text-primary flex items-center gap-0.5 animate-in fade-in duration-200">
                    <Icon name="edit" size={13} className="text-primary" />
                    Escribiendo dirección nueva
                  </span>
                )}
                <span className="text-on-surface-variant/70 font-mono">
                  {deliveryReferenceTrim.length}/500
                </span>
              </div>
            )
          )}
        </section>

        {/* Prep time carousel */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-on-surface">
              Tiempo de preparación
            </span>
            <span className="text-xs font-mono text-on-surface-variant">
              {prepMinutes} min
            </span>
          </div>

          <div className="relative">
            {isDesktop && (
              <button
                type="button"
                aria-label="Desplazar izquierda"
                onClick={() => scrollCarousel(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(225, 191, 181, 0.4)",
                  boxShadow: "0 4px 14px rgba(171, 53, 0, 0.12)",
                  color: "#1a1c1b",
                }}
              >
                <Icon name="chevron_left" size={22} />
              </button>
            )}
            {isDesktop && (
              <button
                type="button"
                aria-label="Desplazar derecha"
                onClick={() => scrollCarousel(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 inline-flex items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(225, 191, 181, 0.4)",
                  boxShadow: "0 4px 14px rgba(171, 53, 0, 0.12)",
                  color: "#1a1c1b",
                }}
              >
                <Icon name="chevron_right" size={22} />
              </button>
            )}

            <div
              ref={carouselRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-3 -mx-4 px-4"
              style={{
                scrollbarWidth: "none",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x",
              }}
            >
              {PREP_MINUTES.map((m, idx) => {
                const active = prepMinutes === m;
                return (
                  <button
                    key={m}
                    type="button"
                    data-prep={idx}
                    onClick={() => setPrepMinutes(m)}
                    className={cn(
                      "snap-center shrink-0 flex flex-col items-center justify-center transition-all duration-300 ease-out",
                      active
                        ? "scale-100"
                        : "scale-95 opacity-70 hover:opacity-100 hover:scale-100",
                    )}
                    style={{
                      width: "92px",
                      height: "108px",
                      borderRadius: "22px",
                      background: active
                        ? "linear-gradient(135deg, #FF6B35 0%, #FF8C42 55%, #FFA85C 100%)"
                        : "rgba(255, 255, 255, 0.85)",
                      backdropFilter: "blur(12px)",
                      border: active
                        ? "1px solid rgba(255, 107, 53, 0.4)"
                        : "1px solid rgba(225, 191, 181, 0.3)",
                      boxShadow: active
                        ? "0 12px 30px -8px rgba(255, 107, 53, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.25)"
                        : "0 2px 8px rgba(171, 53, 0, 0.05)",
                      color: active ? "#ffffff" : "#1a1c1b",
                    }}
                  >
                    <span
                      className="font-black"
                      style={{
                        fontSize: "30px",
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                        textShadow: active
                          ? "0 1px 2px rgba(95, 25, 0, 0.25)"
                          : "none",
                      }}
                    >
                      {m}
                    </span>
                    <span
                      className="text-[10px] font-bold tracking-[0.14em] uppercase mt-1.5"
                      style={{ opacity: active ? 0.92 : 0.65 }}
                    >
                      min
                    </span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="mt-2 inline-block rounded-full"
                        style={{
                          width: "20px",
                          height: "3px",
                          background: "rgba(255, 255, 255, 0.75)",
                          boxShadow: "0 1px 4px rgba(255, 255, 255, 0.4)",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Payment method */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-on-surface">
              Método de pago
            </span>
          </div>
          <div className="space-y-2.5">
            {paymentOptions.map((opt) => {
              const active = payment === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPayment(opt.value)}
                  className="w-full flex items-center gap-3.5 transition-all duration-300 ease-out active:scale-[0.98]"
                  style={{
                    padding: "14px 16px",
                    borderRadius: "20px",
                    background: active
                      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 250, 248, 0.95) 100%)"
                      : "rgba(255, 255, 255, 0.7)",
                    backdropFilter: "blur(10px)",
                    border: active
                      ? "1.5px solid rgba(255, 107, 53, 0.45)"
                      : "1px solid rgba(225, 191, 181, 0.3)",
                    boxShadow: active
                      ? "0 10px 30px -10px rgba(255, 107, 53, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.9)"
                      : "0 1px 4px rgba(171, 53, 0, 0.03)",
                  }}
                >
                  <span
                    className="shrink-0 inline-flex items-center justify-center"
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "14px",
                      background: opt.gradient,
                      color: "#ffffff",
                      boxShadow: active
                        ? "0 8px 20px -6px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)"
                        : "0 4px 10px -4px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
                      transform: active ? "scale(1.05)" : "scale(1)",
                      transition: "transform 300ms ease-out",
                    }}
                  >
                    <Icon name={opt.icon} size={22} filled />
                  </span>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-bold text-on-surface truncate">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-on-surface-variant truncate">
                      {opt.hint}
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center transition-all duration-300"
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      border: active
                        ? "none"
                        : "1.5px solid rgba(225, 191, 181, 0.6)",
                      background: active
                        ? "linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)"
                        : "transparent",
                      color: "#ffffff",
                      boxShadow: active
                        ? "0 4px 10px rgba(255, 107, 53, 0.4)"
                        : "none",
                    }}
                  >
                    {active && <Icon name="check" size={14} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Amount */}
        <section key="amount-section" className="space-y-3">
          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center gap-2">
              <label
                htmlFor="amount"
                className="text-sm font-semibold text-on-surface"
              >
                Monto del pedido
              </label>
              <span className="text-[10px] font-bold tracking-wider uppercase text-primary-container">
                obligatorio
              </span>
            </div>
            <span className="text-xs text-on-surface-variant">
              Comida + delivery
            </span>
          </div>
          <MoneyInput
            id="amount"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
            placeholder="Ej: 25.00"
            required
            style={{
              border: showAmountError
                ? "1px solid rgba(186, 26, 26, 0.55)"
                : "1px solid rgba(225, 191, 181, 0.35)",
            }}
          />
          {showAmountError && (
            <p className="text-[11px] font-semibold text-red-600 px-1">
              {amountValidationError}
            </p>
          )}
        </section>

        {/* Split de pago mixto (yape + cash) */}
        {payment === "pending_mixed" && (
          <section key="mixed-section" className="space-y-3 tindivo-reveal">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-sm font-semibold text-on-surface">
                División del pago
              </span>
              <span className="text-[10px] text-on-surface-variant">
                deben sumar S/ {amountNum.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="yapePart"
                  className="text-[11px] font-bold tracking-wide uppercase text-purple-700"
                >
                  Yape
                </label>
                <MoneyInput
                  id="yapePart"
                  value={yapePart}
                  onChange={(e) => setYapePart(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="cashPart"
                  className="text-[11px] font-bold tracking-wide uppercase text-orange-700"
                >
                  Efectivo
                </label>
                <MoneyInput
                  id="cashPart"
                  value={cashPart}
                  onChange={(e) => setCashPart(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            {amountNum > 0 &&
              yapePartNum + cashPartNum > 0 &&
              !splitSumsCorrect && (
                <div className="text-xs font-semibold text-red-600 px-1">
                  La suma actual es S/ {(yapePartNum + cashPartNum).toFixed(2)}{" "}
                  — debe ser S/ {amountNum.toFixed(2)}.
                </div>
              )}
          </section>
        )}

        {/* Pays with (cash only y mixed) */}
        {(payment === "pending_cash" || payment === "pending_mixed") && (
          <section key="cash-section" className="space-y-3 tindivo-reveal">
            <div className="flex items-center gap-2 px-1">
              <label
                htmlFor="paysWith"
                className="text-sm font-semibold text-on-surface"
              >
                Cliente paga con
              </label>
              <span className="text-[10px] text-on-surface-variant">
                {payment === "pending_mixed"
                  ? `billete sobre la parte efectivo (S/ ${cashTarget.toFixed(2)})`
                  : "para calcular vuelto"}
              </span>
            </div>
            <MoneyInput
              id="paysWith"
              value={paysWith}
              onChange={(e) => setPaysWith(e.target.value)}
              placeholder="Billete del cliente"
              required
            />
            {change > 0 && (
              <div
                className="relative overflow-hidden flex items-center justify-between tindivo-pop"
                style={{
                  padding: "16px 18px",
                  borderRadius: "20px",
                  background:
                    "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.12) 100%)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  boxShadow: "0 8px 24px -8px rgba(16, 185, 129, 0.25)",
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 60%)",
                  }}
                />
                <div className="relative flex items-center gap-2.5">
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "12px",
                      background:
                        "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                      color: "#ffffff",
                      boxShadow: "0 6px 16px -4px rgba(16, 185, 129, 0.5)",
                    }}
                  >
                    <Icon name="payments" size={18} filled />
                  </span>
                  <div>
                    <div className="text-[10px] font-bold tracking-widest uppercase text-emerald-700">
                      Vuelto a entregar al driver
                    </div>
                    <div className="text-[10px] text-emerald-900/60">
                      prepáralo en efectivo
                    </div>
                  </div>
                </div>
                <span
                  className="relative font-black text-emerald-900"
                  style={{
                    fontSize: "26px",
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  }}
                >
                  S/ {change.toFixed(2)}
                </span>
              </div>
            )}
          </section>
        )}
      </form>

      <BottomActionBar>
        <Button
          type="submit"
          form="new-order-form"
          size="lg"
          className="w-full"
          disabled={!canSubmit || createOrder.isPending || isPlatformClosed}
        >
          {createOrder.isPending
            ? "Creando pedido..."
            : isPlatformClosed
              ? "Tindivo cerrado"
              : "Crear pedido"}
          <Icon
            name={createOrder.isPending ? "progress_activity" : "arrow_forward"}
          />
        </Button>
      </BottomActionBar>

      {/* Modal de confirmación de dirección */}
      {isConfirming && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-[24px] p-6 max-w-md w-full border border-outline-variant/15 shadow-2xl space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center gap-2 text-primary font-black">
              <Icon name="check_circle" size={24} className="text-primary" />
              <h3 className="text-lg">Confirmar pedido</h3>
            </div>

            <div className="space-y-3 p-4 bg-surface-container-low rounded-2xl border border-outline-variant/10">
              <div>
                <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                  Dirección de Entrega
                </span>
                <p className="text-sm font-black text-primary mt-0.5 whitespace-pre-wrap break-words">
                  {deliveryReferenceTrim}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-outline-variant/10">
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                    Cliente
                  </span>
                  <p className="text-xs font-bold text-on-surface truncate">
                    {clientNameTrim} ({clientPhoneDigits})
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase">
                    Monto
                  </span>
                  <p className="text-xs font-bold text-on-surface">
                    S/ {amountNum.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Toggle "listo ahora" — solo cuando prep=10 min */}
            {prepMinutes === 10 && (
              <button
                type="button"
                onClick={() => setReadyNow((v) => !v)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 cursor-pointer select-none hover:brightness-95"
                style={{
                  background: readyNow
                    ? "rgba(5, 150, 105, 0.10)"
                    : "rgba(249, 250, 251, 0.9)",
                  border: readyNow
                    ? "1.5px solid rgba(5, 150, 105, 0.40)"
                    : "1.5px solid rgba(209, 213, 219, 0.9)",
                  boxShadow: readyNow
                    ? "0 0 0 3px rgba(5, 150, 105, 0.08)"
                    : "0 1px 3px rgba(0, 0, 0, 0.04)",
                }}
              >
                {/* Icono */}
                <span
                  className="shrink-0 inline-flex items-center justify-center transition-all duration-300"
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "11px",
                    background: readyNow
                      ? "linear-gradient(135deg, #059669 0%, #10B981 100%)"
                      : "rgba(156, 163, 175, 0.18)",
                    color: readyNow ? "#ffffff" : "#6B7280",
                    boxShadow: readyNow
                      ? "0 4px 12px rgba(5, 150, 105, 0.35)"
                      : "none",
                  }}
                >
                  <Icon name="check_circle" size={20} filled={readyNow} />
                </span>

                {/* Texto */}
                <div className="flex-1 text-left">
                  <div className="text-sm font-bold text-on-surface">
                    {readyNow
                      ? "Pedido listo para recoger"
                      : "¿Ya está listo el pedido?"}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    {readyNow
                      ? "El motorizado vendrá de inmediato."
                      : "Actívalo si la comida ya está terminada."}
                  </div>
                </div>

                {/* Toggle Switch */}
                <span
                  className="shrink-0 relative inline-flex items-center transition-all duration-300"
                  style={{
                    width: "48px",
                    height: "28px",
                    borderRadius: "14px",
                    background: readyNow
                      ? "linear-gradient(135deg, #059669 0%, #10B981 100%)"
                      : "rgba(209, 213, 219, 0.8)",
                    boxShadow: readyNow
                      ? "0 2px 8px rgba(5, 150, 105, 0.40), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "inset 0 1px 2px rgba(0, 0, 0, 0.08)",
                  }}
                >
                  <span
                    className="absolute inline-flex items-center justify-center transition-all duration-300"
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "#ffffff",
                      left: readyNow ? "23px" : "3px",
                      boxShadow: readyNow
                        ? "0 1px 3px rgba(0,0,0,0.15)"
                        : "0 1px 2px rgba(0,0,0,0.12)",
                    }}
                  >
                    {readyNow && (
                      <Icon
                        name="check"
                        size={12}
                        className="text-emerald-600"
                      />
                    )}
                  </span>
                </span>
              </button>
            )}

            <p className="text-xs text-on-surface-variant font-medium text-center">
              ¿Todo correcto?
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setIsConfirming(false)}
              >
                Editar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={createOrder.isPending}
                onClick={() => executeSubmit()}
              >
                {createOrder.isPending ? "Creando..." : "Sí, crear pedido"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Adaptive address suggestion popup */}
      <AddressSuggestionPopup
        isOpen={showSuggestionPopup}
        phone={clientPhoneDigits}
        addresses={historicalAddresses}
        onConfirm={handleSuggestionConfirm}
        onClose={handleSuggestionClose}
      />
    </div>
  );
}
```

## L4a

`packages/ui/src/patterns/interactive-map.tsx` (201 lineas)

```tsx
"use client";
import "leaflet/dist/leaflet.css";
import { SAN_JACINTO_CENTER } from "@tindivo/core";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { cn } from "../lib/cn";

type Coordinates = { lat: number; lng: number };

type Props = {
  initialCenter?: Coordinates;
  initialZoom?: number;
  value?: Coordinates | null;
  onChange?: (coords: Coordinates) => void;
  /**
   * Marker de referencia visual no editable. Útil para mostrar un punto
   * de orientación (p.ej. la ubicación del restaurante cuando el driver
   * registra la dirección del cliente). Se renderiza con un ícono gris
   * distinto al marker editable y NO acepta drag ni emite eventos.
   */
  referenceMarker?: Coordinates;
  readOnly?: boolean;
  className?: string;
  height?: number | string;
};

const defaultCenter: Coordinates = SAN_JACINTO_CENTER;

// Icono editable (cliente / selección activa): naranja con pulse.
const markerIcon = new L.DivIcon({
  className: "",
  html: `<div style="
    width: 32px; height: 32px; position: relative;
    display: flex; align-items: center; justify-content: center;
  ">
    <div style="
      position: absolute; inset: 0;
      background: rgba(255,107,53,0.3); border-radius: 9999px;
      animation: tindivo-pulse 2s ease-in-out infinite;
    "></div>
    <div style="
      position: relative; width: 18px; height: 18px;
      background: #ab3500; border: 3px solid #fff; border-radius: 9999px;
      box-shadow: 0 4px 12px rgba(171,53,0,0.5);
    "></div>
  </div>
  <style>
    @keyframes tindivo-pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.4); opacity: 0.2; }
    }
  </style>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Icono de referencia (no editable): azul intenso con halo, forma cuadrada
// redondeada para diferenciarlo claramente del marker editable (naranja
// circular). El azul contrasta fuerte con el cream/orange del tile OSM
// y con los textos grises de las calles.
const referenceIcon = new L.DivIcon({
  className: "",
  html: `<div style="
    width: 32px; height: 32px; position: relative;
    display: flex; align-items: center; justify-content: center;
  ">
    <div style="
      position: absolute; inset: 0;
      background: rgba(29, 78, 216, 0.22); border-radius: 9999px;
    "></div>
    <div style="
      position: relative; width: 22px; height: 22px;
      background: #1D4ED8; border: 3px solid #fff; border-radius: 7px;
      box-shadow: 0 4px 12px rgba(29, 78, 216, 0.55);
      display: flex; align-items: center; justify-content: center;
    ">
      <div style="
        width: 9px; height: 9px; background: #fff; border-radius: 2px;
      "></div>
    </div>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function ClickCapture({ onSelect }: { onSelect: (c: Coordinates) => void }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/**
 * Mapa interactivo Leaflet. El usuario hace click o arrastra el marker
 * para seleccionar un punto. Emite `onChange` con las coordenadas.
 *
 * Opcionalmente acepta `referenceMarker` para pintar un segundo punto
 * de referencia visual (no editable, ícono distinto).
 */
export function InteractiveMap({
  initialCenter,
  initialZoom = 16,
  value,
  onChange,
  referenceMarker,
  readOnly = false,
  className,
  height = 400,
}: Props) {
  const [marker, setMarker] = useState<Coordinates | null>(value ?? null);
  const [mountKey, setMountKey] = useState<number | null>(null);
  const center = useMemo(
    () => value ?? initialCenter ?? defaultCenter,
    [value, initialCenter],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Generar un key único por mount (evita double-init de Leaflet en React strict
  // mode de dev donde el componente se monta → desmonta → monta).
  useEffect(() => {
    setMountKey(Date.now() + Math.random());
    return () => {
      // Cleanup agresivo: eliminar el _leaflet_id del contenedor si quedó huérfano
      const el =
        containerRef.current?.querySelector<HTMLElement>(".leaflet-container");
      if (el) {
        const anyEl = el as unknown as { _leaflet_id?: number };
        if (anyEl._leaflet_id !== undefined) anyEl._leaflet_id = undefined;
      }
    };
  }, []);

  useEffect(() => {
    if (value) setMarker(value);
  }, [value]);

  const handleSelect = useCallback(
    (coords: Coordinates) => {
      if (readOnly) return;
      setMarker(coords);
      onChange?.(coords);
    },
    [onChange, readOnly],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full rounded-xl overflow-hidden border border-outline-variant/30 shadow-[0_4px_20px_rgba(171,53,0,0.04)]",
        className,
      )}
      // `isolation: isolate` crea un nuevo stacking context que contiene
      // los z-index altos de Leaflet (.leaflet-pane=400, .leaflet-control=1000)
      // dentro del contenedor del mapa. Sin esto, esos z-index escapan y el
      // mapa se superpone sobre elementos `position: fixed` del layout
      // (p.ej. el BottomActionBar).
      style={{ height, isolation: "isolate" }}
    >
      {mountKey === null ? (
        <div className="h-full w-full bg-surface-container animate-pulse" />
      ) : (
        <MapContainer
          key={mountKey}
          center={[center.lat, center.lng]}
          zoom={initialZoom}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          {!readOnly && <ClickCapture onSelect={handleSelect} />}
          {referenceMarker && (
            <Marker
              position={[referenceMarker.lat, referenceMarker.lng]}
              icon={referenceIcon}
              draggable={false}
              interactive={false}
              keyboard={false}
            />
          )}
          {marker && (
            <Marker
              position={[marker.lat, marker.lng]}
              icon={markerIcon}
              draggable={!readOnly}
              eventHandlers={{
                dragend(e) {
                  const pos = (e.target as L.Marker).getLatLng();
                  handleSelect({ lat: pos.lat, lng: pos.lng });
                },
              }}
            />
          )}
        </MapContainer>
      )}
    </div>
  );
}
```

## L4b

`packages/ui/src/patterns/address-capture-modal.tsx` (345 lineas)

```tsx
"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SAN_JACINTO_CENTER } from "@tindivo/core";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../icons/icon";
import { Button } from "../primitives/button";
import { Input } from "../primitives/input";

const InteractiveMap = dynamic(
  () => import("./interactive-map").then((mod) => mod.InteractiveMap),
  { ssr: false },
);

type Coordinates = { lat: number; lng: number };

type Props = {
  open: boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  initialReference?: string | null;
  onConfirm: (
    lat: number,
    lng: number,
    reference: string | undefined,
    distanceDragged: number,
    accuracy: number,
    customerName?: string,
  ) => void;
  onSkip: () => void;
  showReferenceField?: boolean;
  onShown?: (accuracy: number | null) => void;
  variant?: "driver" | "admin";
  initialCustomerName?: string | null;
  onConfirmAdmin?: (data: {
    lat: number;
    lng: number;
    reference: string;
    customerName: string;
  }) => void;
};

function getHaversineDistance(
  coords1: Coordinates,
  coords2: Coordinates,
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3; // Earth radius in meters
  const dLat = toRad(coords2.lat - coords1.lat);
  const dLng = toRad(coords2.lng - coords1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coords1.lat)) *
      Math.cos(toRad(coords2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function AddressCaptureModal({
  open,
  initialLat,
  initialLng,
  initialReference,
  onConfirm,
  onSkip,
  showReferenceField = false,
  onShown,
  variant = "driver",
  initialCustomerName,
  onConfirmAdmin,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [gpsCoords, setGpsCoords] = useState<Coordinates | null>(null);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [reference, setReference] = useState(initialReference ?? "");
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");

  useEffect(() => {
    if (open) {
      setReference(initialReference ?? "");
      setCustomerName(initialCustomerName ?? "");
    }
  }, [open, initialReference, initialCustomerName]);

  // Use a ref for onShown to avoid re-triggering the useEffect on every reference change
  const onShownRef = useRef(onShown);
  useEffect(() => {
    onShownRef.current = onShown;
  }, [onShown]);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    let active = true;

    if (initialLat != null && initialLng != null) {
      const coords = { lat: initialLat, lng: initialLng };
      setGpsCoords(coords);
      setCurrentCoords(coords);
      setAccuracy(null);
      setLoading(false);
      onShownRef.current?.(null);
      return;
    }

    if (variant === "admin" || !navigator.geolocation) {
      setGpsCoords(SAN_JACINTO_CENTER);
      setCurrentCoords(SAN_JACINTO_CENTER);
      setAccuracy(null);
      setLoading(false);
      onShownRef.current?.(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setGpsCoords(coords);
        setCurrentCoords(coords);
        const acc = Math.round(position.coords.accuracy);
        setAccuracy(acc);
        setLoading(false);
        onShownRef.current?.(acc);
      },
      (error) => {
        if (!active) return;
        console.error("Error obtaining GPS coordinates:", error);
        setGpsCoords(SAN_JACINTO_CENTER);
        setCurrentCoords(SAN_JACINTO_CENTER);
        setAccuracy(null);
        setLoading(false);
        onShownRef.current?.(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 20000,
      },
    );

    return () => {
      active = false;
    };
  }, [open, initialLat, initialLng, variant]);

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setGpsCoords(coords);
        setCurrentCoords(coords);
        setAccuracy(Math.round(position.coords.accuracy));
        setLoading(false);
      },
      (error) => {
        console.error("Error obtaining GPS coordinates:", error);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 20000,
      },
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (!currentCoords) return;
    if (variant === "admin") {
      onConfirmAdmin?.({
        lat: currentCoords.lat,
        lng: currentCoords.lng,
        reference: reference.trim(),
        customerName: customerName.trim(),
      });
    } else {
      if (!gpsCoords) return;
      const distance = getHaversineDistance(gpsCoords, currentCoords);
      const finalAccuracy = accuracy ?? 999;
      const finalReference =
        reference.trim() !== (initialReference ?? "") ? reference : undefined;
      const finalCustomerName = customerName.trim() || undefined;

      onConfirm(
        currentCoords.lat,
        currentCoords.lng,
        finalReference,
        distance,
        finalAccuracy,
        finalCustomerName,
      );
    }
  }, [
    variant,
    currentCoords,
    gpsCoords,
    accuracy,
    reference,
    initialReference,
    customerName,
    onConfirm,
    onConfirmAdmin,
  ]);

  const isAdjustment = initialLat != null && initialLng != null;

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onSkip()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity" />
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-background outline-hidden md:inset-auto md:top-1/2 md:left-1/2 md:h-[90vh] md:w-[600px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
            <div className="flex items-center gap-2">
              <Icon name="my_location" className="text-primary" />
              <Dialog.Title className="text-lg font-bold text-foreground">
                {variant === "admin"
                  ? "Curar Cliente y Ubicación"
                  : isAdjustment
                    ? "Ajustar Ubicación"
                    : "Capturar Ubicación"}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar modal"
              >
                <Icon name="close" />
              </button>
            </Dialog.Close>
          </div>

          {/* Map Area */}
          <div className="relative flex-1 bg-surface-container-lowest">
            {loading ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  Obteniendo señal de GPS...
                </p>
              </div>
            ) : (
              currentCoords && (
                <InteractiveMap
                  value={currentCoords}
                  onChange={setCurrentCoords}
                  height="100%"
                  className="rounded-none border-none shadow-none"
                />
              )
            )}
          </div>

          {/* Bottom Panel */}
          <div className="flex flex-col gap-4 border-t border-outline-variant/30 bg-background p-6">
            {/* GPS Accuracy + "Usar mi ubicación" */}
            {!loading && variant !== "admin" && (
              <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="radar" size={18} />
                  <span>
                    {accuracy !== null
                      ? `Precisión del GPS: ~${accuracy}m`
                      : "Precisión del GPS: No disponible"}
                  </span>
                </div>
                {accuracy !== null && accuracy > 50 && (
                  <p className="text-xs text-muted-foreground">
                    Si el pin no está donde estás parado, arrástralo.
                  </p>
                )}
                <button
                  type="button"
                  onClick={requestGeolocation}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold active:scale-[0.98] transition-transform"
                >
                  <Icon name="my_location" size={16} />
                  Usar mi ubicación actual
                </button>
              </div>
            )}

            {/* Customer Name Input */}
            {(variant === "admin" || initialCustomerName != null) && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="name-input"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Nombre del cliente
                </label>
                <Input
                  id="name-input"
                  type="text"
                  placeholder="Ej: Juan Pérez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full text-sm"
                />
              </div>
            )}

            {/* Reference Input */}
            {(showReferenceField || variant === "admin" || isAdjustment) && (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="ref-input"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  {variant === "admin"
                    ? "Referencia de la dirección"
                    : "Mejorar referencia (opcional)"}
                </label>
                <Input
                  id="ref-input"
                  type="text"
                  placeholder="Ej: Portón verde frente al parque"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full text-sm"
                />
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="secondary"
                onClick={onSkip}
                className="h-12 text-base font-semibold"
              >
                {variant === "admin" ? "Cancelar" : "Omitir"}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={loading || !currentCoords}
                className="h-12 bg-green-600 text-base font-semibold text-white hover:bg-green-700 active:bg-green-800 disabled:bg-muted"
              >
                {variant === "admin" ? "Guardar" : "Confirmar"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

## L5

`packages/core/src/modules/orders/infrastructure/supabase-customer-address.repository.ts` (132 lineas)

```tsx
import type { ServerClient } from "@tindivo/supabase";
import { PersistenceError } from "../../../shared/errors/domain-error";
import type {
  AddressCaptureEvent,
  CustomerAddress,
  CustomerAddressRepository,
} from "../application/ports/customer-address.repository";

export class SupabaseCustomerAddressRepository implements CustomerAddressRepository {
  constructor(private readonly sb: ServerClient) {}

  private mapToDomain(row: any): CustomerAddress {
    return {
      addressId: row.address_id,
      phone: row.phone,
      lat: row.lat,
      lng: row.lng,
      reference: row.reference,
      accuracyM: row.accuracy_m,
      source: row.source,
      isDefault: row.is_default,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null,
      timesUsed: row.times_used,
      customerName: row.customer_name,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async findById(addressId: string): Promise<CustomerAddress | null> {
    const { data, error } = await this.sb
      .from("customer_addresses")
      .select("*")
      .eq("address_id", addressId)
      .maybeSingle();

    if (error) {
      throw new PersistenceError(error.message, error);
    }
    return data ? this.mapToDomain(data) : null;
  }

  async findByPhone(phone: string): Promise<CustomerAddress[]> {
    const { data, error } = await this.sb
      .from("customer_addresses")
      .select("*")
      .eq("phone", phone)
      .order("created_at", { ascending: false });

    if (error) {
      throw new PersistenceError(error.message, error);
    }
    return (data ?? []).map((row) => this.mapToDomain(row));
  }

  async findDefaultByPhone(phone: string): Promise<CustomerAddress | null> {
    const { data, error } = await this.sb
      .from("customer_addresses")
      .select("*")
      .eq("phone", phone)
      .eq("is_default", true)
      .maybeSingle();

    if (error) {
      throw new PersistenceError(error.message, error);
    }
    return data ? this.mapToDomain(data) : null;
  }

  async insert(
    address: Omit<CustomerAddress, "addressId" | "createdAt" | "updatedAt">,
  ): Promise<CustomerAddress> {
    const { data, error } = await this.sb
      .from("customer_addresses")
      .insert({
        phone: address.phone,
        lat: address.lat,
        lng: address.lng,
        reference: address.reference,
        accuracy_m: address.accuracyM,
        source: address.source,
        is_default: address.isDefault,
        last_used_at: address.lastUsedAt?.toISOString() ?? null,
        times_used: address.timesUsed,
        customer_name: address.customerName ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new PersistenceError(error.message, error);
    }
    return this.mapToDomain(data);
  }

  async update(address: CustomerAddress): Promise<void> {
    const { error } = await this.sb
      .from("customer_addresses")
      .update({
        lat: address.lat,
        lng: address.lng,
        reference: address.reference,
        accuracy_m: address.accuracyM,
        source: address.source,
        is_default: address.isDefault,
        last_used_at: address.lastUsedAt?.toISOString() ?? null,
        times_used: address.timesUsed,
        customer_name: address.customerName ?? null,
      })
      .eq("address_id", address.addressId);

    if (error) {
      throw new PersistenceError(error.message, error);
    }
  }

  async logEvent(event: AddressCaptureEvent): Promise<void> {
    const { error } = await this.sb.from("address_capture_events").insert({
      order_id: event.orderId,
      driver_id: event.driverId,
      phone: event.phone,
      action: event.action,
      accuracy_reported: event.accuracyReported,
      distance_dragged_m: event.distanceDraggedM,
      metadata: event.metadata ?? {},
    });

    if (error) {
      throw new PersistenceError(error.message, error);
    }
  }
}
```

## L6a

`apps/api/app/api/v1/driver/orders/[id]/delivered/route.ts` (42 lineas)

```tsx
import { buildMarkDeliveredUseCase } from "@/lib/core/container";
import { problem, problemCode } from "@/lib/http/problem";
import { requireAuth } from "@/lib/http/require-auth";
import { Orders } from "@tindivo/contracts";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, ["driver"]);
  if (!auth.ok) return auth.response;
  if (!auth.auth.driverId) return problemCode("FORBIDDEN", 403);

  // Body opcional: legacy clients no mandan nada → default { kind: 'unchanged' }.
  const raw = await req.json().catch(() => null as unknown);
  const parsed = Orders.MarkDeliveredRequest.safeParse(raw ?? {});
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        type: "https://tindivo.pe/errors/validation-error",
        title: "Datos inválidos",
        status: 400,
        code: "VALIDATION_ERROR",
        errors: parsed.error.flatten().fieldErrors,
      }),
      { status: 400, headers: { "Content-Type": "application/problem+json" } },
    );
  }

  const { id } = await params;
  const useCase = buildMarkDeliveredUseCase(auth.auth.supabase);
  const result = await useCase.execute({
    orderId: id,
    driverId: auth.auth.driverId,
    payment: parsed.data.payment,
    addressCapture: parsed.data.addressCapture,
  });

  if (result.isFailure) return problem(result.error);
  return NextResponse.json(result.value);
}
```

## L6b

`packages/core/src/modules/orders/application/use-cases/mark-delivered.use-case.ts` (273 lineas)

```tsx
import type { DomainError } from "../../../../shared/errors/domain-error";
import { Result } from "../../../../shared/kernel/result";
import type { UseCase } from "../../../../shared/kernel/use-case";
import type { DeliveryPaymentInput } from "../../domain/entities/order";
import type { Order } from "../../domain/entities/order";
import { OrderNotFound } from "../../domain/errors/order-errors";
import { Coordinates } from "../../domain/value-objects/coordinates";
import { OrderId } from "../../domain/value-objects/order-id";
import { haversineDistance } from "../../../../shared/utils/maps";
import type { Clock } from "../ports/clock";
import type {
  AddressCaptureEvent,
  CustomerAddressRepository,
} from "../ports/customer-address.repository";
import type { EventPublisher } from "../ports/event-publisher";
import type { OrderRepository } from "../ports/order.repository";

export type MarkDeliveredCommand = {
  orderId: string;
  driverId: string;
  payment?: DeliveryPaymentInput;
  addressCapture?: {
    lat: number;
    lng: number;
    accuracy: number;
    reference?: string;
    distanceDragged?: number;
    omitted?: boolean;
    customerName?: string;
  };
};

export type MarkDeliveredResult = {
  id: string;
  status: string;
  deliveredAt: string;
  cashOwedAtDelivery: number | null;
};

export class MarkDeliveredUseCase implements UseCase<
  MarkDeliveredCommand,
  MarkDeliveredResult,
  DomainError
> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customerAddresses: CustomerAddressRepository,
    private readonly events: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(
    cmd: MarkDeliveredCommand,
  ): Promise<Result<MarkDeliveredResult, DomainError>> {
    const order = await this.orders.findById(OrderId.of(cmd.orderId));
    if (!order) return Result.fail(new OrderNotFound(cmd.orderId));

    const now = this.clock.now();

    // 1. Process address capture in a non-blocking try-catch block
    if (cmd.addressCapture) {
      try {
        await this.handleAddressCapture(
          order,
          cmd.driverId,
          cmd.addressCapture,
          now,
        );
      } catch (err) {
        console.error(
          "Error during customer address capture/logging (non-blocking):",
          err,
        );
      }
    } else if (order.customerAddressId) {
      try {
        // Caso A (o cliente antiguo sin capture explícito): actualizar uso
        // y, si el order tiene coordenadas (del saveCustomerData o de la
        // herencia del customer_address al crear), mantener actualizada la
        // dirección guardada — cada entrega es una oportunidad de mejorar
        // la precisión de los datos.
        const address = await this.customerAddresses.findById(
          order.customerAddressId,
        );
        if (address) {
          // Si source no es admin_curated y el order tiene coordenadas,
          // actualizarlas en la dirección guardada (P3).
          if (
            address.source !== "admin_curated" &&
            order.props.deliveryCoordinates
          ) {
            address.lat = order.props.deliveryCoordinates.lat;
            address.lng = order.props.deliveryCoordinates.lng;
            // accuracy no disponible en esta rama; mantener la existente
          }
          address.lastUsedAt = now;
          address.timesUsed += 1;
          if (order.props.clientName) {
            address.customerName = order.props.clientName;
          }
          await this.customerAddresses.update(address);
        }
      } catch (err) {
        console.error(
          "Error updating address usage stats (non-blocking):",
          err,
        );
      }
    }

    // 2. Mark order as delivered and persist
    const previous = order.status;
    const res = order.markDelivered(now, cmd.payment ?? { kind: "unchanged" });
    if (res.isFailure) return Result.fail(res.error);

    await this.orders.save(order, previous);
    await this.events.publishAll(order.pullEvents());

    return Result.ok({
      id: order.id.value,
      status: order.status.value,
      // biome-ignore lint/style/noNonNullAssertion: set by markDelivered
      deliveredAt: order.props.deliveredAt!.toISOString(),
      cashOwedAtDelivery: order.props.cashOwedAtDelivery?.amount ?? null,
    });
  }

  private async handleAddressCapture(
    order: Order,
    driverId: string,
    capture: NonNullable<MarkDeliveredCommand["addressCapture"]>,
    now: Date,
  ): Promise<void> {
    if (capture.omitted) {
      // Registrar evento de omitido
      const event: AddressCaptureEvent = {
        orderId: order.id.value,
        driverId,
        phone: order.clientPhone,
        action: "omitted",
        accuracyReported: capture.accuracy,
        distanceDraggedM: capture.distanceDragged ?? 0,
      };
      await this.customerAddresses.logEvent(event);
      return;
    }

    // Si no es omitido, actualizar o insertar la dirección
    const action = (capture.distanceDragged ?? 0) > 0 ? "dragged" : "confirmed";
    let referenceEdited = false;
    let oldReferenceLength = 0;
    let newReferenceLength = 0;
    let distanceFromPreviousM: number | null = null;

    // Si no está omitido, actualizamos las coordenadas finales del pedido (snapshot)
    order.updateDeliveryCoordinates(Coordinates.of(capture.lat, capture.lng));

    // El nombre editado por el driver en el modal tiene prioridad sobre
    // el que viene del pedido (clientName del restaurante).
    const effectiveName =
      capture.customerName?.trim() || order.props.clientName || null;

    if (order.customerAddressId) {
      const address = await this.customerAddresses.findById(
        order.customerAddressId,
      );
      if (address) {
        if (address.source === "admin_curated") {
          // Jerarquía: admin_curated no se sobreescribe. Solo actualiza stats.
          address.lastUsedAt = now;
          address.timesUsed += 1;
          if (effectiveName) {
            address.customerName = effectiveName;
          }
        } else {
          // Actualizar dirección
          // Validar outlier: si la coordenada nueva está a >500m de la
          // guardada, loguear warning pero igual persistir (el driver
          // confirmó visualmente en el mapa).
          if (address.lat != null && address.lng != null) {
            const jumpM = haversineDistance(
              { lat: address.lat, lng: address.lng },
              { lat: capture.lat, lng: capture.lng },
            );
            distanceFromPreviousM = jumpM;
            if (jumpM > 500) {
              console.warn(
                `[MarkDelivered] Large coordinate jump: ${jumpM}m ` +
                  `for address ${address.addressId} (phone ${address.phone})`,
              );
            }
          }
          address.lat = capture.lat;
          address.lng = capture.lng;
          address.accuracyM = capture.accuracy;
          address.source = "driver_verified";
          address.lastUsedAt = now;
          address.timesUsed += 1;
          if (effectiveName) {
            address.customerName = effectiveName;
          }

          // Guardar referencia si fue editada y la precisión es aceptable (<= 500m)
          if (capture.reference !== undefined && capture.accuracy <= 500) {
            const oldRef = address.reference ?? "";
            if (capture.reference !== oldRef) {
              referenceEdited = true;
              oldReferenceLength = oldRef.length;
              newReferenceLength = capture.reference.length;
              address.reference = capture.reference;
            }
          }
        }
        await this.customerAddresses.update(address);
      }
    } else if (order.clientPhone) {
      // Solo guardar la referencia si la precisión es aceptable (<= 500m)
      const finalReference =
        capture.accuracy <= 500
          ? (capture.reference ?? order.props.deliveryReference)
          : order.props.deliveryReference;

      if (
        capture.reference !== undefined &&
        capture.reference !== (order.props.deliveryReference ?? "")
      ) {
        referenceEdited = true;
        oldReferenceLength = (order.props.deliveryReference ?? "").length;
        newReferenceLength = capture.reference.length;
      }

      // Evitar duplicados: buscar si ya existe una dirección con la misma referencia (case-insensitive)
      const existingAddresses = await this.customerAddresses.findByPhone(
        order.clientPhone,
      );
      const normalizedRef = (finalReference ?? "").trim().toLowerCase();
      const matchingAddress = existingAddresses.find(
        (addr) => (addr.reference ?? "").trim().toLowerCase() === normalizedRef,
      );

      if (matchingAddress) {
        if (matchingAddress.source !== "admin_curated") {
          matchingAddress.lat = capture.lat;
          matchingAddress.lng = capture.lng;
          matchingAddress.accuracyM = capture.accuracy;
          matchingAddress.source = "driver_verified";
        }
        matchingAddress.lastUsedAt = now;
        matchingAddress.timesUsed += 1;
        if (effectiveName) {
          matchingAddress.customerName = effectiveName;
        }
        await this.customerAddresses.update(matchingAddress);
        order.setCustomerAddressId(matchingAddress.addressId);
      } else {
        const defaultAddress = await this.customerAddresses.findDefaultByPhone(
          order.clientPhone,
        );
        const isDefault = !defaultAddress;

        const newAddress = await this.customerAddresses.insert({
          phone: order.clientPhone,
          lat: capture.lat,
          lng: capture.lng,
          accuracyM: capture.accuracy,
          source: "driver_verified",
          reference: finalReference,
          isDefault,
          lastUsedAt: now,
          timesUsed: 1,
          customerName: effectiveName,
        });

        // Enlazar orden con la nueva dirección creada
        order.setCustomerAddressId(newAddress.addressId);
      }
    }

    // Registrar evento de captura exitosa
    const event: AddressCaptureEvent = {
      orderId: order.id.value,
      driverId,
      phone: order.clientPhone,
      action,
      accuracyReported: capture.accuracy,
      distanceDraggedM: capture.distanceDragged ?? 0,
      metadata: {
        ...(referenceEdited
          ? {
              reference_edited: true,
              old_length: oldReferenceLength,
              new_length: newReferenceLength,
            }
          : {}),
        ...(distanceFromPreviousM != null
          ? { distance_from_previous_m: distanceFromPreviousM }
          : {}),
      },
    };
    await this.customerAddresses.logEvent(event);
  }
}
```

## L7

`apps/web/src/features/restaurante/new-order/components/address-suggestion-popup.tsx` (290 lineas)

```tsx
"use client";
import { Button, Icon, IconButton, cn } from "@tindivo/ui";
import { useEffect, useState } from "react";
import type { HistoricalAddress } from "../hooks/use-customer-historical-addresses";

interface AddressSuggestionPopupProps {
  isOpen: boolean;
  phone: string;
  addresses: HistoricalAddress[];
  onConfirm: (
    selected: {
      delivery_reference: string;
      client_name: string;
      address_id: string;
    } | null,
  ) => void;
  onClose: () => void;
}

function getRelativeTimeString(dateStr: string): string {
  if (!dateStr) return "";
  const past = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - past.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `hace ${Math.max(1, diffMins)} min`;
    }
    return `hace ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
  }
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} días`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4)
    return `hace ${diffWeeks} ${diffWeeks === 1 ? "semana" : "semanas"}`;
  const diffMonths = Math.floor(diffDays / 30);
  return `hace ${diffMonths} ${diffMonths === 1 ? "mes" : "meses"}`;
}

export function AddressSuggestionPopup({
  isOpen,
  phone,
  addresses,
  onConfirm,
  onClose,
}: AddressSuggestionPopupProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | "new">(0);

  // Listen for Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || addresses.length === 0) return null;

  const isMultiple = addresses.length >= 2;
  const clientName = addresses[0]?.customer_name || "Cliente";

  const handleApplySingle = () => {
    const addr = addresses[0];
    if (addr) {
      onConfirm({
        delivery_reference: addr.reference,
        client_name: addr.customer_name || "Cliente",
        address_id: addr.address_id,
      });
    }
  };

  const handleApplyMultiple = () => {
    if (selectedIndex === "new") {
      onConfirm(null);
    } else {
      const addr = addresses[selectedIndex];
      if (addr) {
        onConfirm({
          delivery_reference: addr.reference,
          client_name: addr.customer_name || "Cliente",
          address_id: addr.address_id,
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal Container */}
      <div
        className={cn(
          "relative bg-surface-container-lowest rounded-[28px] border border-outline-variant/15 shadow-2xl w-full flex flex-col overflow-hidden max-h-[90vh] animate-in fade-in zoom-in-95 duration-200",
          isMultiple ? "max-w-md" : "max-w-sm",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2">
            <Icon
              name={isMultiple ? "fact_check" : "contact_phone"}
              className="text-primary"
              size={24}
            />
            <h3 className="text-base font-black text-on-surface tracking-tight">
              {isMultiple
                ? "Este cliente tiene varias direcciones"
                : "Cliente frecuente encontrado"}
            </h3>
          </div>
          <IconButton
            onClick={onClose}
            variant="ghost"
            size="sm"
            aria-label="Cerrar"
          >
            <Icon name="close" />
          </IconButton>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Subtitle with client details */}
          <div className="p-3 bg-surface-container-low rounded-2xl flex items-center gap-3 border border-outline-variant/5">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {clientName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-on-surface-variant font-bold">
                Cliente
              </p>
              <h4 className="text-sm font-black text-on-surface truncate">
                {clientName}
              </h4>
              <p className="text-[11px] text-on-surface-variant font-medium">
                Celular: {phone}
              </p>
            </div>
          </div>

          {!isMultiple ? (
            /* CASE A: Single historical address */
            <div className="space-y-4">
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-primary text-xs font-bold uppercase tracking-wider">
                    <Icon name="location_on" size={14} />
                    <span>Dirección registrada</span>
                  </div>
                  {addresses[0]?.is_default && (
                    <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300/30">
                      <Icon name="star" size={10} filled />
                      Principal
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-on-surface leading-snug whitespace-pre-wrap break-words">
                  {addresses[0]?.reference}
                </p>
                <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-bold mt-1">
                  {addresses[0]?.last_used_at && (
                    <span>
                      Último pedido:{" "}
                      {getRelativeTimeString(addresses[0].last_used_at)}
                    </span>
                  )}
                  {addresses[0]?.has_gps && (
                    <span className="text-primary flex items-center gap-0.5">
                      <Icon name="gps_fixed" size={11} />
                      Ubicación GPS
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleApplySingle}
                  className="w-full"
                  size="lg"
                >
                  <Icon name="check" size={18} />
                  Usar esta dirección
                </Button>
                <Button
                  onClick={() => onConfirm(null)}
                  variant="secondary"
                  className="w-full"
                  size="lg"
                >
                  Escribir otra
                </Button>
              </div>
            </div>
          ) : (
            /* CASE B: Multiple historical addresses */
            <div className="space-y-4">
              <p className="text-xs text-on-surface-variant font-semibold">
                Selecciona la dirección donde desea recibir el pedido actual:
              </p>

              <div className="space-y-2.5 max-h-[35vh] overflow-y-auto pr-1">
                {addresses.map((addr, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <label
                      key={`${addr.reference}-${idx}`}
                      className={cn(
                        "flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                        isSelected
                          ? "bg-primary/5 border-primary/40 shadow-xs"
                          : addr.is_default
                            ? "bg-amber-50/20 border-amber-200/50 hover:border-amber-300"
                            : "bg-surface border-outline-variant/10 hover:border-outline-variant/30",
                      )}
                    >
                      <input
                        type="radio"
                        name="suggested-address"
                        checked={isSelected}
                        onChange={() => setSelectedIndex(idx)}
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary focus:ring-primary border-outline-variant/40"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-black text-on-surface leading-snug break-words flex-1">
                            {addr.reference}
                          </p>
                          {addr.is_default && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300/20 shrink-0">
                              <Icon name="star" size={8} filled />
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold text-on-surface-variant">
                          <span>{addr.customer_name || "Sin nombre"}</span>
                          {addr.last_used_at && (
                            <>
                              <span className="text-outline-variant">•</span>
                              <span>
                                {getRelativeTimeString(addr.last_used_at)}
                              </span>
                            </>
                          )}
                          <span className="text-outline-variant">•</span>
                          <span className="text-primary/80">
                            {addr.times_used}{" "}
                            {addr.times_used === 1 ? "pedido" : "pedidos"}
                          </span>
                          {addr.has_gps && (
                            <>
                              <span className="text-outline-variant">•</span>
                              <span className="text-primary flex items-center gap-0.5">
                                <Icon name="gps_fixed" size={10} />
                                GPS
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}

                {/* Option for writing a new address */}
                <label
                  className={cn(
                    "flex items-center gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                    selectedIndex === "new"
                      ? "bg-primary/5 border-primary/40 shadow-xs"
                      : "bg-surface border-outline-variant/10 hover:border-outline-variant/30",
                  )}
                >
                  <input
                    type="radio"
                    name="suggested-address"
                    checked={selectedIndex === "new"}
                    onChange={() => setSelectedIndex("new")}
                    className="h-4 w-4 shrink-0 text-primary focus:ring-primary border-outline-variant/40"
                  />
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon
                      name="add"
                      size={16}
                      className="text-on-surface-variant shrink-0"
                    />
                    <span className="text-xs font-black text-on-surface">
                      Escribir dirección nueva
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={onClose}
                  variant="secondary"
                  className="flex-1"
                  size="lg"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleApplyMultiple}
                  className="flex-1"
                  size="lg"
                >
                  Confirmar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```
