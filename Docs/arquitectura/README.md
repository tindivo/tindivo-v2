# Arquitectura: cómo está construido Tindivo

> Verificado: 2026-10-10 · entorno: `develop@7d00aa4` (estructura, rutas, jobs) y `tindivo-prod` (solo lectura:
> tablas, RLS, crons, triggers) · Los estándares de código están aprobados (más abajo). La propuesta de arquitectura
> objetivo, **sin aprobar**, está en `Docs/trabajo/arquitectura/`

## Las piezas

Monorepo pnpm + Turborepo. Cinco aplicaciones Next.js y paquetes compartidos:

| App | Para quién | Puerto local |
|---|---|---|
| `apps/customer` | El cliente (tindivo.com): catálogo, checkout, seguimiento, Entregas, Store | 3000 |
| `apps/api` | La API REST `/api/v1` (`apiv2.tindivo.com`), única puerta de escritura de las apps | 3001 |
| `apps/negocios` | La cajera: tablero de pedidos, pedidos manuales, deuda, configuración | 3002 |
| `apps/admin` | Jesús: operación, negocios, cobros, reportes, Store | 3003 |
| `apps/motorizados` | El motorizado: cola, pedidos, Entregas, rendición | 3004 |

| Paquete | Qué es |
|---|---|
| `packages/contracts` | **La fuente canónica** de primitivas, enums, máquinas de estados, errores y el OpenAPI (Zod v4) |
| `packages/core` | Dominio puro compartido por las apps web; la lógica de negocio nueva del backend va en `packages/backend` (ADR 0039, por crear) |
| `packages/api-client` | Cliente HTTP de la API para las apps |
| `packages/supabase` | Clientes de Supabase y tipos generados de la base |
| `packages/ui` | Sistema de diseño (Tailwind v4) |
| `packages/map`, `packages/images` | Mapa compartido y tratamiento de imágenes |

## Estándares de código

Aprobados por Jesús el 2026-10-12 (`Docs/decisiones/0038-estandares-de-codigo-v2.md`). Cada regla se define en un solo
archivo; lee solo el de los lenguajes que toque tu cambio.

| Qué | Dónde |
|---|---|
| Reglas transversales (DES, API, CLI, MIG, TST, OPS) y mecanismos | [`estandares/README.md`](estandares/README.md) |
| TypeScript · SQL · Swift · Kotlin | [`typescript.md`](estandares/typescript.md) · [`sql.md`](estandares/sql.md) · [`swift.md`](estandares/swift.md) · [`kotlin.md`](estandares/kotlin.md) |
| Lo heredado que incumple una regla (la cuenta solo puede bajar) | [`excepciones.md`](excepciones.md) |
| Módulo dueño de cada tabla, función, trigger y vista (DES-7) | [`propiedad.md`](propiedad.md) |
| Dónde viven los módulos del backend | `Docs/decisiones/0039-el-backend-es-un-paquete-y-la-api-su-interfaz.md` |

## Decisiones de construcción (vigentes)

- **Sin Server Actions ni BFFs.** Toda escritura pasa por la API REST, porque las apps nativas (Swift + Kotlin) usarán
  la misma API.
- **Sin ORM.** La base se protege con RLS y con funciones `SECURITY DEFINER`; un ORM la saltaría.
- **La lógica que tiene que ser atómica vive en la base**, en funciones SQL: el ciclo del pedido (`advance_order`), la
  creación de pedidos, la deuda y las rendiciones. Por eso buena parte de las reglas están en `supabase/migrations/`,
  no en TypeScript (y graphify no las ve: `Docs/operacion/graphify.md`).
- **Los parámetros del negocio viven en `app_settings`**, no en el código.

## La referencia se genera, no se copia

| Qué | Fuente |
|---|---|
| Esquema de la base | `supabase/migrations/` (vale la última migración que define cada objeto) y `packages/supabase/src/database.types.ts` (`pnpm db:types`) |
| API REST | `packages/contracts/openapi/v1.json` (107 rutas en `apps/api/app/api/v1`; una ruta sin documentar no pasa la CI) |
| Estados del pedido y de Entregas | `ORDER_TRANSITIONS` y `COURIER_TRANSITIONS` en `packages/contracts` |

## La base (`tindivo-prod`, al 2026-10-10)

Postgres 17 en Supabase. **52 tablas, las 52 con RLS**; 127 funciones; última migración aplicada, `0247`. Las
migraciones se aplican solo con el CLI de Supabase (`supabase/AGENTS.md`).

- **Realtime** en 8 tablas: `orders`, `courier_orders`, `cash_settlements`, `businesses`, `driver_availability`,
  `order_transfer_requests`, `reports`, `admin_alerts`. Así las apps ven los cambios sin recargar.
- **12 crons** (`pg_cron`): cinco cada minuto (anunciar pedidos a la cola, vencer prepagos y aceptaciones, vencer
  Entregas, vencer traspasos, marcar pedidos atrasados), uno cada 15 minutos (cerrar turnos de motorizados) y seis de
  limpieza diaria (eventos de dominio, outbox, rechazos, claves de idempotencia, registro de push, suscripciones
  viejas).

## Cómo viajan los avisos

Dos caminos, los dos nacen **dentro de la transacción** del cambio (invariante 4: outbox transaccional):

1. **Avisos push:** las funciones escriben un evento en `domain_events`; un trigger (`trg_dispatch_event` →
   `dispatch_event`) llama por HTTP a la Edge Function `send-push`, que envía el Web Push. El tag de cada aviso es
   `${event_type}-${shortId}` (invariante 5). Lo enviado queda en `push_delivery_log`.
2. **Plazos:** los cambios de `orders` y de `courier_order_events` dejan una fila en `outbox_events` (triggers
   `trg_orders_outbox_events` y `courier_event_to_outbox`); un job de Inngest (`process-outbox-events-cron`) las
   reclama y programa los vencimientos (aceptación, validación, pago, comprobante, traspaso, Entregas).

## Autenticación

Supabase Auth, con un rol por fila en `user_roles` (un usuario puede tener varios) que viaja en el JWT. El cliente
verifica su teléfono por SMS (OTP de Twilio).
