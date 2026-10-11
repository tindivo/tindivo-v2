# 03 · Superficie de la API

> Tabla completa de las 85 rutas: [`../anexos/A-superficie-api.md`](../anexos/A-superficie-api.md) (generada por script).
> Aquí: las **convenciones actuales**, **qué consume hoy el Customer** y la **propuesta de superficie móvil v1**
> que resuelve `ARQ-01` y `ARQ-02`.

## 1. Convenciones actuales

| Aspecto | Hoy | Fuente |
|---|---|---|
| Base | `https://apiv2.tindivo.com/api/v1` | `Docs/13-deploy` |
| Autenticación | `Authorization: Bearer <JWT de Supabase>`; se valida **contra GoTrue en cada petición** y se consulta `user_roles` | `apps/api/lib/http/auth.ts` |
| Éxito | `{ "data": … }` (`ok()`); **una** ruta responde sin envoltura (`/public/orders/:shortId`, `raw()`) | `lib/http/problem.ts:37-45` |
| Error | **RFC 9457** `application/problem+json`: `type`, `title`, `status`, `code`, `detail`, `requestId`, `errors[{field,message}]` | `problem.ts:19-35` |
| Códigos de error | 12 (`validation_error` 422 … `internal_error` 500); `business_blocked` y `payment_required` **no se emiten** | `contracts/errors.ts:24-37` |
| Idempotencia | Cabecera `Idempotency-Key` (UUID), scope por ruta, caduca a 24 h; **4 de 49** rutas de mutación | `lib/http/idempotency.ts` |
| Trazabilidad | `x-request-id` (lo genera el cliente; la respuesta lo devuelve) | `lib/http/request-id.ts` |
| CORS | Lista de orígenes (`tindivo.com`, `www`, `negocios.`, `motorizados.`, `admin.`, localhost, previews); **aplicado en tres capas** | `lib/http/cors.ts`, `proxy.ts` |
| Paginación | Sin convención (16 rutas con `limit`/`range`, por verificar) | — |
| Versionado | Prefijo `/v1`; **sin política** de compatibilidad | `ARQ-07` |
| Plazos del cliente | 15 s (60 s para PDF); `ApiTimeoutError` distinto de `ApiError` | `packages/api-client` |
| Límites de uso | **Ninguno** | `SEC-03` |

## 2. Por área (resumen de la tabla completa)

| Área | Rutas | Notas |
|---|---|---|
| `/customer/*` | **8** | Crear pedido, cancelar, `prepay-info`, `prepay-proof`, apelación (GET/POST), mis apelaciones, OTP (2) |
| `/public/*` | 6 | Catálogo (lista y detalle, con caché de borde), búsqueda, horario de admisión, seguimiento por `short_id`, `pilot-access` (muerto) |
| `/push/*` | 2 | Suscripciones Web Push |
| `/business/*` | 18 | Transición de pedidos, validar, pedido manual, pausa, QR de cobro, perfil, efectivo, reportes (+PDF), reclamos |
| `/driver/*` | 9 | Transición, dirección, traspasos, efectivo, disponibilidad, incidentes, equipo |
| `/admin/*` | 40 | Todo el panel |
| sistema | 2 | `/health`, `/inngest` (webhook) |

## 3. Lo que el Customer usa **fuera** de la API

Para cada dato que la PWA obtiene por Supabase directo, el nativo necesita un endpoint (o un canal
autorizado). `[CÓDIGO]` `features/*`, `lib/*`:

| Dato / acción | Mecanismo actual | Requisito |
|---|---|---|
| Perfil (`customer_profiles`) leer/escribir | PostgREST + RLS | `CUS-AUT-*`, `CUS-ACC-*` |
| Direcciones (`customer_addresses`) CRUD | PostgREST + RLS | `CUS-ADR-*` |
| Historial y pedidos activos (`orders`) | PostgREST + RLS; Realtime `postgres_changes` | `CUS-ORD-*`, `CUS-CAT-019` |
| Propiedad del pedido y nota | `orders` por `short_id` (RLS decide) | `CUS-TRK-001`, `009` |
| Reclamos (`reports`) | PostgREST | `CUS-PAY-010` |
| Reseñas (`get_pending_review`, `create_order_review`, `order_review_dismissals`) | RPC + PostgREST | `CUS-REV-*` |
| Decisión de contraentrega, promo, envío gratis por plato, vuelto de la noche | RPC | `CUS-CHK-007/008/016/017` |
| Parámetros (`app_settings`), zonas, puntos de interés | PostgREST (lista blanca `as_public_read`) | `SYS-CFG` |
| Aceptación de términos | Insert directo | `CUS-AUT-006` |
| Comprobante de pago | Storage directo (subida y URL firmada) | `CUS-PAY-003…006` |
| Sesión | Supabase Auth (cookies/localStorage) | `CUS-AUT-*` |

## 4. Propuesta de **superficie móvil v1** (`/api/mobile/v1`)

> **Ojo (2026-09-20):** esto es la superficie **completa**. Para el primer *build* se recomienda la **versión mínima**
> (opción C de [`04-decisiones-abiertas.md`](../04-decisiones-abiertas.md) §3.1): cabeceras `X-Client-*`, `GET /config`,
> `426`, códigos de error estables, OpenAPI de las rutas que usa la app y `source` generalizado. El resto de esta tabla
> se difiere hasta que una medición lo justifique.

**Principios:** (1) es **la única** cosa que consumen las apps nativas de cliente, más Supabase Auth
(sesiones), Realtime *Broadcast* y Storage con URL firmada; (2) **contrato OpenAPI** con esquemas de
petición **y respuesta**; (3) errores con **códigos de dominio** (`DAT-02`); (4) **idempotencia** en
toda mutación; (5) **modelos de lectura** calculados por el servidor (no tablas); (6) **paginación por
cursor**; (7) **`X-Client-Platform/Version/Build`** obligatorios y `426` si la versión es menor a la mínima;
(8) autenticación local del JWT (`PER-01`).

| Endpoint | Sustituye a | Requisitos |
|---|---|---|
| `GET /config` | lectura de `app_settings`, constantes del cliente | `MOB-02`, todos los ⚙ |
| `GET /home` | `/public/businesses` + carrusel fijo + pedido activo + reseña pendiente | `CUS-CAT-001…002, 019…020`, `CUS-REV-001` |
| `GET /businesses/{idOrSlug}` | `/public/businesses/:id` con `open_status`, `items[].availability{available_now, valid_until, label}` ya calculados | `CUS-CAT-004…014, 023` |
| `GET /search?q=` | `/public/search` | `CUS-CAT-003` |
| `GET /me` · `PATCH /me` · **`DELETE /me`** | perfil por PostgREST | `CUS-AUT-014…017` |
| `POST /me/phone/send-code` · `POST /me/phone/verify` | `/customer/phone/*` (+ límites por destino/IP/dispositivo) | `CUS-AUT-007…009` |
| `GET /me/readiness?method=` | `useOrderReadiness` (4 consultas en el cliente) | `CUS-CRT-008` |
| `GET/POST /me/addresses` · `PATCH/DELETE /me/addresses/{id}` · `PUT /me/addresses/{id}/default` | `customer_addresses` directo | `CUS-ADR-*` |
| `GET /me/checkout-context?business_id=` | RPC de decisión, promo, vuelto, tarifas, plazos y coordenadas | `CUS-CHK-*`, `CUS-ADR-011…013` |
| `POST /orders` *(idempotente)* | `POST /customer/orders` (una sola RPC con todos los guards) | `CUS-CHK-010` |
| `GET /me/orders` *(cursor)* · `GET /me/orders/{id}` | `orders` directo + `get_tracking` | `CUS-ORD-*`, `CUS-TRK-001…009` |
| `POST /me/orders/{id}/cancel` | `/customer/orders/:id/cancel` (200 idempotente si ya está cancelado) | `CUS-TRK-006` |
| `GET /me/orders/{id}/payment-info` · `POST /me/orders/{id}/payment-proof` *(idempotente)* | `prepay-info`, `prepay-proof` | `CUS-PAY-002…006` |
| `POST /me/orders/{id}/appeal` · `GET /me/appeals` | `/customer/orders/:id/appeal`, `/customer/appeals` | `CUS-PAY-009…010` |
| `POST /me/orders/{id}/reorder` | *(no existe)* | `CUS-CRT-012` |
| `GET /me/reviews/pending` · `POST /me/orders/{id}/review` · `POST /me/orders/{id}/review/dismiss` | RPC y tabla directos | `CUS-REV-*` |
| `GET /public/orders/{shortId}` *(reducido)* | `get_tracking` (sin apellido ni teléfono del motorizado ni ruta del comprobante) | `CUS-TRK-001`, `SEC-04` |
| `PUT /me/devices` · `DELETE /me/devices/{id}` | *(Web Push)* | `NAT-PSH-001` |
| `GET/PUT /me/notification-preferences` · `POST /me/consents` | *(no existe)* | `NAT-CON-*` |
| `POST /me/notifications/{id}/ack` | *(no existe)* | `NAT-PSH-006` |
| Canal *Broadcast* privado `order:{id}` | Realtime `postgres_changes` | `CUS-TRK-014`, `PER-05` |
| `PUT /me/live-activities/{order_id}` | *(no existe)* | `NAT-LIV-001` |

**Lo que la API móvil NO expone:** `push_dispatch`, tablas crudas, `orders` con 98 columnas, RPC con
el actor por parámetro, ni datos de otros usuarios.

**Compatibilidad:** cambios **aditivos** dentro de `v1`; campos nuevos opcionales; deprecación con
cabeceras `Deprecation`/`Sunset` y una ventana medida en versiones de app publicadas, no en días.
