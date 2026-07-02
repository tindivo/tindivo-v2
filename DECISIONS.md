# Tindivo 2.0 — Decisiones canónicas

> **Qué es este documento.** La fuente única de verdad para las decisiones que
> resuelven contradicciones entre los 20 documentos de `Docs/`. Cuando un spec y
> este documento difieran, **gana este documento**. Se mantiene vivo: cada
> decisión nueva o cambio se registra aquí, no en specs paralelos.
>
> Última actualización: 2026-06-22 (cobertura → polígono editable, referencia mín 15, Google login activo).

---

## 0. Regla de precedencia de documentos

Hay 20 documentos con reglas que a veces se contradicen. Orden de autoridad:

1. **`FASE-1-TINDIVO.md`** — alcance y reglas de la Fase 1 (manda sobre todo lo demás).
2. **`Tindivo_Documento_Maestro.md`** — capa de reconciliación; reglas de dinero y antifraude.
3. **Specs `00`–`14`** — arquitectura técnica de referencia.
4. **`Tindivo Design Spec.html` + `FLUJO_TINDIVO.md`** — verdad visual y de comportamiento del cliente.
5. **`DOCUMENTACION_PANELES_TINDIVO.md`** — inspiración UX, **NO** target estético.

Donde FASE-1 o el Maestro corrigen un spec, ganan ellos. **Confirmado por el usuario (2026-05-29).**

---

## 1. Stack y versiones (fijadas, verificadas en vivo el 2026-05-29)

| Capa | Decisión | Versión |
|---|---|---|
| Framework | Next.js (App Router + Turbopack) | **16.2.6** (GA) |
| UI runtime | React | **19.2.6** |
| Lenguaje | TypeScript strict | **6.0.x** |
| Estilos | Tailwind | **v4.3** (config vía `@theme`) |
| Iconos | Material Symbols Rounded (único set) | — |
| Animación | Motion (ex Framer Motion) | **12.40** |
| Validación | **Zod v4** (⚠ no v3, API distinta) | **4.4.3** |
| Datos | `@supabase/supabase-js` + tipos generados (sin Prisma/Drizzle) | **2.106** |
| Auth | `@supabase/ssr` | **0.10.3** |
| Server state | TanStack Query | **5.100** |
| Client state | Zustand | **5.0** |
| Forms | React Hook Form + `@hookform/resolvers` | **7.76** / **5.4** |
| Mapas | Leaflet + react-leaflet + OSM/Nominatim | **1.9 / 5.0** |
| Scheduling | Inngest Cloud (`step.sleepUntil`) | **4.5** |
| Rate limit | Upstash Ratelimit | **2.0** |
| Push | Web Push API + VAPID (`web-push`) | **3.6** |
| Lint/format | Biome (reemplaza ESLint+Prettier) | **2.4** |
| Tests | Vitest (solo en `packages/core` y `contracts`) | **4.1** |
| Monorepo | Turborepo + pnpm workspaces (catalog) | **2.9 / pnpm 9.15** |
| Runtime | Node | **24** (LTS; `engines >=20.9`) |

- **Sin Server Actions ni BFFs**: las 4 apps frontend consumen un REST único (`apps/api`, `/api/v1`) → portabilidad a Capacitor (móvil nativo) futura.
- **Sin Prisma/Drizzle**: conectan como superuser y *bypassan RLS*. Usamos `supabase-js` + tipos generados.
- **Postgres 17** en el proyecto Supabase "Web v2" (más nuevo que el PG 15 que mencionaban los docs).
- **Light mode siempre** (sin dark mode). Timezone `America/Lima`. Moneda `PEN`. Español peruano.

---

## 2. Proyecto Supabase

- **Cuenta independiente del v1.** Proyecto **"Web v2"** · ref `psjigdoinfpgrnedxeyf` · org `Tindivo` · región `us-east-2`. El v1 ("Delivery", ref `nwcdxmebsozswnjlblip`) sigue intacto.
- Free tier ($0/mes) para el piloto.
- Migraciones y tipos se aplican/generan vía el **MCP de Supabase** (no hay CLI local instalado). Las migraciones se versionan en `supabase/migrations/`.

---

## 3. Estructura del monorepo

```
tindivo-v2/
  apps/
    api/            REST único /api/v1 (api.tindivo.com)
    customer/       PWA cliente (tindivo.com)
    negocios/       PWA negocio (negocios.tindivo.com)
    motorizados/    PWA motorizado (motorizados.tindivo.com)
    admin/          panel admin (admin.tindivo.com)
  packages/
    contracts/      Zod canónico (primitivas, enums, máquina de estados, errores)
    core/           dominio puro (hexagonal en `orders`; pragmático en el resto)
    supabase/       cliente factory + database.types.ts generado
    api-client/     cliente REST tipado para las apps frontend
    ui/             primitives shadcn + patterns Tindivo + preset Tailwind
    inngest/        cliente + funciones de scheduling
    tsconfig/       presets TS compartidos
  supabase/
    migrations/     SQL versionado e idempotente
    functions/      Edge Functions (Deno): send-push, ...
    config.toml
```

- **Vertical slicing por feature** dentro de cada app. Una feature no importa de otra; lo común sube a `lib/` o a `packages/`.
- **`packages/core` PURO**: no importa Next/React/Supabase web (solo `@tindivo/supabase` en `infrastructure/`).
- **Consistencia arquitectónica** (corrige el "hexagonal a medias" del v1): hexagonal/DDD ligero **solo** en `orders` (el agregado complejo); **services + repos** sobre `supabase-js` tipado para el resto.
- **pnpm catalog** centraliza versiones (un solo lugar para bump).

---

## 4. Modelo de dinero (Documento Maestro — corrige specs 09/11/12)

**2 bandas, no 3.** La banda la declara el motorizado al recoger (declarativa, no por coordenadas).

| Distancia | Delivery (paga el cliente) | Comisión (pone el restaurante) | **Total a Tindivo** | Restaurante pierde |
|---|---|---|---|---|
| **Cerca** (`near`) | S/2.00 | S/1.00 | **S/3.00** | S/1.00 |
| **Lejos** (`far`) | S/2.50 | S/1.00 | **S/3.50** | S/1.00 |
| **Pickup** (inactivo) | S/0 | — | **S/0.50** | S/0.50 |

- **Narrativa al dueño**: "S/1 de comisión; el delivery lo paga el cliente". La UI de deuda muestra el desglose (delivery del cliente vs. comisión Tindivo) sin mentir.
- El **cliente paga al restaurante** (comida + delivery). El restaurante transfiere a Tindivo el monto conjunto.
- Motorizado: **sueldo fijo** (~S/30/noche), no por entrega. Sin mensualidad. 100% transaccional.
- Cobro **solo por pedido entregado** (cancelados no suman comisión ni deuda).
- Liquidación de comisiones **semanal** (negocio→Tindivo); liquidación de efectivo **diaria** (motorizado→negocio).
- **Punto de equilibrio ≈ 10 pedidos/noche** (indicador visible en el dashboard admin).
- **Todos los montos**: `numeric(10,2)`. Coordenadas: `numeric(10,7)`. Las comisiones/bandas/umbral viven en `app_settings` (configurables, no hardcode).

---

## 5. Máquina de estados del pedido

### Estados internos del backend (granular, `order_status`)
```
[validando]* -> pending_acceptance -> confirmed -> preparing
  -> waiting_driver -> heading_to_restaurant -> waiting_at_restaurant
  -> picked_up -> delivered
(cualquiera no terminal -> cancelled)
```
`*validando` solo para contraentrega de **cliente nuevo / con strike** (validación humana por llamada, 5 min).

### Proyección al tracking del cliente (4 pasos)
| Estado backend | Paso cliente |
|---|---|
| `validando`, `pending_acceptance`, `confirmed` | **received** (Pedido recibido) |
| `preparing`, `waiting_driver`, `heading_to_restaurant`, `waiting_at_restaurant` | **preparing** (Preparando) |
| `picked_up` | **ontheway** (En camino) |
| `delivered` | **delivered** (Entregado) |
| `cancelled` | **cancelled** (mostrado aparte) |

> **Actualizado (2026-06-24):** el cliente ve **4 estados** (Pedido recibido · Preparando · En
> camino · Entregado), no 5. `confirmed` se colapsó en "recibido" por pedido del negocio. La
> ventana de cancelación del cliente sigue gatillada por el estado **crudo**
> (`validando`/`pending_acceptance`), no por el bucket "recibido" (evita ofrecer cancelar un
> pedido ya `confirmed`). El home muestra un badge "Pedido en curso" con este mismo label.

Codificado en `@tindivo/contracts` (`order-status.ts`: `ORDER_TRANSITIONS`, `STATUS_TO_TRACKING`). Los guards de transición finos viven en `packages/core` (Fase 1C).

### Cancelaciones
- **Cliente**: ventana hasta la aceptación del negocio **O** 2 min desde la creación (lo primero). Antes = cancelación libre (si prepago, devolución del fondo, Tindivo absorbe). Después = va a la bandeja del admin.
- **Negocio**: puede cancelar en `waiting_driver`/`heading`/`waiting_at_restaurant`.
- **Admin**: además puede cancelar en `picked_up` (con advertencia).
- **Motorizado**: NUNCA cancela (reporta al admin).
- Razones: `pending_acceptance_timeout`, `validation_timeout`, `prepay_timeout`, `business_cancelled`, `admin_cancelled`, `customer_cancelled`.

### Invariante crítica (fix del bug v1)
**NO validar el formato/alfabeto del `short_id` al RECONSTRUIR el agregado desde la DB; solo al CREARLO.** Generador + validador (VO) + CHECK de la columna deben estar alineados.

---

## 6. `short_id` y número de pedido

- **`short_id`**: 8 chars del alfabeto de 32 símbolos `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin I/O/0/1). Usado en URLs de tracking y en la referencia humana `#TND-XXXXXXXX`. Definido en `contracts/primitives.ts`.
- **`numero_pedido`**: secuencia atómica generada en el backend (sequence/contador), **NUNCA `Date.now()`** (otro bug del v1).

---

## 7. Pagos del cliente

- **Default contra entrega** para pedidos **< S/100** (efectivo o Yape/Plin al recibir).
- **Prepago obligatorio** para pedidos **≥ S/100** (solo Yape/Plin prepago). El checkout fuerza prepago y oculta contra entrega.
- **Prepago opcional** para cualquier cliente bajo S/100.
- **Comprobante de prepago**: el cliente **SÍ sube** captura; el **negocio valida con su propio número** (timer **10 min**, separado de los 5 de aceptación). Aprovisionar bucket de Storage. *(Resuelve contradicción spec 07 "sin captura" vs FASE-1 "sube comprobante" → manda FASE-1.)*
- **Yape y Plin son equivalentes** (misma lógica, cambia número/QR). No es pasarela: Tindivo **no retiene fondos**.
- **Límite de vuelto**: parametrizado en `app_settings` (no hardcode como el `total+50/+150` inconsistente del demo).

---

## 8. Antifraude: strikes y validación humana

- **Validación por llamada** (la hace la **cajera** por default; el admin escala): todo **cliente nuevo** (primer pedido de un número), **monto grande**, y números con **strike** previo. El recurrente confiable fluye sin llamada. Prepago no se llama (ya pagó).
- **Strikes anclados a número Y dirección** a la vez (cambiar uno no limpia el otro). **2 strikes → contra entrega bloqueada** (solo prepago).
- **Protocolo no-show**: motorizado espera 5 min en la puerta → reporta con 1 tap → strike + entra a la bandeja del admin (reporte tipo `no_show`) → cliente recibe notificación inmediata.
- **Salir de un strike**: no hay botón "paga y vuelve". Excepción: el cliente deja un reporte (`strike_reactivation`) y el admin lo revisa caso a caso.
- **Fake de restaurante**: Tindivo no absorbe nada automático; toda compensación pasa por revisión del admin; tope ~S/30–40.
- **Pedidos manuales**: capturar número+dirección estructurados; el bloqueo por strikes **también** aplica al canal manual.

---

## 9. Fondo de contingencia

- Reserva inicial **S/200–300**. Único uso: devolución inmediata al cliente cuando un restaurante falla y el dueño no está.
- **Registro contable obligatorio** en el pedido: cliente, motivo, monto, captura, timestamp+operador, **actor que carga** (`restaurante` suma a deuda / `tindivo` absorbe).
- El negocio puede **disputar dentro de 48h** (congela deuda) → reporte tipo `advance_dispute`; el admin resuelve.

---

## 10. Reglas de tiempo

| Regla | Valor |
|---|---|
| Ventana de aceptación del negocio | **5 min** → no acepta = auto-cancela (`pending_acceptance_timeout`) |
| Validación de comprobante (prepago) | **10 min** (separado de los 5 de aceptación) |
| Validación por llamada (cliente nuevo/strike) | **5 min** → no valida = `validation_timeout` |
| Extensión de prep del negocio | **+10 min**, máx **2 veces** (tope +20); notifica al motorizado |
| Espera del motorizado en puerta (no-show) | **5 min** |
| Transferencia driver→driver (post-Fase 1) | TTL 30s, timeout-as-accept |
| Auto-confirmación de liquidación de efectivo | **24h** (`auto_assumed_confirmed`) |

- En Fase 1 (1 motorizado, despacho inmediato manual) **NO se activa** la cola urgente ni R1-R5. El modelo (`urgent_since`) se conserva para post-piloto (>5 min = urgente, >8 min = alerta).

---

## 11. Outbox, push y scheduling

- **Outbox real y transaccional**: el `INSERT` en `domain_events` ocurre en la **MISMA transacción** que el cambio del agregado (vía RPC/repositorio transaccional, **no** dos `await` separados como en el ejemplo del spec).
- **Relay push**: trigger `AFTER INSERT` (pg_net) lee secrets de Vault → Edge Function `send-push` (Deno + web-push). **Tag = `${event_type}-${shortId}`** (el v1 usaba solo `shortId` y colapsaba `OrderAssigned` con `OrderOverdue`). Objetivo P99 < 5s.
- **Lista de `event_types` con push** debe coincidir con el mapa de UX (fuente única en `contracts`); test que lo verifique. (El spec tenía 20 en trigger vs 26 en UX.)
- **`published_at`/retry**: la Edge Function marca `published_at`; un cron de reconciliación reprocesa no publicados con `retry_count` incremental.
- **Scheduling**: Inngest `step.sleepUntil()` para deadlines individuales (auto-cancel-pending, checkOrderOverdue, processTransferTimeout, closeDriversAtShiftEnd). **Crons failsafe pg_cron** como red de seguridad, **idempotentes** (verifican estado antes de mutar).
- **`tindivo_commission`** se calcula en el use case `MarkDelivered` (según `delivery_method` + banda + overrides del negocio leyendo `app_settings.commissions`) y se persiste como snapshot inmutable; el trigger solo suma a `balance_due`.

---

## 12. Seguridad / RLS

- **RLS activada en TODAS las tablas** con policies **explícitas por rol** (entregable bloqueante de Fase 1B). `RLS ON` sin policy = tabla inaccesible salvo `service_role`.
- Helpers `SECURITY DEFINER` (`current_user_role`, `current_business_id`, `current_driver_id`) **con `SET search_path = ''`** (el spec los declaraba sin search_path = anti-patrón de hijacking).
- **Multi-rol desde el día 1**: `users` + `user_roles` + JWT `app_metadata.user_roles` leído por el middleware sin query a DB. (El v1 lo parcheó tarde y reescribió RLS 3 veces.)
- `public.users.id = auth.users.id`. Las FKs de dominio apuntan a `public.users`; `push_subscriptions` apunta a `auth.users` (CASCADE).
- **Idempotencia estilo Stripe** (`Idempotency-Key`) en todos los POST de creación.
- **Validación en boundaries** (Zod en controllers + api-client); dentro del dominio bastan los tipos TS. RLS es la red de seguridad, no la primera línea.
- `push_subscriptions` y `push_delivery_log` **con RLS** (el v1 no la tenía).
- Migraciones **idempotentes** (`DROP ... IF EXISTS` / `CREATE OR REPLACE`), nunca scripts monolíticos no re-ejecutables.

---

## 13. Resolución de las 24 contradicciones detectadas

| # | Tema | Resolución |
|---|---|---|
| 1 | Precedencia de documentos | §0 (FASE-1 › Maestro › specs › visual › legacy). |
| 2 | Bandas de distancia (2 vs 3) | **2 bandas** (`near`/`far`); eliminar `medium`. §4. |
| 3 | Nombres de estados + `validando` | Máquina canónica + proyección. §5. |
| 4 | Apps (4 vs 5) | 4 frontends + 1 API = 5 proyectos Vercel. §3. |
| 5 | Outbox no transaccional | Atomicidad real en una transacción. §11. |
| 6 | `event_types` push: trigger vs UX | Reconciliar contra fuente única + test. §11. |
| 7 | `published_at`/retry indefinido | Edge marca `published_at` + cron reconciliador. §11. |
| 8 | Comprobante de prepago: subir o no | **Sí sube**; negocio valida (10 min). §7. |
| 9 | Gate del carrito sin auth | Onboarding diferido: ver carrito sin login; login al checkout. §15. |
| 10 | Límite de vuelto / pago en pickup | Vuelto en `app_settings`; pickup inactivo. §7/§14. |
| 11 | Cobertura: radio vs polígono | **Polígono** (`app_settings.coverage_polygon`), editable por el admin con Leaflet-draw; el cliente bloquea elegir fuera (point-in-polygon). El radio 3km (`coverage`) queda como **fallback**. *(cambiado de "radio 3km" el 2026-06-22)* |
| 12 | Referencia de dirección mínima | **Mín 15 / máx 140** (`ADDRESS_REFERENCE_MIN`/`ADDRESS_REFERENCE_MAX` en `contracts`); contador en vivo en todos los formularios. *(bajado de 20 el 2026-06-22)* |
| 13 | Alerta urgente (5 vs 8 min) | No se activa en Fase 1; modelo conservado (>5 urgente, >8 alerta). §10. |
| 14 | Helpers RLS sin `search_path` | `SET search_path = ''` en todos. §12. |
| 15 | RLS incompleta | Todas las policies antes de exponer; bloqueante. §12. |
| 16 | DDL de asignación faltante | No necesarias en Fase 1 (sin asignación auto); stub/post-piloto. §14. |
| 17 | Script de esquema no idempotente | Migraciones versionadas idempotentes. §12. |
| 18 | `tindivo_commission`: quién calcula | Use case `MarkDelivered` + snapshot; trigger solo suma. §11. |
| 19 | `platform_schedule` inconsistente | Seed con horario real de La Florencia (~18:00–23:00). |
| 20 | `settlements → overdue` | Cron diario marca `overdue` las `pending` vencidas. |
| 21 | `auto_assumed_confirmed` (24h) | Función Inngest/cron dedicada con flag de auditoría. |
| 22 | Nombres de campo de efectivo | `confirmed_amount` canónico; fuente de verdad documentada. |
| 23 | FK `users` vs `auth.users` | `public.users.id = auth.users.id`; FKs a `public.users`. §12. |
| 24 | Estética: light/dark, color, iconos | Design system v2: light, `#F97316`, Material Symbols, Supabase. §16. |
| + | Strikes en canal manual | Capturar número+dirección; bloqueo aplica también a manual. §8. |
| + | Reembolso de prepago cancelado | Matriz del fondo de contingencia. §9. |

---

## 14. Alcance Fase 1 — qué se activa vs qué se modela pero no

**Se construye el modelo de datos para escalar a N negocios/motorizados, pero solo se activa lo mínimo del piloto.**

**Activo en Fase 1:**
- 1 restaurante (La Florencia, `catalog_full`), de noche (~18:00–23:00), 1 motorizado.
- Motorizado: **panel plano** sin asignación automática.
- Contra entrega + prepago con umbral S/100; validación humana por llamada; strikes; fondo de contingencia.
- Liquidación de efectivo diaria; liquidación semanal de comisiones **MANUAL** (la UI del admin SÍ se construye; la generación automática queda fuera).
- `order_event_log` + registro de adelantos + auditoría inmutable desde el día 1.

**Modelado pero NO activo (UI no se construye en Fase 1):**
- Pickup; asignación automática R1-R5 / FCFS; transferencias driver→driver; `occupancy_slots`; cola urgente; liquidación semanal automática; multi-tenant; pasarela de pago; GPS en mapa; app de Soporte.
  - **Login social (Google): ACTIVADO el 2026-06-22** (provider habilitado en Supabase + Google Cloud). El correo+contraseña sin verificación sigue disponible.
- Tablas presentes igualmente: `order_assignment_rejections`, `order_transfer_requests`, `driver_restaurants`, `occupancy_slots` (columna).

---

## 15. Comportamiento del cliente (verdad visual = demo + spec v2)

- **Onboarding diferido / auth gate dual**: se puede armar/ver el carrito **sin login**; se exige login solo al avanzar a checkout (gate duro). *(Corrige el demo que redirige a auth al abrir carrito.)*
- Estado `validando` visible ("Validando tu pedido…").
- Estado de confirmación honesto ("Esperando que el restaurante confirme…") con reloj.
- Delivery fee por banda visible (S/2 cerca / S/2.50 lejos según dirección).
- OTP de celular en el **primer pedido contra entrega** (proveedor por decidir — ver §17).
- Gestión de direcciones: una sola `default`; al eliminar la default se promueve la primera restante.

---

## 16. Diseño (fuente: `06-ui-design-system.md` + `Tindivo Design Spec.html`)

- **Filosofía**: cercano, no corporativo. Mobile-first 1:1 (base 402×874). **Sin dark mode**. Bordes muy redondeados. Naranja protagonista.
- **Color**: Brand `#F97316` · Brand Dark `#C2410C` · Brand Light `#FED7AA` · Ink `#1A1614` · Surface `#FAF6F1` · Card `#FFFFFF` · Border `#EAE7E2` · Success `#16A34A` · Warning `#F59E0B` · Danger `#DC2626` · Info `#0EA5E9`.
- **Tipografía**: Manrope única en toda la plataforma (peso 600-800 displays · 400-600 body/números · 500-700 microlabels/IDs/precios, con `tabular-nums` en contextos numéricos). Máx 3 tamaños por vista.
- **Iconos**: Material Symbols Rounded (único set). Nunca emojis como iconos UI.
- **Radius**: sm8/md12/lg16/xl24/2xl32/3xl48. **Glassmorphism solo en topbars**.
- **Color de papelito por negocio**: franja/dot vertical único por negocio en todas las cards de pedido.
- **Estados**: skeletons (no spinner), empty states con icono+copy+CTA, errores inline (no toast), success en toast 3s o modal. Touch ≥44px. Respetar `prefers-reduced-motion`.
- **Layout**: `GlassTopBar` sticky + `main` (pt-20 pb-24) + `BottomNav` en cliente/motorizado. Cliente: base 768px que escala por vista en tablet/desktop (`md`/`lg`/`xl`) — grids de 2-3 columnas en home/historial, split contenido+sidebar sticky (carrito/resumen) en negocio/checkout; staff escala a 1280px.

---

## 17. Pendientes que aún requieren confirmación del usuario

> No bloquean Fase 1A/1B/1C. Se confirmarán antes de la fase correspondiente.

- **OTP del cliente**: proveedor de SMS/WhatsApp para validar el celular (tiene costo y cuenta). — *Fase 6.*
- **Credenciales**: Vercel (team/proyectos), Inngest (signing key o self-host), VAPID (generar par), DNS de `tindivo.com`. — *Fase 2/7.*
- **Backups y PII**: destino de backups (el v1 mencionaba Google Drive personal = riesgo de cumplimiento). — *Fase 7.*
- **Pickup**: confirmado soportado por el modelo pero inactivo; el cierre de `delivered` en pickup (sin motorizado) se define si se activa. — *post-piloto.*

---

## 18. Modo "solo catálogo (WhatsApp)" — `catalog_only` (2026-07-01)

**Contexto**: el flujo delivery end-to-end no está listo para lanzar; se lanza la app del cliente como catálogo con pedido por WhatsApp, por negocio y reversible. **No se elimina código delivery — todo ramifica por capacidad.**

- **Nueva capacidad derivada `catalog_only`**: `publishes_catalog ∧ ¬accepts_web_pickup ∧ ¬accepts_web_delivery`. Se añadió el valor al enum `business_primary_capability` (migración `0049`) y la rama a `derive_business_primary_capability` (migración `0050`). El valor de enum es permanente (PG no permite quitarlo); aceptado.
- **CHECK `capabilities_consistent` relajado** (`0050`): publicar catálogo ya NO exige aceptar pedidos web. Se conservan las otras dos cláusulas (`pickup ⇒ catalog`; `delivery ⇒ catalog ∧ drivers`).
- **`businesses.whatsapp_number`** (`0050`): contacto **PÚBLICO opt-in** para pedidos por WhatsApp (formato `^9[0-9]{8}$`). Se expone en `/public/businesses*`. **`phone` sigue siendo privado** — no reutilizarlo jamás para esto.
- **Control del modo: SOLO admin** (presets "Delivery Tindivo" / "Solo catálogo (WhatsApp)" en `admin/negocios`, vía `PATCH /admin/businesses/:id` que ahora acepta los 4 flags). Los toggles de Capacidades en el panel del negocio quedaron **solo lectura**, y `PATCH /business/profile` ya **no acepta capacidades en su schema** (enforcement server-side, no solo UI — un negocio no puede auto-promoverse a delivery vía curl).
- **Cliente**: el modo se resuelve con **fetch fresco** de `/public/businesses/:id` (hook `useBusinessOrdering`, cache 60s) — nunca snapshoteado en el carrito persistido. En modo catálogo, la bolsa muestra "Pedir por WhatsApp" (wa.me con carrito formateado) + "Llamar"; `/checkout` redirige a la página del negocio.
- **Guard de capacidades en `POST /customer/orders`** (409 `conflict`): el RPC `create_customer_order` NO valida `accepts_web_delivery/pickup` — el guard del route handler es obligatorio. *(Follow-up opcional: duplicar el check dentro del RPC.)*
- **Panel del negocio en modo catálogo**: nav reducido a Menú + Configuración (gate en las demás rutas). Excepción: si hay pedidos delivery en vuelo al cambiar de modo, la sección Pedidos sigue visible con aviso.
- La **pausa** (`accepting_orders_until`) no afecta el CTA de WhatsApp (es out-of-band de la plataforma).
- **Visibilidad de secciones de configuración por modo: declarativa** (`hiddenFor` en el array `SECTIONS` de `apps/negocios/app/configuracion/page.tsx` — fuente única para nav, render y payload). Para `catalog_only` se ocultan **"Tiempos y precio"** (sin delivery web no hay ETA/fee) y **"Pago Yape"** (el Yape de la plataforma es solo para prepago de pedidos web; en catálogo el cobro es directo por WhatsApp). Los datos NO se borran: dejan de mostrarse/enviarse y reaparecen al volver a delivery.

---

## 19. Horario de atención visible al cliente + estado abierto/cerrado (2026-07-02)

**Fuente de verdad del cálculo**: `getOpenStatus(days, now)` en `packages/contracts/src/schedule.ts` (puro, con 25 tests). Convenciones que NO se rompen:

- **`day_of_week` 0=Lunes..6=Domingo** — la convención del editor del panel de negocios (≠ `Date.getDay()`, que usa 0=Domingo y NUNCA se usa; la hora/día se resuelve con `Intl.DateTimeFormat` en `America/Lima`, porque el server puede correr en otra TZ). El comentario stale de 0002 ("0=domingo") se corrigió en la migración `0051`.
- **Semántica de turno `[start, end)`**: apertura inclusiva, cierre exclusivo (paridad con `is_within_platform_schedule` de 0029).
- **Cruce de medianoche derivado POR TURNO** (`end <= start` ⇒ cruza): la columna `crosses_midnight` se IGNORA (el editor solo la deriva del turno 1). Un turno que cruza cubre la madrugada del día siguiente aunque ese día esté `is_open=false`.
- **Sin horario configurado = siempre abierto** (mismo default que la plataforma): no se muestra UI de horario y no se bloquea nada.

**Exposición**: `GET /public/businesses/:id` devuelve `schedule` (6 columnas seguras) y la lista devuelve `is_open_now: boolean | null` (null = sin horario) para el badge del home. RLS `bs_public_read` ya permitía la lectura.

**Comportamiento por modo**: negocios con pedidos web cerrados → chip "Cerrado", banner "Sin atención ahora", ítems y "Ir a pagar" deshabilitados (tick 30–60s en vivo), y **guard 409 `conflict`** en `POST /customer/orders` ("El restaurante está cerrado ahora…", distinto del 403 de pausa). `catalog_only` → horario SOLO informativo; WhatsApp/Llamar nunca se bloquean.

**Idempotencia**: el replay de una Idempotency-Key ya completada se resuelve ANTES de los guards de pausa/capacidades/horario (`findCompletedReplay` en `apps/api/lib/http/idempotency.ts`) — un retry de un pedido ya creado devuelve su 201 original aunque el negocio haya cerrado entre medio (contrato estilo Stripe).

**Feedback de guardado en el panel** (DECISIONS §16 aplicado): éxito = toast verde 3s global (`notifySuccess` + `SuccessToastHost` en el chrome persistente — sobrevive navegación); errores siguen inline. Cableado en configuración, editor de horario, editor de plato y uploads de imágenes.
