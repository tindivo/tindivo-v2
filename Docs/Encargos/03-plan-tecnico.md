# 03 · Plan técnico de Tindivo Entregas

> **v1.0 · 2026-09-19.** Sustituye a la versión anterior (`historico-pre-v2/` (borrado; en git: `8f26aed`)). Basado en el repo al 2026-09-19: migraciones hasta la `0228` (**la siguiente libre es la `0229`**; comprobar con `supabase migration list`), `DECISIONS.md`, y las apps `customer`, `motorizados`, `admin` y `api`.
> **Nada de esto está construido.**
>
> **Superado en nombres (2026-09-22, `DECISIONS.md §31`):** el spec v1 de
> Jesús (`Tindivo — Catálogo de negocios y Encargos (spec v1).md`, 21/22-sep)
> resolvió `courier_orders`/`directory_businesses` en vez de
> `courier_requests`/`catalog_places` de este documento, y esos son los
> nombres que se construyeron. El resto —fases, RLS, riesgos, `driver_payment_qrs`,
> el patrón de `map_landmarks`— sigue siendo referencia válida para lo que
> falta (lado motorizado/admin).

---

## 1. Decisiones de fondo

### 1.1 Nombre técnico: `courier`

El nombre público es **«Tindivo Entregas»**; el interno es **`courier`**, en inglés (convención del repo: código y base de datos en inglés). **No** `recojo` (los documentos de Jesús lo proponían): «recojo» ya aparece **126 veces en 26 archivos** de `apps/customer` con el sentido de *recojo en tienda* (`pickup`), y una tabla `recojos` junto a `pickup` es un error a punto de suceder. **Tampoco** `delivery` (choca con `delivery_method`, `delivery_fee`, `delivery_address` de los pedidos) **ni** `errands` (sugiere compras). Es un cambio solo de nombres, reversible.

| Cosa | Nombre |
|---|---|
| Tabla principal | `courier_requests` |
| Enum de estado | `courier_status` |
| Eventos / historial | `courier_request_events` |
| Rendiciones | `courier_remittances`; condonaciones `courier_debt_waivers` |
| Método de cobro del motorizado | `driver_payment_qrs` |
| Directorio de negocios | `catalog_places` |
| Eventos de medición | `funnel_events` |
| Configuración | `app_settings.courier` y `app_settings.timers.courier*` |
| RPC | `create_courier_request`, `advance_courier_request`, `expire_courier_requests` |
| Carpeta de código | `features/courier/` |

### 1.2 Tabla propia, no `orders`

- `orders.business_id` es **`NOT NULL`** y todo el agregado gira en torno a un negocio (aceptación, prepago, cocina, comisión, `ord_driver_read`).
- **Ocho funciones escriben `orders.status`** y `CLAUDE.md` (invariante 8) documenta que se verificaron una por una para garantizar que `delivered` es terminal.
- Los estados no encajan (`01` §7), y `DECISIONS §5` ya explicó qué pasa cuando se reutiliza un estado con otro significado.
- Reglas de dinero distintas (`02`).

Se **reutiliza la infraestructura**, no el agregado:

| Pieza | Dónde vive hoy |
|---|---|
| Motorizados y disponibilidad | `drivers`, `driver_availability` |
| Usuarios, roles, JWT | `users`, `user_roles` |
| Celular verificado, dirección por defecto | `customer_profiles` |
| Mapa y selector de punto | `apps/customer/components/map-picker.tsx`, `location-sheet.tsx`, `lib/geolocation.ts` |
| Polígono de cobertura | `app_settings.coverage_polygon` |
| Push | `send-push`, `push_subscriptions` |
| Tiempo real | Supabase Realtime + `canalUnico(...)` |
| Idempotencia | `Idempotency-Key` + `apps/api/lib/http/idempotency.ts` |
| Patrón de QR de cobro | `business_payment_qrs` (`0184`) y `PaymentQrInput` |
| Rendición con auto-confirmación 24 h | Lógica de `cash_settlements` (copiada, no compartida) |
| Patrón del directorio | `map_landmarks` (`0208`): RLS, caja de sanidad geográfica, hoja de edición móvil |

**No se toca:** `orders`, `advance_order`, `create_customer_order`, `cash_settlements`, `business_charges`, las colas de `waiting_driver`.

### 1.3 Distancia: Haversine, y ya existe dos veces

Sí se puede sin dependencias nuevas: `apps/customer/lib/coverage.ts` (`haversineKm`) y `apps/motorizados/lib/geo.ts` ya la tienen, y Leaflet 1.9.4 trae `latlng.distanceTo(otro)` (metros, línea recta). Leaflet **no traza rutas**. Esto sería el **tercer** uso: regla del repo, extraer con 3+ usos → **una función pura en `packages/contracts`**, que usa `create_courier_request` en el servidor. Se **guarda** en `distance_m`; hoy no decide el precio.

---

## 2. Configuración y plazos

Todo parte **apagado**. `app_settings.courier`:

```jsonc
{
  "enabled": false,
  "pricing": { "basePrice": 3.00, "tiers": [] },      // S/ 3 fijo; `tiers` por distancia, vacío
  "hours": { "start": "18:00", "end": "23:00" },      // todos los días
  "pausedMessage": "Tindivo Entregas no está disponible ahora.",
  "maxWeightKg": 5,
  "maxActivePerPhone": 1,
  "departureTravelMin": 5,                            // «hora sugerida de salida» = listo − traslado
  "promoFirstUse": { "active": false, "price": 1.50, "userCap": 30, "days": ["mon","tue","wed","thu"] }
}
```

**Los plazos NO viven ahí.** `DECISIONS §10` fija que salen de `app_settings.timers`: se añaden `timers.courierAcceptMinutes` (**15**, decidido por Jesús) y `timers.courierWaitMinutes` (**5**), y los aplica `expire_courier_requests()` desde un cron por minuto, como `cancel_expired_prepay_orders()` con la aceptación del negocio (`acceptanceMinutes`, hoy 8 desde la `0186`).

**Disponibilidad:** el servicio se ofrece si `enabled` **y** está en horario **y** hay ≥ 1 motorizado con `driver_availability.is_available`. Fuera de eso, `create_courier_request` responde **409 con motivo** (patrón de `DECISIONS §19`).

---

## 3. Modelo de datos

Convenciones: dinero `numeric(10,2)`, coordenadas `numeric(10,7)`, RLS en **todas** las tablas, migraciones idempotentes.

### `courier_requests`

| Grupo | Columnas |
|---|---|
| Identidad | `id`, `request_number` (secuencia atómica, nunca `Date.now()`), `short_id` (mismo alfabeto de 8 caracteres, validado solo al **crear**) |
| Tipo | `kind` (`business` \| `person`), `place_id` (null; `catalog_places` o `businesses`) |
| Solicitante | `customer_user_id`, `requester_name`, `requester_phone` |
| Punto A | `pickup_lat/lng`, `pickup_reference`, `pickup_contact_name`, `pickup_contact_phone` |
| Punto B | `dropoff_lat/lng`, `dropoff_reference`, `dropoff_contact_name`, `dropoff_contact_phone`, `driver_hint` (indicaciones ≤ 140) |
| Contenido | `description` (≤ 120, **sin foto**), `on_behalf_of` (null), `fragile`, `prepaid_confirmed` |
| Hora | `ready_in_min`, `ready_at` (calculado al pedir) |
| Dinero | `payer` (`sender_at_pickup` \| `receiver_at_dropoff`), `price` (snapshot), `distance_m`, `payment_method` (`cash` \| `yape`, lo marca el motorizado), `transport_collected_at`, `promo_applied` |
| Estado | `status` (`courier_status`), `driver_id`, `accepted_at`, `departed_at`, `arrived_at`, `picked_up_at`, `delivered_at`, `cancelled_at`, `cancel_reason` |
| Origen | `origin` (`?src=`) |
| Evidencia | `dropoff_photo_url` (nullable, **preparada, sin pantalla en v1**, `06` B-13) |

**`courier_status`:** `requested`, `accepted`, `heading_to_pickup`, `at_pickup`, `picked_up`, `heading_to_dropoff`, `delivered`, `cancelled`. **`cancel_reason`:** `no_driver`, `driver_rejected`, `not_ready`, `transport_unpaid`, `customer_cancelled`, `unreachable`, `other`. Fuente única en `packages/contracts`, con test de *drift* contra el esquema generado (`enum-drift.ts`).

### Tablas de apoyo

| Tabla | Para qué |
|---|---|
| `courier_request_events` | Historial inmutable de transiciones y auditoría (actor, datos) |
| `courier_remittances` | Rendición del motorizado a Tindivo: `driver_id`, `method`, `declared_amount`, `confirmed_amount`, `status`, `confirmed_by`, `dispute_note`. Parciales |
| `courier_debt_waivers` | Condonaciones del admin (`request_id`, `note`, `waived_by`) |
| `driver_payment_qrs` | Método de cobro **del motorizado**; esquema de `business_payment_qrs` con `driver_id`; **precargado por Jesús** (`admin/drivers/[id]/payment-qrs`). Sin él no puede aceptar |
| `catalog_places` | Directorio de negocios (`08` §12) |
| `funnel_events` | Eventos de medición, escritos **por una ruta del API** (`anon` no inserta directo) |

**La deuda no se guarda: se deriva.** `debt(driver) = Σ price de courier_requests delivered − Σ confirmed_amount de sus rendiciones − Σ condonaciones`. Igual que `balance_due` desde la `0124`: **una columna mantenida a mano es un saldo que se descuadra.**

### RLS

- **Cliente:** ve y crea solo lo suyo, **solo por API/RPC**.
- **Motorizado:** ve los `requested` con columnas limitadas (vista/API, no `select *`) y el detalle completo **solo de los suyos**. No escribe `status`.
- **Admin:** lectura y operación total. `anon`: nada. Helpers `SECURITY DEFINER` con `SET search_path = ''`.

---

## 4. RPC y rutas

### RPC (`service_role`)

| RPC | Hace |
|---|---|
| `create_courier_request` | Valida horario, disponibilidad, `maxActivePerPhone`, cobertura de **A y B**, calcula `distance_m`, **lee el precio de `app_settings`**, emite evento. Idempotente |
| `advance_courier_request` | Acciones: `accept`, `reject`, `release`, `depart`, `arrive`, `collect_transport`, `pick_up`, `deliver`, `cancel`, `report_problem`. Cada transición: evento **en la misma transacción**. `accept` es **una sola sentencia** condicionada a `status='requested' and driver_id is null` (la carrera se resuelve en la base) y exige que el motorizado tenga `driver_payment_qrs`. **Guardas de cobro:** `pick_up` exige `transport_collected_at` si `payer='sender_at_pickup'`; `deliver` lo exige si `payer='receiver_at_dropoff'`. `release` devuelve a `requested` **sin reiniciar el reloj** |
| `expire_courier_requests` | Cron por minuto: `requested` más viejo que `timers.courierAcceptMinutes` → `cancelled/no_driver`. Idempotente |
| Rendición | `create_courier_remittance`, `confirm_…`, `dispute_…`, `resolve_…`, `waive_courier_debt` |

### Rutas (`apps/api`, `/api/v1`)

```
customer/courier-requests           POST, GET
customer/courier-requests/[id]      GET
customer/courier-requests/[id]/cancel POST
public/courier/status               GET  { enabled, open_now, price, hours }
public/courier/[shortId]            GET  (seguimiento, campos mínimos)
public/places                       GET  (directorio: catalog_places + businesses con perfil)
driver/courier-requests             GET  (disponibles + míos)
driver/courier-requests/[id]        GET  (detalle completo solo si es suyo)
driver/courier-requests/[id]/transition POST
driver/payment-qrs                  GET  (su método de cobro)
driver/courier-debt                 GET
driver/courier-remittances          POST
admin/courier-requests, …/[id]/cancel, admin/courier-settings, admin/courier-remittances(+resolve), admin/courier-debt(+waive)
admin/places, admin/drivers/[id]/payment-qrs
events                              POST (funnel_events)
```

Sin Server Actions ni BFF (Capacitor-ready); Zod en los límites (`packages/contracts`).

---

## 5. Frontend

| App | Qué se añade |
|---|---|
| **`customer`** | `features/courier/`: la **hoja de pedido** (`01` §5, `08` §3) sobre el mapa, «solicitado» con contador de 15 min, seguimiento con Realtime, `tindivo.com/r/<slug>` y `/entregas`. **Un almacén global y un anfitrión de la hoja montado en el layout** (patrón de `auth-onboarding/host.tsx`), para abrirla desde cualquier página sin que una feature importe otra. **Ojo:** `lib/active-orders.ts` cuenta solo `orders`; el badge de `BottomNav`, el banner del home, la ficha del negocio y `/cuenta` deben **sumar las entregas activas** sin romper el bloqueo «un pedido activo por restaurante» (**un cliente puede tener a la vez una entrega y un pedido a un restaurante**; «Pedidos» los lista juntos, con etiqueta). El `customer` carga Material Symbols completo desde Google Fonts: **la regla del subset de iconos no aplica ahí** |
| **`motorizados`** | **Un solo panel:** las entregas entran en `available-tab` y `mine-tab` (`components/home/`) mezcladas con los pedidos. Tipo unión `kind: 'order' \| 'courier'` sobre `hooks/use-driver-orders.ts`, una `courier-card` junto a `order-card` con insignia **«ENTREGA» azul** (sin franja de papelito), detalle con acciones, cobro (**su** QR / efectivo exacto), reporte de problema, soltar; en **Efectivo**, una sección con la deuda entrega por entrega y la rendición |
| **`admin`** | Ajustes (interruptor, precio, mensaje de pausa), **directorio de negocios** (hoja móvil), método de cobro de cada motorizado, rendiciones y condonaciones, lista en vivo. *(El panel del admin se trabaja después; no hay avisos al admin por ahora.)* |
| **`negocios`** | Nada |

**Regla de iconos (invariante 9):** `motorizados` y `negocios` usan un **subset cerrado** de Material Symbols (`apps/motorizados/public/fonts/icons.txt`). Comprobado: existen `two_wheeler`, `inventory_2`, `pin_drop`, `flag`, `qr_code_2`, `payments`, `call`, `chat`, `schedule`, `photo_camera`, `local_shipping`; **no existe `package_2`**. Un icono ausente **no falla TypeScript ni lint**: aparece como texto roto.

---

## 6. Push

Se añade a la **lista blanca explícita** de `dispatch_event` (`DECISIONS §25`) y a las ramas de `send-push`; tag = `${event_type}-${shortId}` (invariante 5).

| Momento | Destinatario |
|---|---|
| Nueva solicitud | Todos los motorizados |
| Aceptada · en camino · recogida · entregada · sin motorizado | Cliente |
| Rendición declarada · confirmada / con diferencia | Admin · motorizado |

**Riesgo conocido:** `dispatch_event` es `net.http_post` a fondo perdido; si falla, el aviso se pierde. Como el aviso al motorizado es lo que hace que el servicio exista, la app **suscribe Realtime y hace polling** de las solicitudes `requested`.

---

## 7. Invariantes que aplican

- [ ] RLS en **todas** las tablas nuevas, con policies explícitas (`CLAUDE.md` #3).
- [ ] `short_id` validado solo al **crear** (#1); `request_number` desde secuencia (#2).
- [ ] Evento en la **misma transacción** que el cambio (#4); tag de push con `event_type` (#5).
- [ ] Migraciones idempotentes, **solo por CLI de Supabase**; después `pnpm db:types` y advisors. Tras `supabase db reset`, `pnpm db:seed:e2e`.
- [ ] Multi-rol respetado. Zod v4, TypeScript estricto, Biome. Iconos verificados contra `icons.txt`.
- [ ] Commits **en español con tilde**, desde fichero UTF-8 (`git commit -F`). `pnpm graphify:update` al terminar código.
- [ ] Tests **primero** en dinero y estados: guardas de cobro por `payer`, carrera de `accept`, deuda derivada, rendición parcial, `maxActivePerPhone`.

---

## 8. Fases

Combinan este plan con el orden de `origen-jesus-v2/00` §7. **Cada fase pide aprobación de Jesús** (regla del repo).

| Fase | Contenido | Sale cuando |
|---|---|---|
| **0** | `DECISIONS.md §29` con lo decidido (y notas en §4 y §7 sobre «no retiene fondos») | Jesús aprueba |
| **1 · Núcleo** | Migración `0229+`: tablas, enums, RLS, RPC, cron, configuración, `driver_payment_qrs`. Contratos Zod. Tests | Verde en local |
| **2 · Cliente y motorizado** | Hoja de pedido (mapa, un bloque por paso), «solicitado» 15 min, seguimiento; panel único etiquetado; cobro y deuda | Una entrega completa con dos celulares |
| **3 · Buscador de negocios** | `catalog_places` + hoja de alta móvil en el admin, ~10 negocios a mano; los negocios con perfil aparecen solos; sin mapa aún | Se puede pedir eligiendo un negocio |
| **4 · Entradas y eventos** | Botón en la ficha del negocio, aviso post-«Llamar», tarjeta en el home, `funnel_events` con `?src=` | Se puede medir el embudo |
| **5 · Kit y adquisición** | `/r/<slug>`, QR por negocio, kit para negocios | Jesús visita negocios |
| **6 · Mapa del catálogo** | Modo `catalogo` (aliados naranja, otros gris, moto azul) y filtros | — |
| **7 · Promo y página pública** | Promo de primer uso; «Negocios de San Jacinto» | Flujo estable |
| **Antes de imprimir el afiche** | Una semana de prueba real | Ver `09` §3.9 |

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Dinero de Tindivo en el Yape personal del motorizado; posible límite o bloqueo de Yape (**no verificado**) | Deuda derivada de las entregas, no de lo que declare; comprobar las condiciones de Yape antes del piloto |
| Nadie paga en B | El artículo no se entrega sin cobrar; cancela con `transport_unpaid` |
| Un solo motorizado entre semana; entregas frente a comida | Panel único; pedidos de restaurante primero; el motorizado puede rechazar; el servicio se pausa solo sin motorizado |
| El aviso al motorizado se pierde | Realtime + polling |
| Cancelaciones por `not_ready` (sin recargos) | Se mide desde el día 1; interruptor listo para reintroducir un costo (`02` §6) |
| Alcance que crece | Backlog (`06`) |
| Demanda no validada | Piloto acotado, una semana antes de imprimir, criterios de `origen-jesus-v2/05` §7 |
