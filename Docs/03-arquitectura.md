# 03 · Arquitectura técnica

> Cómo está organizado el código, por qué se eligió cada tecnología, qué reglas estructurales aplican. Sin código de feature, solo arquitectura y patrones.

---

## Tabla de contenidos

- [1. Principios fundacionales](#1-principios-fundacionales)
- [2. Stack tecnológico](#2-stack-tecnológico)
- [3. Estructura del monorepo](#3-estructura-del-monorepo)
- [4. Apps por subdominio](#4-apps-por-subdominio)
- [5. Packages compartidos](#5-packages-compartidos)
- [6. DDD ligero con arquitectura hexagonal](#6-ddd-ligero-con-arquitectura-hexagonal)
- [7. Vertical slicing en las apps](#7-vertical-slicing-en-las-apps)
- [8. Comunicación entre apps · REST único](#8-comunicación-entre-apps--rest-único)
- [9. Outbox + Inngest · eventos de dominio](#9-outbox--inngest--eventos-de-dominio)
- [10. Row Level Security](#10-row-level-security)
- [11. Idempotencia Stripe-style](#11-idempotencia-stripe-style)
- [12. Realtime](#12-realtime)
- [13. Storage y assets](#13-storage-y-assets)
- [14. Auth y multi-rol](#14-auth-y-multi-rol)
- [15. Decisiones y trade-offs](#15-decisiones-y-trade-offs)
- [16. Diagrama de alto nivel](#16-diagrama-de-alto-nivel)

---

## 1. Principios fundacionales

1. **Vertical slicing por feature en cada app.** Una feature vive en una sola carpeta con sus componentes, hooks, services, schemas, types. No hay carpetas globales `components/`, `services/`, `utils/` que crezcan sin control.
2. **DDD ligero en `packages/core`.** Solo lo necesario: entities, value objects, aggregate roots, use cases, ports, adapters. Sin event sourcing, sin sagas, sin CQRS. La complejidad de DDD aplicada al volumen real del piloto.
3. **Hexagonal estricto.** `packages/core` NO importa Next.js, React, Supabase client web. Solo `@tindivo/supabase` para tipos generados y service-role adapter en `infrastructure/`.
4. **REST único en `apps/api`.** No hay Server Actions, no hay BFFs por app. Las 4 apps frontend consumen el mismo REST. Esto es **Capacitor-ready**: cuando se empaqueten apps móviles nativas, no hay refactor de capa de datos.
5. **Row Level Security siempre activada.** Cada tabla. Cada policy explícita. La validación en endpoints es la primera línea, RLS es la red de seguridad.
6. **Idempotencia en endpoints mutativos.** Header `Idempotency-Key` aceptado por todos los POST de creación. Patrón Stripe.
7. **Outbox + Inngest para asincronía.** Eventos de dominio se persisten en `domain_events` en la misma transacción. Un relay (Edge Function + Inngest workers) los procesa fuera de banda.
8. **No DRY prematuro.** Tres líneas similares en dos apps NO requieren extracción. Solo extraer cuando hay 3+ usos REALES.
9. **No abstracciones sin uso.** No crear interfaces "por si acaso". Las interfaces nacen cuando hay 2+ implementaciones reales.
10. **Trust internal code, validate boundaries.** Zod en boundaries HTTP (controllers + API client). Dentro del dominio, los tipos TS son suficientes.

---

## 2. Stack tecnológico

| Capa | Tecnología | Versión | Notas |
|---|---|---|---|
| Framework web | Next.js + Turbopack | 16 | App Router en las 5 apps |
| UI | React | 19 | Server Components + Suspense |
| Lenguaje | TypeScript | 5.8 | Strict mode en todos los packages |
| Estilo | Tailwind CSS | v4 | Sin custom CSS file. Tokens en `packages/ui` |
| Iconos | Material Symbols | rounded | Único icon set. Sin emojis en código |
| Animaciones | Motion (ex Framer) | v12 | Sheets, modales, tabs |
| Base de datos | Supabase PostgreSQL | 15 | Managed, backups diarios |
| ORM | `@supabase/supabase-js` | latest | Sin Prisma ni Drizzle |
| Auth | Supabase Auth | latest | Cookies httpOnly via `@supabase/ssr` |
| Realtime | Supabase Realtime | latest | postgres_changes + broadcast |
| Storage | Supabase Storage | latest | Buckets con RLS policies |
| Edge Functions | Supabase Edge Functions Deno | latest | `send-push`, `prune-events`, etc. |
| Push notifications | Web Push API + VAPID | estándar | `web-push` lib en Edge Function |
| Scheduling | **Inngest** | latest | NUEVO. Reemplaza polling con cron |
| Mapas | Leaflet + react-leaflet + OSM | latest | No Google Maps, no MapLibre |
| Cliente HTTP | `fetch` nativo + `packages/api-client` | latest | Tipado con Zod schemas |
| State server | TanStack Query | v5 | Cache + refetch + invalidación |
| State local | Zustand | v5 | Stores por rol/feature |
| Forms | React Hook Form + Zod resolver | latest | Validación cliente con Zod compartido |
| Lint/format | Biome | latest | Reemplaza ESLint + Prettier |
| Bundler | Turbopack (Next.js) | latest | Hot reload rápido |
| Monorepo | Turborepo + pnpm workspaces | latest | Cache compartido, paralelismo |
| Testing | Vitest | latest | Solo en `packages/core` |
| Deploy | Vercel | latest | 5 deployments (uno por app) |
| Observability | Vercel Analytics + Axiom + Sentry | free tier | RUM + logs + error tracking |
| Rate limiting | Upstash Ratelimit | free tier | Middleware en `apps/api` |

### Justificación de las elecciones más importantes

- **Next.js 16 + App Router**: SSR streaming nativo, Server Components reducen JS al cliente, deploys instantáneos en Vercel.
- **Supabase**: provee Postgres + Auth + Realtime + Storage + Edge Functions en un solo proveedor. Free tier cubre el piloto.
- **Inngest**: resuelve el bug de latencia push con `step.sleepUntil()` precision ~2-5s. Free tier 50k runs/mes. Si excede, evaluar self-host.
- **Sin Prisma**: agrega capa innecesaria. `@supabase/supabase-js` + tipos generados (`pnpm db:types`) son suficientes. RLS funciona con anon key + JWT, Prisma bypassa.
- **Turborepo + pnpm**: cache de builds compartido entre las 5 apps, paralelismo en CI.
- **Biome**: 10x más rápido que ESLint + Prettier. Un solo binario.

---

## 3. Estructura del monorepo

```
tindivo-v2/
├── apps/
│   ├── api/                     # api.tindivo.com — REST único (Next.js)
│   ├── customer/                # tindivo.com — PWA cliente (Next.js)
│   ├── admin/                   # admin.tindivo.com — Panel control (Next.js)
│   ├── negocios/                # negocios.tindivo.com — PWA negocio (Next.js)
│   └── motorizados/             # motorizados.tindivo.com — PWA driver (Next.js)
│
├── packages/
│   ├── core/                    # Dominio puro (NO React, NO Supabase web)
│   ├── contracts/               # Zod schemas compartidos
│   ├── api-client/              # Cliente REST tipado
│   ├── supabase/                # types.gen.ts + signOutLocal helper
│   ├── ui/                      # Primitives shadcn + patterns Tindivo
│   ├── inngest/                 # Functions de scheduling
│   └── config/                  # tsconfig, tailwind, biome compartidos
│
├── supabase/
│   ├── migrations/              # Schema desde 00000000000000_init.sql
│   ├── functions/               # Edge Functions (Deno)
│   └── config.toml              # Config Supabase CLI
│
├── Docs/                        # Esta documentación
├── package.json                 # Workspaces root
├── pnpm-workspace.yaml          # pnpm config
├── turbo.json                   # Turborepo pipeline
├── biome.json                   # Lint + format global
├── .gitignore
└── README.md
```

### Convenciones de nombres

- Archivos: `kebab-case.ts`, componentes `PascalCase.tsx`.
- Clases: `PascalCase`.
- Funciones / hooks: `camelCase` (`useX`).
- Tipos / interfaces: `PascalCase`.
- Value Objects: `PascalCase` sin sufijo "VO" / "Id" redundante (e.g., `OrderId` está bien, `OrderIdVO` no).
- Tablas DB: `snake_case` (`orders`, `push_subscriptions`).
- Enums DB: `snake_case` valor (`waiting_driver`).

---

## 4. Apps por subdominio

Cada app es un proyecto Next.js independiente con su propio `package.json`, `next.config.ts`, `tailwind.config.ts`. Pueden tener dependencias distintas (e.g., `apps/customer` no necesita `leaflet`).

### 4.1 `apps/api` (api.tindivo.com)

- REST único.
- Estructura: `app/api/v1/<path>/route.ts` (App Router).
- Middlewares: `middleware.ts` para CORS + auth global.
- Helpers: `lib/http/{cors,idempotency,problem,validate,require-auth}.ts`.
- Endpoints agrupados por consumidor: `public/`, `customer/`, `business/`, `driver/`, `admin/`, `internal/`.
- Variables de entorno: Supabase keys, Inngest keys, VAPID keys.

### 4.2 `apps/customer` (tindivo.com)

- PWA pública del cliente final.
- Replica exacta del demo en `C:\Users\mauri\Downloads\jesus`.
- Estructura: `app/(public)/` para landing + tracking, `app/cuenta/` para autenticados.
- Manifest scope: `/`.
- SW: Serwist.
- Auth: Supabase Auth + cookies httpOnly compartidas con `negocios.tindivo.com` (cross-subdomain via `.tindivo.com` cookie domain).
- Realtime: `postgres_changes` filtrados por `shortId` (tracking público).

### 4.3 `apps/admin` (admin.tindivo.com)

- Sala de control operativa.
- Estructura: `app/(admin)/dashboard/...` para las 11 secciones.
- Responsive: mobile-first pero desktop-optimized.
- Auth: solo rol `admin`.
- Realtime: agresivo (muchos canales abiertos para vigilancia en vivo).

### 4.4 `apps/negocios` (negocios.tindivo.com)

- PWA para negocios. UI condicional por `primary_capability`.
- Estructura: `app/(business)/` con conditional rendering según capacidades.
- Onboarding obligatorio en primer login.
- Manifest scope: `/`.
- SW: Serwist con push subscription.

### 4.5 `apps/motorizados` (motorizados.tindivo.com)

- PWA para drivers. Mobile-first 1:1.
- Estructura: `app/(driver)/` con tabs (Disponibles / Activos / Equipo).
- Manifest scope: `/`.
- SW: Serwist + push subscription crítica (`requireInteraction: true`).
- Geolocation API para futuras features.

### Por qué subdominios separados (vs route groups)

| Beneficio | Route groups (v1) | Subdominios (v2) |
|---|---|---|
| Aislamiento de cookies / sesión | No (mismo origen) | Sí (cookie domain `.tindivo.com` permite SSO opcional pero apps independientes) |
| Bundle size por rol | Grande (todo en un bundle) | Pequeño (solo lo necesario por app) |
| Equipos independientes | No | Sí |
| Capacitor-ready | Complicado | Trivial (cada PWA es un bundle nativo) |
| Deploys | 1 deploy | 5 deploys (Turborepo cache mitiga) |
| Service Workers | Conflicto entre rutas | Aislados por dominio |

---

## 5. Packages compartidos

### 5.1 `packages/core` — Dominio puro

**Reglas estrictas**:
- NO importa Next.js, React, Supabase client web.
- Solo `@tindivo/supabase` en `infrastructure/` para adapters.
- TypeScript puro + Vitest.

**Estructura**:

```
packages/core/
├── src/
│   ├── shared/
│   │   ├── kernel/                # AggregateRoot, Entity, ValueObject, DomainEvent, Result
│   │   ├── errors/                # DomainError, PersistenceError
│   │   └── utils/                 # money, phone, maps, short-id
│   └── modules/
│       ├── orders/
│       │   ├── domain/            # entities, value-objects, policies, events, errors
│       │   ├── application/       # use-cases + ports
│       │   └── infrastructure/    # adapters Supabase
│       ├── businesses/            # ex-restaurants, ahora con capacidades
│       ├── drivers/
│       ├── settlements/
│       ├── cash-settlements/
│       ├── notifications/
│       ├── users/
│       ├── platform/
│       ├── catalog/               # menú público
│       ├── customer-account/
│       └── encomiendas/           # placeholder, no implementado en MVP
├── tests/
└── package.json
```

### 5.2 `packages/contracts` — Zod schemas

Schemas compartidos entre cliente y servidor. Cada dominio tiene su archivo:

```
packages/contracts/
├── src/
│   ├── orders.ts                  # CreateOrderRequest, MarkDeliveredRequest, ...
│   ├── businesses.ts
│   ├── drivers.ts
│   ├── customer.ts
│   ├── settlements.ts
│   ├── common.ts                  # UuidSchema, PhonePeSchema, MoneyPenSchema
│   ├── errors.ts                  # ErrorCodes enum, ProblemDetails RFC 9457
│   └── index.ts                   # Exports
└── package.json
```

### 5.3 `packages/api-client` — Cliente REST tipado

```
packages/api-client/
├── src/
│   ├── client.ts                  # Base ApiClient con fetch wrapper
│   ├── orders.ts                  # ordersApi.create(), ordersApi.cancel(), ...
│   ├── businesses.ts
│   ├── drivers.ts
│   ├── customer.ts
│   ├── platform.ts                # Public endpoints
│   └── index.ts
└── package.json
```

Patrón:

```ts
export const ordersApi = {
  create(body: CreateOrderRequest, opts: { idempotencyKey?: string }) {
    return client.post<OrderResponse>('/orders', body, opts)
  },
  // ...
}
```

### 5.4 `packages/supabase` — Tipos generados + helpers

```
packages/supabase/
├── src/
│   ├── types.gen.ts               # Generated via `pnpm db:types`
│   ├── sign-out-local.ts          # signOutLocal() helper
│   └── client-helpers.ts          # createBrowserClient / createServerClient wrappers
└── package.json
```

### 5.5 `packages/ui` — UI compartida

```
packages/ui/
├── src/
│   ├── primitives/                # shadcn-based: Button, Input, Dialog, Sheet, ...
│   ├── patterns/                  # Tindivo: GlassTopBar, OrderCard, StatusChip, ...
│   ├── tokens/                    # design tokens (colors, spacing, typography)
│   └── globals.css                # Tailwind base
└── package.json
```

### 5.6 `packages/inngest` — Functions de scheduling

```
packages/inngest/
├── src/
│   ├── client.ts                  # Inngest client config
│   ├── functions/
│   │   ├── check-order-overdue.ts
│   │   ├── process-transfer-timeout.ts
│   │   ├── auto-cancel-pending.ts
│   │   └── close-drivers-at-shift-end.ts
│   └── index.ts                   # Export all functions
└── package.json
```

Las functions se sirven desde `apps/api/app/api/inngest/route.ts` (endpoint `serve()`).

### 5.7 `packages/config` — Configs compartidos

```
packages/config/
├── tsconfig/
│   ├── base.json
│   ├── nextjs.json
│   └── react-library.json
├── tailwind/
│   └── preset.ts
├── biome.json
└── package.json
```

---

## 6. DDD ligero con arquitectura hexagonal

### 6.1 Conceptos aplicados

| Concepto DDD | Aplicación en Tindivo |
|---|---|
| Aggregate Root | `Order`, `Business`, `Driver`, `Settlement` |
| Entity | sub-componentes de aggregates (e.g., `OrderItem` dentro de `Order`) |
| Value Object | `OrderId`, `ShortId`, `Money`, `Coordinates`, `PrepTime`, `OccupancySlots`, `PaymentIntent` |
| Domain Event | `OrderCreated`, `OrderAccepted`, `OrderOverdue`, etc. (~25 eventos) |
| Use Case | `CreateOrderUseCase`, `AcceptOrderUseCase`, etc. (~20+ use cases) |
| Repository (Port) | `OrderRepository`, `BusinessRepository`, ... — interfaces |
| Adapter | `SupabaseOrderRepository`, etc. — implementaciones |
| Domain Policy | `DriverAssignmentPolicy` (R1-R5), `CancellationPolicy`, `StateTransitionPolicy`, `PlatformSchedulePolicy` |

### 6.2 Lo que NO usamos de DDD

- **Event Sourcing**: no guardamos eventos como source of truth. La tabla `orders` es la verdad, los eventos son outbox para reaccionar fuera de banda.
- **Sagas**: las transacciones distribuidas no aplican. Todo cabe en una sola DB.
- **CQRS**: lectura y escritura usan los mismos modelos. Queries de admin pueden hacer joins directos.
- **Bounded Contexts** explícitos: en MVP hay un solo BC (Tindivo). Si crece a multi-tenant, se evaluará.

### 6.3 Flujo típico de un use case

```ts
// modules/orders/application/use-cases/accept-order.use-case.ts

class AcceptOrderUseCase {
  constructor(
    private orders: OrderRepository,
    private drivers: DriverRepository,
    private events: EventPublisher,
    private clock: Clock
  ) {}

  async execute(cmd: AcceptOrderCommand): Promise<Result<void, DomainError>> {
    // 1. Cargar agregado
    const order = await this.orders.findById(cmd.orderId)
    if (!order) return Result.fail(new OrderNotFoundError(cmd.orderId))

    // 2. Validar invariantes en el agregado
    const driverCapacity = await this.drivers.getCapacity(cmd.driverId)
    const result = order.acceptBy(cmd.driverId, driverCapacity, this.clock.now())
    if (result.isFailure()) return result

    // 3. Persistir con optimistic concurrency
    await this.orders.save(order, { expectedStatus: 'waiting_driver' })

    // 4. Publicar eventos (outbox - misma transacción si está bien hecho)
    await this.events.publishAll(order.pullEvents())

    return Result.ok()
  }
}
```

### 6.4 Por qué hexagonal

- **Testabilidad**: los use cases reciben ports (interfaces). Tests pasan mocks in-memory.
- **Aislamiento**: el dominio no conoce Supabase ni HTTP. Si mañana migramos a otra DB, solo cambian los adapters.
- **Claridad**: lógica de negocio queda en `domain/`, IO en `infrastructure/`, orquestación en `application/use-cases/`.

---

## 7. Vertical slicing en las apps

Cada app organiza su código por **feature**, no por tipo:

```
apps/negocios/src/
├── app/                           # Next.js App Router
│   ├── (business)/
│   │   ├── page.tsx               # Home (UI condicional)
│   │   ├── pedidos/...
│   │   └── menu/...
│   ├── layout.tsx
│   └── middleware.ts
├── features/
│   ├── orders/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/              # llamadas a api-client
│   │   ├── schemas/               # Zod específicos de la feature
│   │   └── types.ts
│   ├── menu/
│   ├── cash/
│   ├── deuda/
│   └── profile/
└── lib/
    ├── auth.ts                    # helpers de sesión específicos de esta app
    └── conditional-ui.ts          # lógica de capacidades
```

**Regla**: una feature no importa de otra feature directamente. Si dos features necesitan compartir algo, sube a `lib/` o `packages/ui`.

---

## 8. Comunicación entre apps · REST único

Todas las apps frontend (`customer`, `admin`, `negocios`, `motorizados`) consumen el mismo `api.tindivo.com`. NO hay Server Actions (por compatibilidad con Capacitor futuro y por separación cliente/servidor explícita).

### Convenciones

- Versionado en URL: `/api/v1/...`.
- Auth: header `Authorization: Bearer <jwt>` (JWT firmado por Supabase Auth).
- Body: JSON.
- Response: JSON `{ data, meta? }` o `{ items, total, cursor? }`.
- Errors: RFC 9457 Problem Details `{ type, title, status, code, detail, requestId, errors[] }`.
- Idempotency: header `Idempotency-Key: <uuid>` en POSTs de creación.
- Request ID: header `X-Request-Id: <uuid>` propagado en logs.

Ver detalle en `05-api-rest.md`.

---

## 9. Outbox + Inngest · eventos de dominio

### 9.1 Outbox pattern

Cuando un use case modifica un agregado, los eventos que el agregado emite se guardan en la tabla `domain_events` en la **misma transacción** que la modificación. Garantiza "at-least-once delivery" sin transacciones distribuidas.

```sql
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  metadata jsonb DEFAULT '{}',
  occurred_at timestamptz DEFAULT now(),
  published_at timestamptz,
  retry_count int DEFAULT 0,
  last_error text
);
CREATE INDEX domain_events_unpublished_idx ON domain_events (published_at) WHERE published_at IS NULL;
```

### 9.2 Relays

Dos relays distintos consumen `domain_events`:

**Relay 1 · Push notifications** (Edge Function `send-push`):
- Trigger Postgres `trg_domain_events_dispatch_push` se dispara `AFTER INSERT` en `domain_events`.
- El trigger usa `pg_net.http_post()` para invocar la Edge Function.
- La Edge Function mapea evento → push notification (ver `11-notificaciones-push.md`).

**Relay 2 · Realtime** (automático):
- Supabase Realtime emite `postgres_changes` de TODAS las tablas publicadas.
- Las apps frontend se suscriben a las tablas relevantes.

### 9.3 Inngest como scheduler

Para eventos que requieren **scheduling** (esperar X tiempo antes de actuar), Inngest se encarga:

- **`check-order-overdue`**: al `OrderCreated`, programar verificación a `estimated_ready_at + 5min`.
- **`process-transfer-timeout`**: al `OrderTransferRequested`, programar timeout a `created_at + 30s`.
- **`auto-cancel-pending`**: al `OrderCreatedAsPendingAcceptance`, programar cancelación a `created_at + 5min`.
- **`close-drivers-at-shift-end`**: al iniciar turno, programar cierre a `shift_end`.

**Patrón Inngest**:

```ts
export const checkOrderOverdue = inngest.createFunction(
  { id: 'check-order-overdue' },
  { event: 'order/check-overdue' },
  async ({ event, step }) => {
    await step.sleepUntil('wait-for-overdue', event.data.scheduledFor)
    const order = await step.run('fetch-order', () => 
      supabase.from('orders').select('*').eq('id', event.data.orderId).single()
    )
    if (order.status === 'waiting_driver' && order.driver_id === null) {
      await step.run('publish-overdue', () =>
        publishEvent({ type: 'OrderOverdue', ...order })
      )
    }
  }
)
```

### 9.4 Failsafe crons

Los crons de Supabase quedan como red de seguridad cada 5 min:
- `enqueue-overdue-orders-failsafe`
- `process-expired-transfer-requests-failsafe`
- `auto-cancel-pending-acceptance-failsafe`

Solo actúan si Inngest no procesó por algún motivo.

---

## 10. Row Level Security

### 10.1 Helpers SQL

```sql
-- Rol del usuario actual
CREATE FUNCTION current_user_role() RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Business ID del usuario actual (si tiene rol business)
CREATE FUNCTION current_business_id() RETURNS uuid AS $$
  SELECT id FROM public.businesses WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Driver ID del usuario actual (si tiene rol driver)
CREATE FUNCTION current_driver_id() RETURNS uuid AS $$
  SELECT id FROM public.drivers WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 10.2 Patrón de policies

Cada tabla tiene policies separadas por rol:

```sql
-- Admin ve todo
CREATE POLICY "orders_admin_all" ON orders FOR ALL
  USING (current_user_role() = 'admin');

-- Negocios ven sus propios pedidos
CREATE POLICY "orders_business_read" ON orders FOR SELECT
  USING (
    current_user_role() = 'business'
    AND business_id = current_business_id()
  );

-- Drivers ven sus pedidos asignados o los waiting_driver disponibles
CREATE POLICY "orders_driver_read" ON orders FOR SELECT
  USING (
    current_user_role() = 'driver'
    AND (
      driver_id = current_driver_id()
      OR (status = 'waiting_driver' AND appears_in_queue_at <= now())
    )
  );
```

### 10.3 Bypass desde el servidor

- El servidor (`apps/api`) usa `SUPABASE_SERVICE_ROLE_KEY` para queries administrativas (crear pedido, actualizar balance, etc.). **Bypassa RLS**.
- El cliente (browser) usa `SUPABASE_ANON_KEY` + JWT del usuario. **RLS aplica**.
- Las suscripciones Realtime desde el browser respetan RLS automáticamente.

Detalle completo en `04-base-de-datos.md`.

---

## 11. Idempotencia Stripe-style

### 11.1 Tabla

```sql
CREATE TABLE idempotency_keys (
  key uuid NOT NULL,
  scope text NOT NULL,                     -- e.g. 'business_orders', 'customer_orders'
  user_id uuid NOT NULL,
  request_hash text NOT NULL,              -- SHA-256 del body
  response_status int,
  response_body jsonb,
  status text DEFAULT 'reserved',          -- reserved | completed
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '24 hours',
  PRIMARY KEY (key, scope)
);
```

### 11.2 Flujo

1. Cliente genera UUID v4 y lo guarda en `sessionStorage` por `formId`.
2. Cliente envía POST con header `Idempotency-Key: <uuid>`.
3. Servidor llama RPC `claim_idempotency_key(key, scope, user_id, hash)`:
   - Si no existe → INSERT con `status='reserved'`, retorna `{outcome: 'reserved'}`.
   - Si existe + mismo hash + `status='completed'` → retorna respuesta cacheada `{outcome: 'cached'}`.
   - Si existe + hash distinto → retorna `{outcome: 'mismatch'}` → 409.
   - Si existe + `status='reserved'` → retorna `{outcome: 'in_flight'}` → cliente polling 150ms × 200 = 30s max.
4. Servidor ejecuta lógica y guarda response con `finalize_idempotency_key(key, scope, status_code, body)`.
5. Cliente consume key tras 2xx/4xx, persiste tras 5xx (retry seguro).

### 11.3 Limpieza

Cron diario `prune-idempotency-keys` borra keys con `expires_at < now()`.

---

## 12. Realtime

### 12.1 Postgres Changes (suscripción directa)

El cliente se suscribe a cambios de filas filtrados:

```ts
// apps/negocios — pedidos de mi negocio
supabase
  .channel(`business-${businessId}-orders`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'orders',
    filter: `business_id=eq.${businessId}`,
  }, (payload) => { ... })
  .subscribe()
```

RLS aplica: si el cliente intenta suscribirse a otro `business_id`, no recibe eventos.

### 12.2 Broadcast (eventos sintéticos)

Para eventos compuestos (alertas admin, "este pedido lleva 5min sin aceptar"):

```ts
// Server-side
await supabase.channel('admin-alerts').send({
  type: 'broadcast',
  event: 'order.unaccepted',
  payload: { orderId, shortId, ... },
})

// Client-side (admin)
supabase
  .channel('admin-alerts')
  .on('broadcast', { event: 'order.unaccepted' }, ({ payload }) => { ... })
  .subscribe()
```

### 12.3 Tablas publicadas para Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE 
  orders, cash_settlements, settlements, driver_availability,
  order_transfer_requests;
```

`push_subscriptions`, `domain_events`, `order_status_history`, `push_delivery_log` NO se publican (no necesarias en UI).

---

## 13. Storage y assets

### Buckets

| Bucket | Público | Contenido |
|---|---|---|
| `business-logos` | Sí | Logos / fotos de negocios |
| `business-qrs` | Sí | QR de Yape/Plin del negocio |
| `menu-items` | Sí | Fotos de items del menú |
| `payment-proofs` | No | Capturas de pago Yape (post-MVP) |
| `receipts` | No | Comprobantes generados (PDF) |

Policies con `storage.foldername()` y `current_business_id()` para aislamiento.

---

## 14. Auth y multi-rol

### 14.1 Identidad vs rol

- **Identidad**: `auth.users` (Supabase) ↔ `public.users` (extensión con flags). Un usuario único.
- **Rol activo**: `users.role` (puede ser `customer`, `business`, `driver`, `admin`).
- **Multi-rol**: tabla `user_roles` adicional con `(user_id, role)` permite N roles por usuario.

### 14.2 JWT claims

Supabase Auth firma el JWT con `app_metadata.user_roles: ['business', 'driver']`. El middleware lee estos claims sin hacer query a DB:

```ts
// apps/api/middleware.ts
const roles = jwt.app_metadata.user_roles as Array<UserRole>
const isBusiness = roles.includes('business')
```

### 14.3 Login y selector de rol

Si un usuario tiene N roles activos, tras login en `tindivo.com/login` se muestra selector:

> ¿Cómo quieres entrar?
> - Como cliente → `tindivo.com`
> - Como negocio → `negocios.tindivo.com`
> - Como motorizado → `motorizados.tindivo.com`

Cada opción redirige al subdominio correspondiente con la sesión ya iniciada (cookie `.tindivo.com`).

### 14.4 Logout

`signOutLocal()` del package `@tindivo/supabase`:

```ts
import { signOutLocal } from '@tindivo/supabase'

await signOutLocal()
// Limpia la cookie httpOnly de ESTE dispositivo.
// NUNCA usar supabase.auth.signOut() directo: el default scope:'global'
// cierra TODAS las sesiones del usuario en TODOS los dispositivos.
```

---

## 15. Decisiones y trade-offs

### 15.1 ¿Por qué no Server Actions de Next.js?

- Capacitor (futuro mobile nativo) no soporta Server Actions — necesita REST.
- Server Actions ocultan la capa HTTP: cuando un cliente externo (test, otro frontend, mobile) intenta consumir, no hay endpoint estable.
- Trade-off: pequeño overhead de RPC. Compensa por portabilidad.

### 15.2 ¿Por qué no Prisma?

- Agregar capa ORM cuando Supabase ya genera tipos TypeScript de la DB.
- Prisma con RLS es problemático (Prisma conecta como `postgres` superuser, bypassando RLS).
- Trade-off: queries un poco más verbosas. Compensa por simplicidad y RLS correcto.

### 15.3 ¿Por qué no Drizzle?

- Mismo argumento que Prisma + Drizzle es relativamente nuevo, menos comunidad en español.
- Trade-off: ninguno significativo.

### 15.4 ¿Por qué Inngest y no QStash?

- Inngest tiene SDK TypeScript con `step.sleepUntil()` y manejo de retries built-in. QStash es solo HTTP scheduling raw.
- Inngest free tier 50k/mes vs QStash 500/día (15k/mes).
- Trade-off: Inngest tiene curva de aprendizaje mayor (workflows como código). QStash es trivial (POST con delay).

### 15.5 ¿Por qué Tailwind v4 y no v3?

- v4 trae compilación más rápida, configuración via CSS (`@theme`), y menor footprint.
- Trade-off: v4 es relativamente nuevo, plugins maduros pueden estar atrás. Compensa con ecosistema shadcn que ya migró.

### 15.6 ¿Por qué Biome y no ESLint + Prettier?

- 10-100x más rápido. Un solo config.
- Trade-off: algunos plugins de ESLint no tienen equivalente. En MVP no necesitamos.

### 15.7 ¿Por qué 5 deploys y no 1?

- Aislamiento de cookies, bundles más pequeños, equipos independientes.
- Trade-off: 5x configuración Vercel. Mitigación: Turborepo + scripts compartidos.

### 15.8 ¿Por qué Material Symbols y no Lucide / Heroicons?

- Material Symbols rounded es un icon set masivo, gratuito, consistente, sin imports per-icon (basta una font-face).
- Trade-off: ~30KB de font extra. Compensa con que NO importamos iconos uno por uno.

---

## 16. Diagrama de alto nivel

```
                                     ┌──────────────────────┐
                                     │   Inngest Cloud      │
                                     │ (scheduling delays)  │
                                     └──────────┬───────────┘
                                                │ event-driven
                                                ▼
   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
   │ tindivo.com   │  │admin.tindivo  │  │negocios.t...  │  │motorizados.t..│
   │  (customer)   │  │  (admin)      │  │  (business)   │  │  (driver)     │
   │     PWA       │  │  Web + PWA    │  │     PWA       │  │     PWA       │
   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
           │                   │                   │                   │
           │  HTTPS + JWT cookie httpOnly · CORS · Idempotency-Key       │
           └───────────────────┼───────────────────┼───────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │  api.tindivo.com     │
                    │  Next.js REST + Inngest serve │
                    └──────┬────────┬──────┘
                           │        │
              service-role │        │ anon + JWT (RLS aplica)
                           ▼        ▼
                    ┌──────────────────────────────────┐
                    │       Supabase Postgres          │
                    │  ┌────────────────────────────┐  │
                    │  │  Tables (RLS activated)    │  │
                    │  │  orders, businesses, ...   │  │
                    │  └────────────────────────────┘  │
                    │  ┌────────────────────────────┐  │
                    │  │  domain_events (outbox)    │──┼──► pg_net.http_post
                    │  └────────────────────────────┘  │       │
                    │  ┌────────────────────────────┐  │       ▼
                    │  │  pg_cron (failsafe 5min)   │  │  ┌─────────────────┐
                    │  └────────────────────────────┘  │  │ Edge Function   │
                    └──────────────────────────────────┘  │   send-push     │
                           │                              │  (Web Push VAPID)│
                           │ Realtime postgres_changes    └────────┬────────┘
                           ▼                                       │
                   to subscribed clients                           ▼
                                                       FCM / APNs / native push
                                                              services
                                                                   │
                                                                   ▼
                                                            User's device
```

---

**Próximo doc**: `04-base-de-datos.md` — schema completo con migraciones, RLS, triggers, índices.
