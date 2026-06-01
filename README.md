# Tindivo 2.0

Plataforma de delivery hiper-local para pueblos del interior del Perú.
Reconstrucción desde cero del sistema v1, sobre una base limpia, escalable y
mantenible. Piloto: **San Jacinto, Áncash** · restaurante **La Florencia**.

> 📖 Documentación de producto en `Docs/`. **Decisiones canónicas en
> [`DECISIONS.md`](./DECISIONS.md)** (resuelve contradicciones entre specs).
> Instrucciones para agentes en [`CLAUDE.md`](./CLAUDE.md).

## Stack

Next.js 16 · React 19 · TypeScript 6 (strict) · Tailwind v4 · Zod v4 ·
Supabase (Postgres 17 + Auth + Realtime + Storage + Edge Functions) ·
TanStack Query · Zustand · Inngest · Biome · Vitest · Turborepo + pnpm.

## Estructura

```
apps/
  api/            REST único /api/v1            (api.tindivo.com)
  customer/       PWA cliente                   (tindivo.com)
  negocios/       PWA negocio                   (negocios.tindivo.com)
  motorizados/    PWA motorizado                (motorizados.tindivo.com)
  admin/          panel de control              (admin.tindivo.com)
packages/
  contracts/      Zod canónico (primitivas, enums, estados, errores)
  core/           dominio puro (hexagonal en orders)
  supabase/       cliente + database.types.ts generado
  api-client/     cliente REST tipado
  ui/             primitives shadcn + patterns Tindivo
  inngest/        funciones de scheduling
  tsconfig/       presets TypeScript compartidos
supabase/
  migrations/     SQL versionado e idempotente
  functions/      Edge Functions (Deno)
```

## Cómo empezar

```bash
# Requisitos: Node >=20.9 (recom. 24), pnpm 9
pnpm install

# Copia y completa las variables de entorno
cp .env.example apps/<app>/.env.local

# Desarrollo
pnpm dev
```

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta todas las apps (Turborepo) |
| `pnpm build` | Build de todo el monorepo |
| `pnpm lint` / `pnpm format` | Biome check / format |
| `pnpm type-check` | Type-check (todas las apps/packages) |
| `pnpm test` | Tests (Vitest en `core` y `contracts`) |
| `pnpm db:types` | Regenera tipos desde Supabase |

## Estado del build

Construcción por fases (ver tablero de tareas):

- [x] **Fase 1A** — Fundaciones monorepo + decisiones canónicas + contratos base
- [x] **Fase 1B** — Esquema DB consolidado + RLS + tipos generados (34 tablas, 71 RLS, 17 enums)
- [x] **Fase 1C** — `packages/core` (dominio orders) + Vitest (25 tests) + drift de enums
- [x] **Fase 1D** — CI GitHub Actions + drift check
- [~] **Fase 2** — Backend: API REST, Auth, Outbox, Inngest, logs
  - [x] `apps/api` (Next 16) + framework HTTP (Problem Details RFC 9457, CORS, request-id)
  - [x] Clientes Supabase (SSR + service-role) + auth (requireUser/requireRole)
  - [x] Endpoints públicos: `/health`, `/public/businesses`, `/public/businesses/[id]` (menú), `/public/orders/[shortId]`
  - [x] `@tindivo/api-client` (cliente HTTP tipado para las 4 apps)
  - [x] **Auth Bearer** (cross-origin/Capacitor-ready): `requireUser`/`requireRole` validan JWT del header
  - [x] **Write-path**: RPC atómica `create_customer_order` (pedido+ítems+outbox+auditoría en 1 tx, umbral prepago) + `POST /customer/orders` con `withIdempotency` (estilo Stripe) — **verificado e2e (signup→login→crear→replay)**
  - [x] **Ciclo de vida**: RPC `advance_order` (guards estado+rol+propiedad, `FOR UPDATE`, snapshot de comisión) + endpoints `/business/orders/[id]/transition` y `/driver/orders/[id]/transition` — **verificado e2e (crear→aceptar→preparar→tomar→recoger→entregar, comisión+balance+auditoría+guards)**
  - [x] **Admin endpoints** + asignación de rol explícita (vía segura): `POST /admin/businesses`, `POST /admin/drivers`, `GET /admin/orders` + admin fundador `admin@tindivo.com` bootstrapeado — verificado e2e
  - [x] **Anti-fraude (strikes/no-show)**: acción `no_show` en `advance_order` (cancela + strike anclado a número/dirección + bloqueo de contraentrega, atómico) + guard en `create_customer_order` (bloqueado ⇒ solo prepago) — **verificado e2e (15 asserts: 2 strikes→bloqueo, independencia de anclas, prepago forzado)**
  - [x] **Bandeja de reportes**: trigger `strike→reports` + `GET /admin/reports` + `POST /admin/reports/[id]/resolve` — **verificado e2e (8 DB + 5 HTTP)**
  - [x] **Liquidación semanal de comisiones**: RPCs `generate_settlements` (factura por período, zona Lima, idempotente) + `pay_settlement` (registra pago → descuenta `balance_due` → **autodesbloqueo por mora**) + `GET/POST /admin/settlements` + `POST /admin/settlements/[id]/pay` — **verificado e2e (14 DB + 4 HTTP)**
  - [x] **Liquidación diaria de efectivo**: RPCs `create/confirm/dispute/resolve/auto_confirm_cash_settlement` + endpoints `/driver/cash-settlements` (GET resumen + POST), `/business/cash-settlements/[id]/confirm|dispute`, `/admin/cash-settlements` + `[id]/resolve`; disputa → reporte `cash_difference` — **verificado e2e (14 asserts: confirmar, guard de propiedad, disputar→reporte→resolver, auto-confirmar)**
  - [x] **Fondo de contingencia** (FASE-1 §10): RPCs `create/dispute/resolve_contingency_advance` (fondo `current` ↓ al adelantar, `balance_due` ↑ si carga el restaurante, congela/descongela en disputa, reposición + limpieza de deuda al pagar liquidación) + reporte `advance_dispute` + endpoints `/admin/contingency(+/[id]/resolve)` y `/business/contingency/[id]/dispute` + tab Contingencia (admin) y sección de disputa en `/deuda` (negocio) — **verificado e2e (7 asserts, rollback)**
  - [x] **Push web (Fase G)**: VAPID generado + distribuido · `POST/DELETE /push/subscriptions` · **Edge Function `send-push`** (Deno + web-push: resuelve destinatarios por `OrderStatusChanged.action`/`OrderExpired`/`CashDelivered`, envía, registra en `push_delivery_log`, purga 404/410) · **trigger `dispatch_event`** (outbox `domain_events` → `net.http_post`, ignora eventos de auditoría) — **verificado e2e (insert→trigger→pg_net→función → HTTP 200 `{recipients:1}`)**. Falta para entrega real: setear `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` como secrets del Edge Function + probar en HTTPS (Fase J)
  - [x] **Validación por llamada** (estado `validando`): `create_customer_order` entra a `validando` si contraentrega de número nuevo / con strike / monto grande (`app_settings.validation`); RPC `validate_order` (cajera pass/fail) + endpoint `/business/orders/[id]/validate` + botones "Validar/No contesta" en el panel — **verificado e2e (8 asserts)**
  - [x] **Prepago + comprobante** (estado `validando`): `create_customer_order` enruta el prepago a `validando`; cliente sube comprobante a Storage `payment-proofs/<uid>/…` (RLS own-folder); negocio lo ve por signed URL (`GET /business/orders/[id]/prepay-proof`) y **aprueba** (`validate_order` pass → `pending_acceptance`) o **rechaza** (→ cancelado); endpoints `/customer/orders/[id]/prepay-info` + `/prepay-proof` — **verificado e2e (7 asserts: prepago→validando, aprobar→pending, S/120 no rechazado por umbral, rechazar→cancelado, `prepay_timeout` expira solo el `validando`, NO un pedido ya aprobado)**
  - [x] **Inngest**: cliente + `serve` + RPC `expire_order` + timers **aceptación** (verificado vs Dev Server) + **auto-confirmación efectivo 24h** + **validación 5 min** + **prepago 10 min** (`orderPrepayTimeout` → `expire_order(prepay_timeout)`, guard de estado en 0023). Keys cloud completas.

- [~] **Fase 3 — App Admin** (`apps/admin`, :3003)
  - [x] Login + monitor de pedidos + crear negocio + crear motorizado — **build + type-check + visual + endpoints e2e** ✅
  - [x] **Bandeja de reportes** (pestaña Reportes: lista abiertos + resolver/descartar) — build + e2e ✅
  - [x] **Cobros** (pestaña: generar liquidaciones de la semana + marcar pagado) — build + e2e ✅
  - [x] **Efectivo** (pestaña: resolver disputas de efectivo con monto + nota) — build + e2e ✅
  - [x] **Contingencia** (pestaña: balance del fondo + registrar adelanto + resolver disputas) — build + e2e ✅
  - [x] **Dashboard + Métricas** (tab por defecto): RPC `admin_metrics(from,to)` + `GET /admin/metrics?range=today|7d|30d` (rango Lima) + 8 KPIs del rango (GMV, comisión, ticket, tiempo, a tiempo, efectivo) + monitor en vivo + tablas por negocio/motorizado/razón de cancelación — **smoke HTTP 10/10** ✅
  - [x] **Configuración** (pestaña): `GET/PATCH /admin/settings` (lista blanca + validación Zod por clave) + cards editables (comisiones, horario operativo, umbrales prepago/validación, timers, WhatsApp soporte) — **smoke HTTP 6/6** ✅
  - [x] **Gestión Negocios** (lista + editar/overrides + activar/desactivar + bloquear/desbloquear + **impersonar "Entrar como"**) y **Gestión Motorizados** (lista + activar/desactivar + impersonar) — `GET/PATCH /admin/{businesses,drivers}[/[id]]` + `POST /admin/impersonate/[userId]` — **smoke HTTP** ✅
  - [x] **Auditoría** (`GET /admin/audit?shortId=`: bitácora `order_event_log`) + **cancelar pedido** desde Pedidos (`POST /admin/orders/[id]/cancel`, razón obligatoria → `admin_cancelled`) — **smoke HTTP** ✅
  - [ ] Diferido para el piloto: envío de tracking por WhatsApp (necesita API de WhatsApp) y reasignación de motorizado (FASE-1 difiere multi-driver con 1 moto)
- [~] **Fase 4 — App Negocio** (`apps/negocios`, :3002): login + pedidos en vivo (Realtime) + **audio crítico** + aceptar/preparar/listo + **+10 min (extend_prep)** — build + transición e2e ✅
  - [x] **Editor de menú** (`/menu`: CRUD vía RLS owner) — **verificado e2e (9 asserts)** ✅
  - [x] **Efectivo** (`/efectivo`: confirmar/disputar entregas del motorizado, Realtime) — build + e2e ✅
  - [x] **Pedido manual** (`/nuevo`: ítems de menú o libres → `create_business_manual_order`) — **e2e (14 asserts)** ✅
  - [x] **Deuda** (`/deuda`: balance + historial de liquidaciones, RLS) — build ✅
  - [x] **Configuración** (`/configuracion`: perfil + Yape + ETA + capacidades vía `PATCH /business/profile`, CHECK de consistencia) — build + e2e ✅
  - [x] **Bloqueo/desbloqueo** (`block/unblock_business` + banner de suspensión) — e2e ✅
  - [x] **Editor de horario (Fase B+)** (`/configuracion` → `ScheduleEditor`): 7 días con `is_open`, hasta **2 turnos** y **cruce de medianoche** auto-derivado, upsert por RLS owner a `business_schedule` (UNIQUE business+día) — build + smoke (7 filas) ✅
  - [ ] Onboarding wizard (5 pasos) → guía opcional de primer uso (el negocio ya se autoconfigura vía `/configuracion` + `/menu`); sin backend nuevo
- [x] **Fase 5 — App Motorizado** (`apps/motorizados`, :3004): login + panel plano (disponibles/activos) + tomar→llegué→recoger(banda)→entregar(pago) — build ✅
  - [x] **Reportar no-show** (botón con confirmación en `picked_up` → strike) — build + e2e ✅
  - [x] **Disponibilidad + cierre de turno (Fase I)**: toggle Disponible/No en el panel (respeta `platform_schedule`) vía `set_driver_availability` + `GET/POST /driver/availability` + barrido `close_drivers_outside_schedule` por **cron cada 15 min** — **verificado e2e (dentro→disponible, fuera→rechazado, barrido apaga)**. Transferencias R1-R5 diferidas por FASE-1 (1 moto)
  - [x] **Efectivo** (`/efectivo`: resumen del día por negocio + entregar efectivo) — build + e2e ✅ · falta disponibilidad/turno, offline

- [x] **Fase 6 / Fase C** — App Cliente (re-skin pixel-fiel al prototipo `jesus`, datos reales)
  - [x] **Fundación visual** portada del prototipo: `globals.css` (botones, cards, chips, sheet, `t-ph-image`, tabs sticky) + `components/ui.tsx` (iconos SVG, `ProductImage`, `Segmented`, `ScreenHeader`, `BottomSheet`)
  - [x] **Landing** idéntica (eyebrow, wordmark, saludo, search, hero naranja, cards) cableada a `/public/businesses` — **verificada con screenshot Playwright vs prototipo** ✅
  - [x] **Menú** idéntico (hero con gradiente, tabs sticky, ProductRow con badge/precio/"+") + **product-modal con modifiers** (single/multi, validación, nota, qty) — **verificado con screenshot** ✅
  - [x] **Carrito con modifiers**: store modifier-aware + `create_customer_order` precia y persiste extras (`customer_order_item_modifiers`) + `/public/businesses/[id]` devuelve modifiers — **verificado e2e (7 asserts: monto con extras, snapshots, opción ajena rechazada)**
  - [x] **Auth gate dual** + **checkout** (entrega + 3 pagos + umbral ≥S/100)
  - [x] **Tracking re-skineado** al prototipo: card de estado oscura (badge pulsante + barra de progreso + ETA) + **timeline de 5 pasos** + **detalle con ítems** (`get_tracking` ahora devuelve items/total/paymentIntent/cancelReason) — polling 8 s
  - [x] **`/cuenta`** (perfil + direcciones CRUD vía RLS self + historial de pedidos + logout) y **`/terminos` + `/privacidad`** (Ley 29733) enlazados desde `/entrar` — build ✅ (datos por browser-RLS, sin backend nuevo)
  - [x] **Checkout re-skineado** al prototipo (2 pasos: Datos de entrega con Segmented + **selección de dirección guardada** + tel +51 + resumen → Método de pago) + **pantalla de confirmación** — build ✅
  - [x] **Prepago (timer 10:00 + comprobante)**: componente `Prepay` en checkout (cuenta atrás 600 s, número Yape del negocio, subida del comprobante a Storage) + UI de aprobación/rechazo en el panel del negocio — build ✅ (e2e backend 7/7)
  - [x] **Cancelación + pantalla de cancelado**: RPC `cancel_customer_order` (ownership + ventana `validando`/`pending_acceptance`) + `POST /customer/orders/[id]/cancel` + botón "Cancelar pedido" (solo dueño, vía RLS) + pantalla terminal con copy por motivo (timeout prepago / no confirmado / negocio / cliente) + `SupportLink` WhatsApp — **verificado e2e (6 asserts, rollback)**
  - [ ] OTP en primer contraentrega → **post-MVP** (`14-roadmap`: la llamada de la cajera valida)
- [x] **PWA (Fase G)** — las 4 apps son instalables: `app/manifest.ts` (standalone, theme `#F97316`, icono SVG) + `public/sw.js` (push + notificationclick, sin offline-sync) + `<PushManager/>` (registra SW, auto-suscribe si hay permiso, botón "Activar avisos") + util compartido `@tindivo/ui` (`subscribeToPush`) — builds ✅
- [x] **Realtime cliente (Fase H)** — el tracking del dueño autenticado se actualiza al instante vía Supabase Realtime (`postgres_changes` UPDATE sobre su `orders.id`); el polling de 8 s queda como fallback para enlaces compartidos. Negocios/efectivo ya usaban Realtime. Design system: las apps son prototype-fieles + mobile-first (cubierto); pulido de primitivas (toasts/BottomNav/Material Symbols) queda opcional.
- [ ] **Pendiente** — go-live (Fase J): deploy a Vercel + DNS + secrets del Edge Function (VAPID) + seeds de go-live (requiere credenciales del usuario)
- [ ] **Fase 7** — Legales y go-live (DNS/Vercel)
