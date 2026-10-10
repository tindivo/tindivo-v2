# 01 · Arquitectura y contrato

> **Pregunta de este documento:** ¿la arquitectura que existe es la adecuada para servir a dos
> apps nativas (iOS y Android) que se distribuyen por las tiendas?
> **Respuesta corta:** el *dominio* sí; el *contrato y el reparto de responsabilidades* no.
> Etiquetas de evidencia y escalas: ver [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## Cómo es la arquitectura hoy (en un dibujo)

```
   PWA cliente ─┐                                     ┌─► Vercel: apps/api (Next 16, 85 rutas REST /api/v1)
   PWA negocios ├─ REST (Bearer JWT) ────────────────►│        │  service-role (BYPASA RLS) ──┐
   PWA motoriz. ┤                                     │        └─ Inngest Cloud (timers)      │
   Admin ───────┘                                     │                                       ▼
        │                                             │   Supabase ── Postgres 17 ── 106 funciones (245 KB) · RLS · 11 cron
        │  ── ── ── acceso DIRECTO (PostgREST + RLS,  │        ├─ Auth (Google + correo)           ▲
        │           Realtime, Storage, Auth) ── ── ──►│        ├─ Realtime (postgres_changes)      │ pg_net
        │                                             │        ├─ Storage (5 buckets)              │
        │                                             │        └─ Edge Function send-push ─────────┘ → Web Push (VAPID)
        └─────────────────────────────────────────────┘   Twilio Verify (OTP por SMS)
```

Lo importante del dibujo son las **dos flechas hacia Supabase**: la doc oficial (`DECISIONS.md:51`)
dice que las apps consumen «un REST único», pero **lo que existe es un híbrido** (ARQ-01).

---

## ARQ-01 · El sistema tiene dos APIs y solo una está en el contrato

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** |
| **Esfuerzo** | L |

**En una frase.** Las apps hablan con el backend por REST *y* directamente con Supabase (tablas,
RPC, Realtime, Storage, Auth), así que la «API» real es el esquema de la base.

**Evidencia.**
- Uso directo de Supabase por app (conteo estático, sin tests): **Customer 48 `.from()` + 7
  `.rpc()` + 2 canales Realtime + 3 usos de Storage + 32 llamadas de Auth · Negocios 103
  `.from()` + 4 `.rpc()` · Admin 13 · Motorizados 5.** `[CÓDIGO]` `git grep`
- El Customer **solo tiene 8 endpoints REST propios**: crear pedido, cancelar, `prepay-info`,
  `prepay-proof`, apelaciones (2) y OTP (2). **No existe** `GET /customer/orders`, ni perfil, ni
  direcciones, ni reseñas por REST: se leen y escriben por PostgREST bajo RLS
  (`features/account/hooks/use-account-page.ts`, `lib/active-orders.ts:66`, `lib/address-save.ts`,
  `features/reviews/lib/pending.ts:31-63`). `[CÓDIGO]`
- El tracking comprueba la propiedad del pedido con una lectura directa a `orders` que **solo
  devuelve fila si la RLS lo permite** (`features/tracking/hooks/use-tracking.ts:68-77`): la RLS
  se usa como si fuese una función «¿es mío?». `[CÓDIGO]`
- **La doble vía es una consecuencia de la latencia de la API, y el propio equipo lo dice:** las
  reseñas van «contra Postgres y sin pasar por la API… meterlas por `apps/api` solo añadiría los
  470-750 ms de piso que cuesta el salto» (`features/reviews/lib/pending.ts:3-10`); y el checkout
  lo repite al hablar del «salto a la API (470–750 ms de piso)» (`use-checkout-state.ts:185-187`).
  Es decir: **unificar el acceso en una sola API exige antes arreglar la latencia** (`PER-01`,
  `PER-02`), o cada equipo volverá a saltársela. `[CÓDIGO]`

**Por qué importa con Swift/Kotlin.** Un cliente nativo instalado hoy seguirá en circulación
meses. Si su contrato es «`orders` con 98 columnas + 30 RPC + las políticas RLS», **cualquier
cambio de columna, de firma de RPC o de política rompe versiones publicadas**, y no hay forma de
deprecar (no hay versión de esquema). Además, cada camino tiene su propia autorización, su propio
caché y su propio manejo de errores.

**Dirección.** Definir una **superficie móvil explícita** en tres cubos:
(a) lo que la app hace por **REST versionado** (todo lo funcional: `/me`, `/me/addresses`,
`/me/orders`, `/orders/:id`, `/reviews`, catálogo, configuración);
(b) lo que se permite por **SDK de Supabase** bajo condiciones escritas (Auth con PKCE, Realtime
*Broadcast* con canal privado por pedido, Storage con URL firmada);
(c) **todo lo demás, prohibido** para el cliente (ninguna lectura directa de tablas). La lista de
endpoints candidatos está en `03-requisitos/CUS-cliente.md` (campo «Backend»).

---

## ARQ-02 · No existe un contrato que Swift y Kotlin puedan consumir

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** |
| **Esfuerzo** | M |

**En una frase.** El contrato está en Zod (TypeScript) y solo cubre las peticiones; no hay OpenAPI
ni esquemas de respuesta.

**Evidencia.**
- `packages/contracts` (1 898 líneas) define esquemas Zod **de petición**: `requests.ts` (4),
  `enums.ts` (21), más DTO de apelaciones (`appeal.ts`) y poco más. **Las respuestas no tienen
  esquema**: cada frontend escribe sus tipos a mano
  (`apps/customer/features/tracking/types.ts`, `features/catalog/types.ts`,
  `apps/motorizados/lib/types.ts`). `[CÓDIGO]`
- Las respuestas de éxito **no tienen una forma única**: casi todas usan `{ data }` (`ok()`), pero
  `GET /public/orders/:shortId` devuelve el cuerpo sin envoltura (`raw()`,
  `apps/api/lib/http/problem.ts:43`). `[CÓDIGO]`
- El endpoint de transición de pedidos acepta `action: z.string().min(1)` **sin enumerar las
  acciones** (`apps/api/lib/http/order-transition.ts:26-28`) y reenvía un `jsonb` sin tipar a
  `advance_order`. Un generador de clientes produciría `String` y un diccionario. `[CÓDIGO]`

**Por qué importa con Swift/Kotlin.** Ninguno de los dos puede importar Zod. Sin OpenAPI habría
que transcribir a mano los endpoints (×2 plataformas) y mantenerlos sincronizados a ojo.

**Dirección.** Generar **OpenAPI 3.1 desde Zod** (Zod v4 trae `z.toJSONSchema`), añadir esquemas de
respuesta para la superficie móvil, **fijar la envoltura**, publicar el spec como artefacto de CI
y **generar los clientes** (Swift OpenAPI Generator; generador Kotlin sobre Ktor/Retrofit).
**Test de contrato:** si el spec cambia, CI lo compara con el anterior y falla ante un cambio
rompiente. Convertir `advance_order` en operaciones tipadas (una por acción) hace que esto sea
posible también para negocio y motorizado.

---

## ARQ-03 · Reglas de negocio del cliente que viven en TypeScript y que Swift/Kotlin no pueden reutilizar

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | M |

**En una frase.** El servidor manda «la regla» y el cliente la evalúa; con tres clientes
(web, Swift, Kotlin) cada regla acaba escrita cuatro veces (TS, Swift, Kotlin, SQL).

**Reglas que hoy se evalúan en el cliente (y qué son):**

| Regla | Dónde vive | Copia en SQL |
|---|---|---|
| **¿Abierto o cerrado ahora?** (turnos, cruce de medianoche, `America/Lima`) | `packages/contracts/src/schedule.ts` (326 líneas, `getOpenStatus`) | `is_within_platform_schedule`, `get_order_intake_status` |
| **Franja horaria de un plato** («solo sábados 11:00-15:00») | `contracts/src/menu-availability.ts` (315 líneas; derivada al leer, «fail-open») | `create_customer_order`: «El item … no se sirve en este turno» |
| **Qué métodos de pago puede elegir** (recojo «ahora»/«más tarde», umbral, prepago) | `contracts/src/payment-rules.ts` (`customerPaymentIntents`) | CHECK `orders_pickup_payment_chk` + `create_customer_order` |
| **Los 4 pasos del tracking** y el texto de cada uno | `contracts/src/order-status.ts` (`STATUS_TO_TRACKING`) + `customer/features/tracking/lib/format.ts` (381 líneas, `stepsFor`) | — |
| **¿La dirección está dentro de cobertura?** (punto en polígono) | `customer/lib/coverage.ts` | `point_in_coverage_polygon` |
| **Tarifa de envío según punto** | `customer/lib/delivery-fee.ts` | `delivery_band_for_point`, `create_customer_order` |
| **Validación de dirección** (referencia 15-140 caracteres, GPS, precisión) | `customer/lib/address-validation.ts`, `contracts/primitives.ts` | `create_customer_order` |
| **Cuánto vuelto acepta el negocio** | `customer/features/checkout/lib/cash.ts` | `effective_max_change` |

**Los valores de reserva («fallback») del cliente también se desalinean.** El cliente lleva
copias escritas a mano de números que viven en la base y que «solo se usan si la consulta falla»:
centro de cobertura `-9.1547, -78.5042` (`apps/customer/lib/coverage.ts:22`) frente al vivo
`-9.1465, -78.2779` en `app_settings.coverage` (≈ 25 km de diferencia); umbral de prepago 80,
billete máximo 100, vuelto 50, plazos 8/15 min, tarifas 2,00/2,50 (`features/checkout/types.ts`,
`lib/prepay.ts`, `lib/delivery-fee.ts:19`). Tres de ellos ya se han desalineado con la base alguna
vez (los términos legales prometían prepago desde S/100 mientras el sistema exigía S/80,
`lib/prepay.ts:1-33`). `[CÓDIGO]` `[DB-PROD]`

**Evidencia de que duplicar cuesta.** El propio código lo confiesa tres veces:
- `apps/api/app/api/v1/customer/orders/route.ts:62-94`: «aquí vivía una **TERCERA copia de la
  regla**… se quedó con el criterio viejo y rechazaba con 403 pedidos que la RPC sí aceptaba»; y
  «esa migración entera [0211] estaba muerta **a través del HTTP** aunque sus tests contra la RPC
  estuvieran verdes».
- `supabase/functions/send-push/index.ts:118-120` y `:585-598`: la suma `orderTotal` «es la MISMA
  que `get_tracking` devuelve»; el ETA **no** se duplica «a propósito» para que el aviso y la
  pantalla no salgan de dos implementaciones.
- `packages/contracts/src/menu-availability.ts:1-27`: la franja se deriva en lectura en TS **y**
  se hace cumplir en la RPC.

**Dirección.** Separar dos casos:
1. **Política que depende de la hora, la configuración o el estado** → que la calcule **el
   servidor y la entregue como dato**: `is_open_now` + `next_change_at`, cada plato con
   `available_now` + `valid_until`, `payment_options[]` con el motivo de las deshabilitadas, el
   tracking con `steps[]` y claves de texto. El cliente pinta; no decide.
2. **Funciones puras que deban quedar en el dispositivo** (punto en polígono, formateo) → **vectores
   de conformidad**: un JSON de casos compartido en el repo que ejecutan los tests de TS, Swift y
   Kotlin.

Nota: el catálogo se sirve con caché de borde de 15 s (`Cache-Control: s-maxage=15`); por eso «el
servidor manda la regla y el cliente la evalúa» fue una decisión razonable en web
(`apps/api/app/api/v1/public/businesses/[id]/route.ts:97-103`). En nativo hay que sopesar caché
frente a duplicación, o exponer un endpoint corto y no cacheado solo para el estado de apertura.

---

## ARQ-04 · La lógica de negocio vive en 245 KB de PL/pgSQL, con una historia de 36 migraciones por función

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | No |
| **Esfuerzo** | L |

**En una frase.** El «backend» real son 106 funciones SQL; para saber cómo funciona hoy
`create_customer_order` hay que consultarla en la base porque 36 migraciones la reescriben.

**Evidencia.** `[DB-PROD]` `[CÓDIGO]`

| Función | Tamaño | Migraciones que la redefinen |
|---|---|---|
| `advance_order` (todas las transiciones de todos los roles) | **38 996 B** | 24 |
| `create_customer_order` (el pedido del cliente) | **24 057 B** | **36** |
| `business_performance_metrics` | 13 096 B | — |
| `validate_order` | 12 371 B | 11 |
| `update_business_manual_order` | 11 296 B | — |
| `create_business_manual_order` | 8 467 B | 18 |
| `get_tracking` | 2 896 B | 15 |

- En total **106 funciones, 88 `SECURITY DEFINER`, 82 en plpgsql, 245 018 bytes**. `packages/core`
  (la capa que `DECISIONS.md:92` describe como «hexagonal solo en `orders`») son **1 291 líneas** y
  la máquina de estados TS (`core/src/order/state-machine.ts`, `transitions.ts`) **coexiste** con la
  SQL: la operativa es `advance_order`; la TS solo la comprueba en tests y en el drift de enums.
- **No hay una copia legible de la definición vigente** (no existe `supabase/schemas/` ni un
  volcado): la definición de una función es «la última de N migraciones».
- Los tests de esa lógica son de integración contra la base (307 casos) y **no corren en CI**
  (ver `PRO-01`).

**Por qué importa.** Es lo que hace que cada cambio sea caro y arriesgado, y por tanto lo que
frena todo el resto: un cambio de regla obliga a reescribir el cuerpo entero de una función de
39 KB en una migración, sin diff revisable contra la versión anterior.

**Dirección.** Decidir **explícitamente** dónde vive el dominio y dejar de tener medias tintas:
- *Opción A — dominio en la base (lo actual, ordenado):* esquema declarativo/volcado versionado
  de las funciones como fuente de verdad revisable, **una función por acción** con parámetros
  tipados (`accept_order`, `mark_order_ready`…) en vez de `advance_order(p_action text, p_params
  jsonb)`, y un test de humo por RPC en CI.
- *Opción B — dominio en TypeScript (`packages/core`) con RPC finas:* más portable a futuro y
  testeable sin base, pero implica reescribir ~245 KB y traspasar transacciones.
Recomendación de trabajo: **A**, porque conserva lo valioso (reglas endurecidas por incidentes que el
propio código documenta) y es la que menos riesgo tiene antes de lanzar; B solo si se decide un
rediseño del dominio.

---

## ARQ-05 · `orders` es una tabla-dios (98 columnas, 9 triggers, datos sensibles y públicos juntos)

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | L (si se parte) · S (si solo se cierra el acceso) |

**Evidencia.** `[DB-PROD]` `orders`: **98 columnas**, 19 índices, 4 políticas de lectura
(`ord_admin_all`, `ord_business_read`, `ord_customer_read`, `ord_driver_read`), 9 triggers
(`touch_orders`, `trg_orders_balance_due`, `trg_orders_before_write`,
`trg_orders_business_not_blocked`, `trg_orders_log_status`, `trg_orders_outbox_events`,
`trg_orders_prepaid_refund`, `trg_orders_set_assigned_at`, `trg_promo_settle_redemption`), y **está
en la publicación de Realtime**. Mezcla: identidad, dinero (10 columnas), logística de entrega,
verificación de pago, antifraude, ~22 sellos de tiempo, efectivo, notas de tres actores y datos
personales (`customer_phone`, `delivery_address`, `customer_notes`).

**Por qué importa.** Quien lee `orders` (por PostgREST o por Realtime `postgres_changes`) recibe la
fila entera; lo que se protege es **por política y por `GRANT` de columna** (el texto de las
reseñas usa este truco, 0217). Un DTO móvil debe ser un **modelo de lectura** por rol, no la tabla.

**Dirección.** Vistas o RPC de lectura por rol (`customer_order_view`) y que el cliente **solo** vea
eso. Partir la tabla solo si una necesidad concreta lo pide (no por estética).

---

## ARQ-06 · Cinco mecanismos asíncronos, tres proveedores, y los mismos plazos por duplicado

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | Parcial (el camino de notificaciones se rehace igualmente) |
| **Esfuerzo** | M-L |

**En una frase.** Para que «pase algo dentro de N minutos» o «avisa a alguien» hay cinco caminos
distintos, y añadir APNs/FCM sería el sexto.

| # | Mecanismo | Qué hace | Dónde |
|---|---|---|---|
| 1 | `domain_events` + trigger `dispatch_event` + `pg_net` → **Edge Function** | Push (a fondo perdido) | `dispatch_event` (4 migraciones); `send-push/index.ts` |
| 2 | `outbox_events` + `claim_outbox_events` + **cron de Inngest cada 5 min** → eventos de Inngest | Solo apelaciones | `apps/api/lib/outbox/processor.ts:21-76`, `inngest/functions.ts:255-267` |
| 3 | **Temporizadores de Inngest** (`step.sleep`) | Aceptación 8 min, validación 5/10, pago 15, traspaso 30 s | `inngest/functions.ts:28-215` |
| 4 | **pg_cron**: 4 barridos por minuto (`auto-cancel-prepay-timeout`, `expire-order-transfers`, `flag-overdue-orders`, `announce-queued-orders`) + 1 de 15 min + 6 de limpieza | Los **mismos** plazos, más cola y limpieza | `[DB-PROD]` `cron.job` |
| 5 | **Realtime** (`postgres_changes` sobre 7 tablas + *Broadcast* `drivers:board`) + **polling** (8 s tracking, 15 s bandeja) | Refresco de pantallas | `use-tracking.ts:51-125` |

- Los plazos de aceptación, validación y pago existen **dos veces** (Inngest y la RPC que barre el
  cron); las dos llaman a `expire_order`, que es idempotente, así que no chocan, pero hay dos
  mecanismos que mantener y explicar. `[CÓDIGO]`
- `orderPrepayTimeout` está marcado «legacy: conservado por compatibilidad»
  (`inngest/functions.ts:151-182`) y `docs/13-deploy` afirma que Inngest solo hace dos cosas
  (`checkOrderOverdue`, `processTransferTimeout`) cuando hoy hace cuatro timeouts y un cron. `[DOC]`
- **Cuatro ejecuciones por minuto, 24 horas al día**, aunque el negocio cierre a las 23:00
  (≈5 800 ejecuciones diarias). A este volumen no cuesta nada, pero es el patrón de «todo por
  sondeo». `[DB-PROD]`
- Proveedores implicados: **Vercel** (API), **Supabase** (Postgres + Edge + Realtime), **Inngest
  Cloud**, **Twilio**.

**Por qué importa.** La fiabilidad del tracking en el móvil dependería de cuatro mecanismos, y
cuando algo falla no hay un sitio único donde mirar (véase `NOT-08`).

**Dirección.** Un solo **outbox transaccional de verdad** (con reserva, reintento y *dead-letter*)
como origen de todo efecto lateral, y **un solo motor de plazos**. A este volumen basta `pg_cron`
por minuto (los plazos son de minutos); Inngest aporta poco y añade un proveedor. Las
notificaciones pasan a ser **un consumidor más** del outbox.

---

## ARQ-07 · No hay política de compatibilidad: los cambios rompientes se despliegan «juntos»

| | |
|---|---|
| **Severidad** | **Crítico para el móvil** (Alto en general) |
| **Bloquea el móvil** | **Sí** |
| **Esfuerzo** | M |

**En una frase.** Hoy se puede renombrar un campo porque todas las apps se despliegan a la vez;
con apps de tienda **eso deja de ser cierto** y un renombre puede dejar sin poder pedir a todos los
usuarios de la versión anterior.

**Evidencia.**
- `DECISIONS.md:715` (§22): «**Renombre deliberado** del campo del endpoint (`orderAmount` →
  `totalAmount`), **sin alias de compatibilidad**: un cliente viejo se lleva un 422… `apps/api` y
  `apps/negocios` **se despliegan juntos**.» `[CÓDIGO]`
- Existe una guarda de **orden de despliegue** (`scripts/check-deploy-order.mjs`) porque «un desfase
  deja el entorno remoto dando 400/404 mudos»; el orden es base → apps → Edge Function
  (`Docs/13-deploy-y-devops.md:308-309`). `[CÓDIGO]`
- **51 migraciones en los últimos 30 días.** `[CÓDIGO]`
- **El desfase de versiones ya ocurre incluso en web**, y los tipos lo confiesan: los campos nuevos
  se declaran «**opcionales a propósito**: `apps/api` se despliega por separado y un `customer` nuevo
  contra una `api` vieja no los recibe» (`apps/customer/features/catalog/types.ts:57-61` y `:78-84`).
  Con apps de tienda, ese desfase no dura minutos sino meses. `[CÓDIGO]`
- El prefijo `/api/v1` existe, pero **no hay** cabecera de versión de cliente, ni versión mínima,
  ni respuesta `426`, ni `Deprecation`/`Sunset`, ni tests que ejecuten versiones anteriores del
  contrato. `[CÓDIGO]` (`git grep` sin resultados)

**Por qué importa.** Una versión de iOS/Android publicada puede seguir instalada **meses**. Apple
y Google no permiten forzar la actualización desde fuera de la app.

**Dirección.** Política escrita: **aditivo dentro de `v1`**, ventana de deprecación medida, y
cabeceras `Deprecation`/`Sunset`; endpoint `GET /config` con `min_supported_version` **por
plataforma**, *kill-switch* y *feature flags* (ver `MOB-02`); test de contrato en CI contra las
últimas N versiones publicadas.

---

## ARQ-08 · «Canal cliente» = `source = 'customer_pwa'`: un canal nativo se saltaría las reglas

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** (desactiva reglas en silencio) |
| **Esfuerzo** | S-M |

**En una frase.** La palabra «PWA» está grabada en reglas de negocio; un pedido con otro `source`
no las cumple.

**Evidencia.**
- El enum `order_source` tiene **dos valores**: `customer_pwa`, `business_manual`. `[DB-PROD]`
- **Dos CHECK** solo protegen cuando `source = 'customer_pwa'`: `orders_pickup_payment_chk`
  («un recojo no puede pagarse con `pending_yape`…») y `orders_pickup_timing_chk`
  (`(source <> 'customer_pwa') OR …`). Con un valor nuevo, **el CHECK se cumple trivialmente** y
  un pedido nativo podría entrar con un pago que el mostrador no admite. `[DB-PROD]`
- Tres funciones SQL (`create_customer_order`, `admin_online_orders_stats`,
  `admin_conversion_opportunity_stats`) y **10 ficheros TypeScript** usan el literal
  (`apps/api/.../customer/orders/route.ts`, `contracts/src/payment-rules.ts`,
  `contracts/src/enums.ts`, `apps/motorizados/components/source-chip.tsx`,
  `card-view-model.ts`, `apps/admin/app/monitoreo/page.tsx`…). `[CÓDIGO]`
- Los valores de un enum de Postgres **no se pueden quitar** una vez añadidos.

**Dirección.** **Antes** de lanzar nativo: reemplazar el literal por un predicado
(`is_customer_channel(source)`) y reescribir los CHECK contra él; conservar `customer_pwa` como
«canal de autoservicio» y **añadir columnas** `client_platform` (`ios`/`android`/`web`),
`client_app_version` y `client_build` en lugar de multiplicar valores de `source`. Es una
migración pequeña, pero **hay que hacerla primero**.

---

## Resumen de este documento

| ID | Hallazgo | Sev. | Bloquea | Esf. |
|---|---|---|---|---|
| ARQ-01 | Dos APIs (REST + Supabase directo), solo una en el contrato | Alto | Sí | L |
| ARQ-02 | Sin OpenAPI ni esquemas de respuesta | Alto | Sí | M |
| ARQ-03 | Reglas del cliente en TypeScript (copias ×4) | Alto | Parcial | M |
| ARQ-04 | Dominio en 245 KB de PL/pgSQL, 36 migraciones por función | Alto | No | L |
| ARQ-05 | `orders`: 98 columnas, 9 triggers, datos sensibles y públicos | Medio | No | S/L |
| ARQ-06 | Cinco mecanismos asíncronos y plazos por duplicado | Alto | Parcial | M-L |
| ARQ-07 | Sin política de compatibilidad ni versión mínima | **Crítico** | Sí | M |
| ARQ-08 | `customer_pwa` grabado en reglas y CHECK | Alto | Sí | S-M |
