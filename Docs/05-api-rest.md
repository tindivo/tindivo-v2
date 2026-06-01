# 05 · API REST

> Endpoints completos del API único `api.tindivo.com`. Convenciones, autenticación, idempotencia, CORS, errores. Agrupados por consumidor (público, customer, business, driver, admin, internal). Schemas referenciados desde `packages/contracts`.

---

## Tabla de contenidos

- [1. Convenciones generales](#1-convenciones-generales)
- [2. Autenticación](#2-autenticación)
- [3. Idempotencia](#3-idempotencia)
- [4. Errores · RFC 9457 Problem Details](#4-errores--rfc-9457-problem-details)
- [5. CORS](#5-cors)
- [6. Paginación](#6-paginación)
- [7. Endpoints públicos](#7-endpoints-públicos)
- [8. Endpoints customer](#8-endpoints-customer)
- [9. Endpoints business](#9-endpoints-business)
- [10. Endpoints driver](#10-endpoints-driver)
- [11. Endpoints admin](#11-endpoints-admin)
- [12. Endpoints internos](#12-endpoints-internos)
- [13. Endpoint Inngest](#13-endpoint-inngest)
- [14. Health checks](#14-health-checks)

---

## 1. Convenciones generales

- **Base URL**: `https://api.tindivo.com/api/v1/`
- **Content-Type**: `application/json` (excepto upload de archivos: `multipart/form-data`).
- **Timestamps**: ISO 8601 UTC (e.g., `2026-05-23T18:30:00.000Z`). El cliente convierte a `America/Lima` al display.
- **Money**: número decimal con 2 decimales (e.g., `25.50`). PEN implícito.
- **IDs**: UUID v4 en URL params (`/orders/{id}`). ShortIds (8 chars) en queries (`/tracking/{shortId}`).
- **Respuestas exitosas**: 200 / 201 / 204. Estructura: `{ data: ... }` para objetos, `{ items: [...], total, cursor? }` para listas. Excepción documentada: tracking público es directo (sin envoltura).
- **Versionado**: `/api/v1/`. Breaking changes → `/api/v2/`. Deprecaciones con 6 meses de aviso.
- **Request ID**: header `X-Request-Id` (cliente lo manda o servidor lo genera) propagado en logs.

---

## 2. Autenticación

### Mecanismo

Supabase Auth + JWT. El cliente almacena el JWT en cookies httpOnly (gestión automática por `@supabase/ssr`). Cada request lleva:

```
Authorization: Bearer <jwt>
Cookie: sb-access-token=<jwt>; sb-refresh-token=<refresh>
```

### Validación en el servidor

```ts
// apps/api/lib/http/require-auth.ts
import { createServerClient } from '@supabase/ssr'

export async function requireAuth(roles?: UserRole | UserRole[]) {
  const supabase = createServerClient(/* ... */)
  const { data: { user }, error } = await supabase.auth.getUser()

  if (!user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'No has iniciado sesión')
  }

  const userRoles = user.app_metadata?.user_roles as UserRole[] || []
  if (roles) {
    const required = Array.isArray(roles) ? roles : [roles]
    const ok = required.some(r => userRoles.includes(r))
    if (!ok) {
      throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para esta acción')
    }
  }

  return {
    user,
    userId: user.id,
    roles: userRoles,
    businessId: user.app_metadata?.business_id as string | undefined,
    driverId: user.app_metadata?.driver_id as string | undefined,
  }
}
```

### Login

NO hay endpoint `/login` en el REST. El cliente llama directo a Supabase Auth:

```ts
const supabase = supabaseBrowser()
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
```

### Logout

Cliente usa helper:

```ts
import { signOutLocal } from '@tindivo/supabase'
await signOutLocal()
```

NUNCA `supabase.auth.signOut()` directo (cerraría todas las sesiones del usuario en todos los dispositivos).

### Roles

`user.app_metadata.user_roles` es un array (`['customer', 'business']`). Permite multi-rol. Si un endpoint requiere `business`, el user debe tener `business` en el array.

---

## 3. Idempotencia

### Cliente

```ts
import { useIdempotencyKey } from '@tindivo/api-client/hooks'

const idem = useIdempotencyKey('business:new-order')

mutation.mutate(
  { body, idempotencyKey: idem.key },
  {
    onSuccess: () => idem.consume(),
    onError: (e) => { if (e.status >= 400 && e.status < 500) idem.consume() },
  }
)
```

### Servidor

```ts
// En el handler de un POST
return withIdempotency(req, 'business_orders', body.data, admin, async () => {
  // ... lógica del endpoint
  return NextResponse.json(result, { status: 201 })
})
```

### Reglas

- Sin header `Idempotency-Key` → ejecuta normal (back-compat).
- Con key + mismo body + status `completed` → respuesta cacheada.
- Con key + body distinto → 409 `IDEMPOTENCY_KEY_MISMATCH`.
- Con key + status `reserved` → polling 150ms × 200 = 30s max.
- 5xx libera placeholder; 2xx/4xx <500 cachean.
- TTL 24h.
- Header `Idempotency-Key` debe estar en `Access-Control-Allow-Headers` del middleware CORS.

---

## 4. Errores · RFC 9457 Problem Details

```http
Content-Type: application/problem+json

{
  "type": "https://tindivo.com/errors/order-already-accepted",
  "title": "Pedido ya aceptado",
  "status": 409,
  "code": "ORDER_ALREADY_ACCEPTED",
  "detail": "Este pedido ya fue aceptado por otro motorizado",
  "requestId": "8f3c1b9e-7d4a-4f2b-9c8d-1e2f3a4b5c6d",
  "errors": []
}
```

### Códigos de error principales

| HTTP | Code | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body no pasa schema Zod. `errors[]` con field errors |
| 401 | `UNAUTHENTICATED` | Sin JWT o JWT inválido |
| 403 | `FORBIDDEN` | Sin permisos / cuenta bloqueada |
| 403 | `OUT_OF_OPERATING_HOURS` | Acción fuera de horario operativo |
| 404 | `NOT_FOUND` | Recurso no existe (o RLS lo oculta) |
| 409 | `IDEMPOTENCY_KEY_MISMATCH` | Misma key, body distinto |
| 409 | `ORDER_ALREADY_ACCEPTED` | Race condition aceptación |
| 409 | `DRIVER_AT_CAPACITY` | Driver al límite mochila |
| 409 | `INVALID_STATE_TRANSITION` | Estado actual no permite la acción |
| 422 | `BUSINESS_RULE_VIOLATION` | Regla de negocio (e.g., suma yape+cash ≠ total) |
| 429 | `RATE_LIMITED` | Rate limit excedido |
| 500 | `INTERNAL_ERROR` | Bug del servidor |

### Helpers

```ts
// apps/api/lib/http/problem.ts
export function problemResponse(
  status: number,
  code: string,
  detail: string,
  errors: FieldError[] = []
) {
  return new Response(JSON.stringify({
    type: `https://tindivo.com/errors/${code.toLowerCase().replace(/_/g,'-')}`,
    title: TITLES[code],
    status,
    code,
    detail,
    requestId: getRequestId(),
    errors,
  }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}
```

---

## 5. CORS

```ts
// apps/api/middleware.ts
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') || ''
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
    origin.match(/^https?:\/\/localhost:\d+$/)

  if (req.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin, isAllowed),
    })
  }

  const res = NextResponse.next()
  res.headers.set('Access-Control-Allow-Origin', isAllowed ? origin : '')
  res.headers.set('Vary', 'Origin')
  return res
}

function corsHeaders(origin: string, allowed: boolean) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}
```

### Orígenes permitidos por defecto

```
https://tindivo.com
https://www.tindivo.com
https://admin.tindivo.com
https://negocios.tindivo.com
https://motorizados.tindivo.com
http://localhost:3000
http://localhost:3002
http://localhost:3003
http://localhost:3004
```

---

## 6. Paginación

Cursor-based. Sin `OFFSET`.

### Request

```
GET /api/v1/admin/orders?limit=50&cursor=<cursor>
```

### Response

```json
{
  "items": [...],
  "total": 153,
  "nextCursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wNS0yM1QxODowMDowMC4wMDBaIiwiaWQiOiJhYmMifQ=="
}
```

`nextCursor` es un base64 de `{ created_at, id }` para usar en el siguiente request. Si `nextCursor` está ausente, no hay más páginas.

---

## 7. Endpoints públicos

Sin autenticación. Origen permitido: `tindivo.com`, `www.tindivo.com`.

### `GET /health`

Health check.

**Response 200**:
```json
{ "status": "ok", "service": "api", "timestamp": "2026-05-23T18:30:00.000Z" }
```

### `GET /platform-status`

Estado operativo (abierto / cerrado, horarios).

**Response 200**:
```json
{
  "isOpen": true,
  "schedule": {
    "days": ["tue","wed","thu","fri","sat"],
    "startHHMM": "18:00",
    "endHHMM": "23:00"
  },
  "nextOpenAt": null,
  "message": null
}
```

### `GET /public/businesses`

Lista de negocios con catálogo publicado.

**Query**: `?location_lat=&location_lng=&radius_km=5`

**Response 200**:
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Priamo",
      "tagline": "Pizzería · Hamburguesería · San Jacinto",
      "address": "Jr. Bolognesi 245",
      "logoUrl": "https://...",
      "bannerUrl": "https://...",
      "accentColor": "f97316",
      "estimatedEtaMinMin": 25,
      "estimatedEtaMinMax": 35,
      "deliveryFee": 2.00,
      "status": "active",
      "badges": ["más-pedido"]
    }
  ]
}
```

### `GET /public/businesses/{id}/menu`

Menú completo de un negocio.

**Response 200**:
```json
{
  "data": {
    "businessId": "uuid",
    "categories": [
      {
        "id": "uuid",
        "name": "Pizzas",
        "blurb": "Masa madre, 24h de fermentación",
        "items": [
          {
            "id": "uuid",
            "name": "Margarita",
            "description": "...",
            "basePrice": 28.00,
            "imageUrl": "...",
            "imageHue": 12,
            "badges": ["más-pedido"],
            "modifierGroups": [
              {
                "id": "uuid",
                "name": "Tamaño",
                "selectionType": "single",
                "isRequired": true,
                "minSelections": 1,
                "maxSelections": 1,
                "options": [
                  { "id": "uuid", "name": "Personal", "additionalPrice": 0.00 },
                  { "id": "uuid", "name": "Familiar", "additionalPrice": 8.00 },
                  { "id": "uuid", "name": "Jumbo", "additionalPrice": 16.00 }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

### `GET /tracking/{shortId}`

Info pública del pedido para tracking. Llama RPC `get_tracking(shortId)` con SECURITY DEFINER.

**Response 200**:
```json
{
  "shortId": "ABC12345",
  "businessName": "Priamo",
  "status": "picked_up",
  "estimatedReadyAt": "2026-05-23T19:15:00.000Z",
  "deliveredAt": null,
  "driverName": "Carlos R.",
  "customerName": "María",
  "amount": 45.00,
  "deliveryFee": 2.00
}
```

**Errores**:
- 404 si no existe o `delivered_at > 24h`.

**Realtime**: el cliente complementa con suscripción Supabase Realtime al canal `tracking:${shortId}`.

### `POST /public/customer-auth/register`

Registro de cliente final.

**Request**:
```json
{
  "email": "maria@example.com",
  "password": "...",
  "fullName": "María Pérez",
  "phone": "987654321"
}
```

**Response 201**:
```json
{
  "data": {
    "userId": "uuid",
    "email": "maria@example.com"
  }
}
```

**Notas**:
- Crea `auth.users` + sync vía trigger a `public.users` con `primary_role='customer'`.
- Email único.
- Password mín 6 caracteres.
- Sin verificación email en MVP.

### `POST /public/customer-orders`

Crea pedido como cliente final. Requiere auth si el cliente está logueado, sino crea como "guest" (rar). En MVP **siempre logueado al checkout**.

**Request** (con auth):
```json
{
  "businessId": "uuid",
  "deliveryMethod": "delivery",
  "addressId": "uuid",                  // o coordinates + reference inline
  "items": [
    {
      "menuItemId": "uuid",
      "quantity": 2,
      "modifiers": [
        { "groupId": "uuid", "optionId": "uuid" }
      ],
      "note": "Sin cebolla"
    }
  ],
  "paymentStatus": "pending_cash",
  "clientPaysWith": 50.00,
  "customerNotes": "Tocar timbre 2 veces"
}
```

**Response 201**:
```json
{
  "data": {
    "orderId": "uuid",
    "shortId": "ABC12345",
    "status": "pending_acceptance",
    "estimatedReadyAt": "2026-05-23T19:25:00.000Z",
    "trackingUrl": "https://tindivo.com/pedidos/ABC12345"
  }
}
```

**Acciones internas**:
- Inserta `orders` con `source='customer_pwa'`, status `pending_acceptance`.
- Inserta `customer_order_items` y `customer_order_item_modifiers`.
- Emite `OrderCreatedAsPendingAcceptance` en `domain_events`.
- Inngest programa `auto-cancel-pending` a +5min.
- Push al negocio: "Nuevo pedido recibido".

**Errores**:
- 403 `OUT_OF_OPERATING_HOURS`.
- 403 si business está bloqueado.
- 422 si items inválidos o suma de precios no cuadra.

---

## 8. Endpoints customer

Auth: rol `customer`.

### `GET /customer/profile`

```json
{
  "data": {
    "fullName": "María Pérez",
    "phone": "987654321",
    "email": "maria@example.com",
    "defaultAddress": "Jr. Sucre 412",
    "addresses": [...]
  }
}
```

### `PATCH /customer/profile`

Update parcial de campos editables.

### `GET /customer/addresses`

Lista de direcciones del cliente.

### `POST /customer/addresses`

Crea dirección nueva.

```json
{
  "label": "Casa",
  "line": "Jr. Sucre 412",
  "reference": "Frente al grifo azul",
  "coordinates": { "lat": -9.1547, "lng": -78.5042 },
  "isDefault": false
}
```

### `PATCH /customer/addresses/{id}`

Edita dirección.

### `DELETE /customer/addresses/{id}`

Elimina dirección. Si era default, promueve la primera restante.

### `GET /customer/orders`

Historial del cliente con paginación.

### `GET /customer/orders/{shortId}`

Detalle del pedido (más info que `/tracking/{shortId}`).

### `POST /customer/orders/{shortId}/cancel`

Cancela pedido si está en `pending_acceptance` o `waiting_driver`.

### `POST /push/subscribe`

Registra push subscription.

```json
{
  "endpoint": "...",
  "keys": { "p256dh": "...", "auth": "..." }
}
```

### `DELETE /push/unsubscribe`

Elimina subscription.

---

## 9. Endpoints business

Auth: rol `business`.

### Profile y perfil del negocio

| Method | Path | Propósito |
|---|---|---|
| GET | `/business/profile` | Datos del negocio + capacidades |
| PATCH | `/business/profile` | Actualiza nombre, phone, ETA, fee, etc. |
| PATCH | `/business/capabilities` | Actualiza flags `publishes_catalog`, `accepts_web_pickup`, `accepts_web_delivery`, `uses_tindivo_drivers`. `primary_capability` se deriva automático en BD (trigger). Valida constraints. |
| POST | `/business/profile/logo` | Upload logo (multipart) |
| POST | `/business/profile/qr` | Upload QR Yape |

### Catálogo (menú)

| Method | Path | Propósito |
|---|---|---|
| GET | `/business/menu` | Árbol completo del menú |
| POST | `/business/menu/categories` | Crea categoría |
| PATCH | `/business/menu/categories/{id}` | Edita |
| DELETE | `/business/menu/categories/{id}` | Borra (cascade items) |
| POST | `/business/menu/categories/{id}/reorder` | Reordena items dentro de la categoría |
| POST | `/business/menu/items` | Crea item |
| PATCH | `/business/menu/items/{id}` | Edita |
| DELETE | `/business/menu/items/{id}` | Borra |
| POST | `/business/menu/items/{id}/image` | Upload imagen |
| POST | `/business/menu/modifier-groups` | Crea grupo |
| PATCH | `/business/menu/modifier-groups/{id}` | Edita |
| DELETE | `/business/menu/modifier-groups/{id}` | Borra |
| POST | `/business/menu/modifier-options` | Crea opción |
| PATCH | `/business/menu/modifier-options/{id}` | Edita |
| DELETE | `/business/menu/modifier-options/{id}` | Borra |

### Pedidos

| Method | Path | Propósito |
|---|---|---|
| GET | `/business/orders` | Lista pedidos activos del negocio |
| GET | `/business/orders/pending-acceptance` | Cola de pedidos web pendientes de aceptar |
| GET | `/business/orders/{id}` | Detalle |
| POST | `/business/orders` | Crear pedido manual (Idempotency-Key requerido) |
| POST | `/business/orders/{id}/accept` | Aceptar pending (pasa a waiting_driver) |
| PATCH | `/business/orders/{id}` | Editar (prep_time, notas, monto) |
| POST | `/business/orders/{id}/cancel` | Cancela con razón |
| POST | `/business/orders/{id}/extension` | +5/+10 min |
| POST | `/business/orders/{id}/ready-early` | Adelantar (libera cola inmediato) |
| GET | `/business/orders/{id}/items` | Items del pedido (si fue cliente web) |

### Cash (efectivo recibido)

| Method | Path | Propósito |
|---|---|---|
| GET | `/business/cash-settlements` | Lista de settlements (pending + history) |
| POST | `/business/cash-settlements/{id}/confirm` | Confirma monto recibido |
| POST | `/business/cash-settlements/{id}/dispute` | Reporta diferencia |

### Settlements (deuda)

| Method | Path | Propósito |
|---|---|---|
| GET | `/business/settlements` | Liquidaciones pasadas + actuales |
| GET | `/business/settlements/summary` | Deuda actual + próximos vencimientos |

### Estadísticas

| Method | Path | Propósito |
|---|---|---|
| GET | `/business/stats/today` | KPIs del día (pedidos, GMV, comisión) |
| GET | `/business/stats/range` | Series temporales por rango |

---

## 10. Endpoints driver

Auth: rol `driver`.

### Perfil y disponibilidad

| Method | Path | Propósito |
|---|---|---|
| GET | `/driver/profile` | Datos del motorizado |
| PATCH | `/driver/profile` | Actualiza phone, vehicle, etc. |
| GET | `/driver/availability` | Estado actual |
| PUT | `/driver/availability` | Toggle available/off-shift |

### Pedidos

| Method | Path | Propósito |
|---|---|---|
| GET | `/driver/orders` | Pedidos activos asignados |
| GET | `/driver/orders/available` | Cola de pedidos disponibles (en ventana) |
| GET | `/driver/orders/{id}` | Detalle |
| POST | `/driver/orders/{id}/accept` | Acepta asignación |
| POST | `/driver/orders/{id}/claim` | Reclama urgente (FCFS) |
| POST | `/driver/orders/{id}/reject` | Rechaza (Idempotency-Key requerido). Marca order urgent |
| POST | `/driver/orders/{id}/arrived` | Llegada al restaurante (heading → waiting_at) |
| POST | `/driver/orders/{id}/picked-up` | Recoge (slots + banda distancia) |
| POST | `/driver/orders/{id}/delivered` | Entrega (capture payment_status_real) |
| PATCH | `/driver/orders/{id}/customer-data` | Guarda dirección/coords/referencia del cliente |
| PATCH | `/driver/orders/{id}/payment-method` | Cambia método de pago real antes de entregar |

### Equipo y transferencias

| Method | Path | Propósito |
|---|---|---|
| GET | `/driver/team/orders` | Pedidos activos de compañeros (filtrados a autorizados de este driver) |
| POST | `/driver/team/orders/{orderId}/request` | Solicita transferencia (Idempotency-Key requerido) |
| GET | `/driver/team/transfer-requests/received` | Solicitudes pending dirigidas a mí (yo soy from_driver) |
| GET | `/driver/team/transfer-requests/sent` | Solicitudes que yo envié |
| POST | `/driver/team/transfer-requests/{id}/accept` | Acepta (yo soy from_driver) |
| POST | `/driver/team/transfer-requests/{id}/reject` | Rechaza |

### Cash

| Method | Path | Propósito |
|---|---|---|
| GET | `/driver/cash-summary` | Resumen efectivo retenido por negocio |
| POST | `/driver/cash-settlements/{businessId}/deliver` | Entregar efectivo |

### Historial y soporte

| Method | Path | Propósito |
|---|---|---|
| GET | `/driver/history` | Pedidos entregados (paginado) |
| GET | `/driver/support-phone` | Teléfono de soporte |

---

## 11. Endpoints admin

Auth: rol `admin`.

### Dashboard y monitor

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/dashboard` | KPIs del día + monitor + pedidos activos |
| GET | `/admin/alerts` | Alertas pendientes |
| POST | `/admin/alerts/{id}/resolve` | Marca alert como resuelta |

### Pedidos

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/orders` | Filtros: status, businessId, driverId, fromDate, toDate, search |
| GET | `/admin/orders/{id}` | Detalle completo con statusHistory |
| POST | `/admin/orders/{id}/cancel` | Cancela cualquier estado |
| POST | `/admin/orders/{id}/reassign` | Reasigna a otro driver |
| PATCH | `/admin/orders/{id}/customer-phone` | Corrige teléfono (waiting/heading) |
| GET | `/admin/orders/tracking-pending` | Lista picked_up sin tracking enviado |
| POST | `/admin/orders/{id}/tracking-link-sent` | Marca tracking como enviado |
| GET | `/admin/orders/tracking-sent` | Historial de tracking enviado |

### Restaurantes / Negocios

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/businesses` | Lista con filtros |
| GET | `/admin/businesses/{id}` | Detalle |
| POST | `/admin/businesses` | Crear (también crea auth.users con rol business) |
| PATCH | `/admin/businesses/{id}` | Editar |
| POST | `/admin/businesses/{id}/block` | Bloquear con razón |
| POST | `/admin/businesses/{id}/unblock` | Desbloquear |
| PATCH | `/admin/businesses/{id}/capabilities` | Forzar capacidades (override del owner) |

### Motorizados

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/drivers` | Lista |
| GET | `/admin/drivers/{id}` | Detalle |
| POST | `/admin/drivers` | Crear |
| PATCH | `/admin/drivers/{id}` | Editar |
| POST | `/admin/drivers/{id}/deactivate` | Desactiva (con confirmación si tiene pedidos activos) |
| POST | `/admin/drivers/{id}/activate` | Reactiva |
| GET | `/admin/drivers/{id}/restaurants` | Autorizaciones |
| PUT | `/admin/drivers/{id}/restaurants` | Update autorizaciones (multi-select) |

### Settlements (cobros)

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/settlements` | Lista con filtros |
| GET | `/admin/settlements/summary` | Deuda total + por business |
| POST | `/admin/settlements/preview` | Preview de la semana (qué generaría) |
| POST | `/admin/settlements/generate` | Genera liquidaciones (Idempotency-Key requerido) |
| POST | `/admin/settlements/{id}/mark-paid` | Marca como pagada |
| POST | `/admin/settlements/{id}/cancel` | Cancela liquidación errónea |
| GET | `/admin/restaurant-payments` | Lista pagos manuales |
| GET | `/admin/restaurant-payments/summary` | Resumen |

### Cash settlements (disputas)

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/cash-settlements` | Lista (filtros: disputed, today, range) |
| POST | `/admin/cash-settlements/{id}/resolve` | Resuelve disputa |

### Métricas

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/metrics/summary` | KPIs principales |
| GET | `/admin/metrics/sales-timeseries` | Serie temporal de GMV + comisión |
| GET | `/admin/metrics/drivers-performance` | Tabla de drivers |
| GET | `/admin/metrics/restaurants-performance` | Tabla de restaurantes |
| GET | `/admin/metrics/demand-heatmap` | Coords agregadas por zona × hora |
| GET | `/admin/metrics/cancellation-reasons` | Análisis cancelaciones |
| GET | `/admin/metrics/operations-funnel` | Funnel conversión |
| GET | `/admin/daily-summary` | Resumen del día |

### Configuración

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/settings/platform-schedule` | Horario operativo |
| PUT | `/admin/settings/platform-schedule` | Actualiza horario |
| GET | `/admin/settings/assignment-rules` | Reglas R1-R5 |
| PUT | `/admin/settings/assignment-rules` | Actualiza |
| GET | `/admin/settings/support-phone` | Teléfono soporte |
| PUT | `/admin/settings/support-phone` | Actualiza |
| GET | `/admin/settings/commissions` | Tabla de comisiones |
| PUT | `/admin/settings/commissions` | Actualiza (override del default) |

### Auditoría

| Method | Path | Propósito |
|---|---|---|
| GET | `/admin/audit/events` | Stream de domain_events filtrable |
| GET | `/admin/audit/actions` | Log de acciones del admin (post-MVP) |

---

## 12. Endpoints internos

Auth: header `Authorization: Bearer <SERVICE_ROLE_KEY>`. NO JWT.

| Method | Path | Propósito |
|---|---|---|
| POST | `/internal/orders/assign-one` | Asigna UN pedido (trigger reactivo) |
| POST | `/internal/orders/assign-pending` | Failsafe (cron 5 min): reasigna pendientes |
| POST | `/internal/transfer-requests/process-expired` | Failsafe: expira pendientes >30s |
| POST | `/internal/push-debug` | Test endpoint (solo dev) |
| POST | `/internal/cron/auto-cancel-pending` | Failsafe auto-cancel |
| POST | `/internal/cron/close-drivers-shift-end` | Failsafe close drivers |

### Auth de internos

```ts
// apps/api/lib/http/require-service-role.ts
export function requireServiceRole(req: Request) {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Service role required')
  }
}
```

---

## 13. Endpoint Inngest

```
POST /api/inngest         # Inngest llama aquí para invocar functions
GET  /api/inngest         # Inngest health check / introspection
PUT  /api/inngest         # Inngest function sync
```

Verificación de firma con `INNGEST_SIGNING_KEY`.

```ts
// apps/api/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@tindivo/inngest/client'
import * as functions from '@tindivo/inngest/functions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: Object.values(functions),
  signingKey: process.env.INNGEST_SIGNING_KEY,
})
```

---

## 14. Health checks

### `GET /health`

```json
{ "status": "ok", "service": "api", "timestamp": "..." }
```

### `GET /health/db`

```json
{ "status": "ok", "latencyMs": 12 }
```

### `GET /health/realtime`

```json
{ "status": "ok", "connections": 23 }
```

---

## Schemas Zod completos

Cada endpoint tiene su Zod schema en `packages/contracts/`. Por brevedad, este doc lista solo nombres. El schema completo está en el código fuente.

### Naming

- Request: `<Resource><Action>Request` (e.g., `CreateOrderRequest`, `MarkDeliveredRequest`).
- Response: `<Resource>Response` o `<Resource><Action>Response`.
- Common: `UuidSchema`, `ShortIdSchema`, `PhonePeSchema`, `MoneyPenSchema`, `CoordinatesSchema`.

### Validación

```ts
// En el handler
import { parseJson } from '@/lib/http/validate'
import { CreateOrderRequest } from '@tindivo/contracts/orders'

const result = await parseJson(req, CreateOrderRequest)
if (!result.ok) return result.response   // 400 con field errors
const body = result.data
```

---

**Resumen**: ~120 endpoints distribuidos en 6 grupos. Auth uniforme (JWT bearer). Idempotencia Stripe-style. Errores RFC 9457. CORS estricto. Paginación cursor. RLS aplicada en backend para defensa en profundidad.

**Próximo doc**: `07-flujo-cliente.md` — flujo end-to-end de `tindivo.com` replicando el demo.
