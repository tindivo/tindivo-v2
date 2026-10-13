# Estándares · TypeScript

> Verificado: 2026-10-12 · entorno: `develop@591ec569` · Parte de `Docs/arquitectura/estandares/` (niveles y excepciones: `README.md`)

Aplica a `packages/backend` (el servicio), `apps/api` (su interfaz REST), las apps web y el resto de `packages/`. Las reglas transversales (DES, API, TST…) están en `README.md`. Decisión de estructura: `Docs/decisiones/0039-el-backend-es-un-paquete-y-la-api-su-interfaz.md`.

## Reglas

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| TS-1 | **Nombres**: identificadores en inglés; textos de interfaz en español de Perú. Archivos `kebab-case.ts`; componentes React `PascalCase.tsx`; tipos e interfaces `PascalCase`; funciones y variables `camelCase`; `UPPER_SNAKE_CASE` solo para constantes literales de módulo; booleanos con `is`, `has`, `can` o `should`; casos de uso con verbo + sustantivo (`createOrder`, `quoteOrder`, `recordConsent`); handlers con el caso de uso + `Handler` (`cancelOrderHandler`) | OBLIGATORIA para código nuevo | Lint de nombres + revisión |
| TS-2 | **Tipos**: sin `any`, sin `@ts-ignore`, sin casts inseguros (`as unknown as`, `as never`, el `!` de no nulo) salvo confinados en adaptadores con una línea de porqué; `@ts-expect-error` solo en tests y con motivo. `as const` y el estrechamiento con guardas de tipo están permitidos | OBLIGATORIA para código nuevo | Lint |
| TS-3 | **Tamaño**: archivo de más de 300 líneas o función de más de 80, alerta; complejidad cognitiva mayor que 15, alerta | ALERTA | Lint + script |
| TS-4 | **`domain/` sin I/O**: importa `contracts` y utilidades puras. El reloj (`Clock`) y los identificadores (`IdGenerator`) se reciben, no se crean: `new Date()`, `Date.now()` y `crypto.randomUUID()` están prohibidos en `domain/` | OBLIGATORIA donde existan módulos | Lint de imports y globales por carpeta |
| TS-5 | **Comentarios**: el porqué vigente, corto. Los que protegen una invariante se quedan; la crónica (incidentes, fechas, «antes pasaba…») va al commit o al ADR | GUÍA | Revisión |
| TS-6 | **Abstracciones**: no se extrae con menos de tres usos. Excepción: los puertos hacia proveedores externos (DES-2) se aíslan desde el primer uso, aunque haya una sola implementación. Esta es la única fuente de la regla: sale de `CLAUDE.md` | GUÍA | Revisión |
| TS-7 | **Logs** estructurados (JSON) con `requestId`, `module`, `useCase`, `level` y `durationMs` cuando aplica; nunca datos personales (nombre, teléfono, dirección, coordenadas exactas, tokens). Solo a través del logger del repo (por crear con `packages/backend`), que redacta las claves sensibles; `console.*` prohibido en código de servidor | OBLIGATORIA para código nuevo | Lint de `console` + test del redactor |
| TS-8 | **Errores**: los casos de uso lanzan errores de dominio tipados (`DomainError`) con un `code` de `packages/contracts/src/errors.ts`; `defineHandler` (TS-17) es el único que los traduce a RFC 9457 (API-5). Prohibido lanzar `Error` genérico con un texto para que otro decida; prohibido el `catch` vacío | OBLIGATORIA para código nuevo | Lint de `catch` vacío + test por `code` |
| TS-9 | **Validación**: los esquemas Zod viven solo en `packages/contracts`; se parsea en las fronteras (entrada HTTP en `defineHandler`, respuestas de proveedores, variables de entorno al arrancar). `domain/` recibe tipos ya validados | OBLIGATORIA para código nuevo | Revisión + test |
| TS-10 | **Asincronía**: sin promesas flotantes (toda promesa se espera, se devuelve o se maneja de forma explícita); sin `forEach` con funciones `async`; el trabajo diferido va por el outbox o Inngest, nunca «lanzar y olvidar» dentro de una petición | OBLIGATORIA para código nuevo | Lint con información de tipos |
| TS-11 | **Fechas**: los instantes se guardan y viajan en UTC (ISO 8601 con `Z`). La conversión a `America/Lima` solo en presentación, reportes y para calcular la fecha operativa (`AGENTS.md`, invariante 10), con una única función compartida en `packages/` (hoy, `packages/contracts/src/service-date.ts`). Prohibido construir fechas desde cadenas sin zona | OBLIGATORIA para código nuevo | Test + revisión |
| TS-12 | **Dinero en el dominio**: céntimos enteros con tipo marcado (`type Cents = number & { readonly __brand: 'Cents' }`); en la frontera, cadena decimal según D-39. Nunca aritmética con `number` decimal; conversiones solo con las funciones de `packages/contracts/money` (por crear; hoy `packages/contracts/src/primitives.ts` solo define `MoneyPenSchema`) | OBLIGATORIA para código nuevo | Test de las conversiones + revisión |
| TS-13 | **Exportaciones con nombre**; `export default` solo donde el framework lo exige (páginas, layouts, configuración) | OBLIGATORIA para código nuevo | Lint |
| TS-14 | **Estructura de un módulo de `packages/backend`**: `domain/` (entidades, reglas puras, errores), `application/` (un caso de uso por archivo y sus puertos), `infra/` (adaptadores; único sitio con SDK), `http/` (handlers hechos con `defineHandler`, TS-17) e `index.ts` (lo público). En `apps/api` no hay lógica: cada archivo de ruta enlaza un handler (DES-3) | OBLIGATORIA para módulos nuevos | `dependency-cruiser` |
| TS-15 | **`tsconfig`** de paquetes nuevos: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y `noImplicitOverride`. En paquetes existentes se activan cuando su conteo de errores llega a cero | OBLIGATORIA para paquetes nuevos; ALERTA en existentes | CI con `tsc --noEmit` |
| TS-16 | **Pruebas**: unitarias junto al código (`*.test.ts`); integración en `tests/integration/` contra base aislada; el nombre describe el comportamiento («rechaza el pedido si el negocio está cerrado»), no la función | GUÍA | Revisión |
| TS-17 | **Handlers con `defineHandler`**: todo handler declara `method`, `path` (con los parámetros en `camelCase`, igual que en el OpenAPI), `auth` (`none`, `user` o `admin`), los esquemas de `contracts` de lo que recibe y de lo que devuelve, y si es idempotente o tiene límite de uso. Recibe `Request` y los parámetros de ruta y devuelve `Response` (API Fetch estándar): no conoce Next.js | OBLIGATORIA para rutas nuevas | Test de `defineHandler` + test de enlace de rutas |

## Estructura

La lógica es un paquete; `apps/api` solo la expone por HTTP.

```
packages/backend/                  # el servicio: lógica de negocio, sin Next.js (DES-9)
├── package.json                   # sin dependencia de next; expone cada módulo por "exports"
├── src/
│   ├── modules/
│   │   └── <modulo>/
│   │       ├── domain/            # entidades, reglas puras, DomainError
│   │       ├── application/       # un caso de uso por archivo + puertos
│   │       ├── infra/             # Supabase, FCM, Twilio… (DES-2)
│   │       ├── http/              # handlers con defineHandler (TS-17)
│   │       └── index.ts           # lo único que importan otros módulos (DES-4)
│   ├── http/                      # defineHandler y utilidades HTTP compartidas
│   ├── composition/               # raíz de composición: dependencias reales desde las variables de entorno
│   └── shared/                    # logger, Clock, IdGenerator
└── tests/integration/

apps/api/                          # la interfaz REST: hoy Next.js; mañana, cualquier servidor Fetch API
├── app/api/v1/<actor>/…/route.ts  # dos líneas: importa el handler y lo exporta con toNextRoute (DES-3)
├── src/next-adapter.ts            # toNextRoute: lo único que conoce la forma de Next.js (DES-9)
└── next.config.*                  # transpilePackages con el paquete del backend (verificar con la versión de Next.js)

packages/core/                     # lo que comparten las apps web; sin reglas de negocio con garantía de servidor
packages/contracts/                # Zod, errores, fixtures y OpenAPI v1
```

- Las rutas tienen la forma que fija el contrato: por actor, bajo `/api/v1/<actor>/…` (API-1). La carpeta de cada archivo de ruta reproduce esa ruta.
- Salir de Next.js es montar los mismos handlers en otro servidor; como cada handler declara su `method` y su `path`, el enrutador se puede generar.

## `defineHandler` (TS-17)

Contrato; la implementación vive en `packages/backend/src/http/` con sus tests.

```ts
import type { ZodType } from 'zod'

export type Handler = (request: Request, params: Record<string, string>) => Promise<Response>

export interface HandlerSpec<P, Q, B, R> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: `/api/v1/${string}`           // como en el contrato: /api/v1/customer/orders/{orderId}/cancel
  auth: 'none' | 'user' | 'admin'
  params?: ZodType<P>
  query?: ZodType<Q>
  body?: ZodType<B>
  response: ZodType<R> | 'empty'      // 'empty' responde 204 sin cuerpo
  idempotent?: boolean                // exige Idempotency-Key (API-6)
  rateLimit?: RateLimitPolicy         // API-10
}

export interface HandlerInput<P, Q, B> {
  actor: Actor | null                 // null solo si auth es 'none'
  params: P
  query: Q
  body: B
  deps: Deps                          // de la raíz de composición
  requestId: string
}

export declare function defineHandler<P, Q, B, R>(
  spec: HandlerSpec<P, Q, B, R>,
  run: (input: HandlerInput<P, Q, B>) => Promise<R | void>,
): Handler & { spec: HandlerSpec<P, Q, B, R> }
```

Qué hace, en este orden. Cada código de error y cada cabecera son los del contrato (`Docs/planes/movil/contrato-rest.md`); lo que la API ya hace hoy para estos pasos se mueve aquí sin cambiar su comportamiento visible.

1. Lee las cabeceras de cliente `x-tindivo-*` y las registra (CLI-3).
2. Si la versión del cliente está por debajo de la mínima, responde `426 client_upgrade_required` (CLI-4).
3. Corta el cuerpo que supere el límite antes de leerlo entero (API-9).
4. Verifica el token según `auth` (API-12; el método de verificación es una decisión abierta). La identidad sale del token, nunca del cuerpo. Con `admin` exige el rol; el permiso sobre el recurso lo comprueba el caso de uso (API-7).
5. Valida `params`, `query` y `body` con sus esquemas; si fallan, `422 validation_error` (API-5, TS-9).
6. Aplica la idempotencia si `idempotent`, con `idempotency_conflict` ante conflicto (API-6), y el límite de uso si `rateLimit` (API-10).
7. Ejecuta `run`.
8. Responde `{ "data": … }` o `204` (API-4). En desarrollo y en tests valida la respuesta contra `response` (TST-5).
9. Traduce `DomainError` a RFC 9457 con su `code`; cualquier otro error, al error interno del contrato, y lo registra (API-5, TS-8).
10. Registra la petición con `durationMs` (TS-7).

## Ejemplos

Ilustrativos: los nombres reales son los del repo.

Caso de uso con dependencias recibidas y error de dominio (TS-4, TS-8):

```ts
// packages/backend/src/modules/orders/application/quote-order.ts
import { DomainError } from '../domain/errors'
import type { Clock } from '../../../shared/clock'
import type { MenuReader, PricingPolicy } from './ports'

export function quoteOrder(deps: { menu: MenuReader; pricing: PricingPolicy; clock: Clock }) {
  return async (input: QuoteOrderInput): Promise<OrderQuote> => {
    const items = await deps.menu.findItems(input.businessId, input.itemIds)
    if (items.length !== input.itemIds.length) {
      throw new DomainError('item_unavailable')
    }
    return deps.pricing.quote(items, input, deps.clock.now())
  }
}
```

Handler (TS-17):

```ts
// packages/backend/src/modules/orders/http/cancel-order.ts
import { CancelOrderParams, CancelOrderResponse } from '@tindivo/contracts'
import { defineHandler } from '../../../http/define-handler'

export const cancelOrderHandler = defineHandler(
  {
    method: 'POST',
    path: '/api/v1/customer/orders/{orderId}/cancel',
    auth: 'user',
    params: CancelOrderParams,
    response: CancelOrderResponse,
  },
  async ({ actor, params, deps }) => deps.orders.cancelOrder({ actor, orderId: params.orderId }),
)
```

Archivo de ruta en `apps/api` (DES-3):

```ts
// apps/api/app/api/v1/customer/orders/[orderId]/cancel/route.ts
import { cancelOrderHandler } from '@tindivo/backend/orders'
import { toNextRoute } from '@/next-adapter'

export const POST = toNextRoute(cancelOrderHandler)
```

Adaptador, el único archivo que conoce la forma de Next.js (DES-9):

```ts
// apps/api/src/next-adapter.ts
import type { Handler } from '@tindivo/backend/http'

// Next.js 16 entrega params como promesa; await también funciona si llega como objeto.
export function toNextRoute(handler: Handler) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) =>
    handler(request, await context.params)
}
```

Dinero (TS-12):

```ts
// packages/contracts/money.ts
export type Cents = number & { readonly __brand: 'Cents' }

const DECIMAL = /^(-?)(\d+)(?:\.(\d{1,2}))?$/

// Único sitio que construye Cents: el cast queda confinado aquí (TS-2).
export function toCents(decimal: string): Cents {
  const match = DECIMAL.exec(decimal)
  if (!match) throw new RangeError(`Importe inválido: ${decimal}`) // la forma ya la validó Zod en la frontera
  const [, sign, units, fraction = ''] = match
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'))
  return (sign === '-' ? -cents : cents) as Cents
}

export function toDecimalString(cents: Cents): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
// toCents("12.5") === 1250 · toDecimalString(1250 as Cents) === "12.50"
```
