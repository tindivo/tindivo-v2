# Tindivo 2.0 — Decisiones canónicas

> **Qué es este documento.** La fuente única de verdad para las decisiones que
> resuelven contradicciones entre los 20 documentos de `Docs/`. Cuando un spec y
> este documento difieran, **gana este documento**. Se mantiene vivo: cada
> decisión nueva o cambio se registra aquí, no en specs paralelos.
>
> Última actualización: 2026-08-07 (pedido manual: la cajera teclea el total con envío incluido y la comida se deduce en el RPC — §22).

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
| Pago y subida de comprobante (prepago) | **15 min** (`awaiting_payment` → `prepay_timeout`); era 10 hasta la migración 0168 |
| Validación de comprobante (prepago) | **10 min** (separado de los 5 de aceptación) |
| Validación por llamada (cliente nuevo/strike) | **5 min** → no valida = `validation_timeout` |
| Extensión de prep del negocio | **+10 min**, máx **2 veces** (tope +20); notifica al motorizado |
| Espera del motorizado en puerta (no-show) | **5 min** |
| Transferencia driver→driver (post-Fase 1) | TTL 30s, timeout-as-accept |
| Auto-confirmación de liquidación de efectivo | **24h** (`auto_assumed_confirmed`) |

- **Dónde viven estos números (migración `0174`).** Los cuatro primeros salen de
  `app_settings.timers` y de ningún otro sitio. Los aplica una sola función,
  `cancel_expired_prepay_orders()`, que corre cada minuto por el pg_cron
  `auto-cancel-prepay-timeout` y que llama también el panel de la cajera para
  barrer al instante. Los leen además `get_tracking` (contador del cliente) y
  `useBusinessTimers` (contador de la cajera). Antes de la 0174 estaban
  escritos a mano en el SQL de cuatro cron distintos y `app_settings` era
  decorativo: por eso la `0113` pudo subir `acceptanceMinutes` a 15 sin que la
  base cambiara de comportamiento. **Si añades un plazo, que lo lea de ahí.**

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

## 16. Diseño (fuente: `packages/ui/src/theme.css` + `apps/motorizados`)

- **Filosofía**: cercano, no corporativo. Mobile-first 1:1 (base 402×874). **Sin dark mode**. Bordes muy redondeados. Naranja protagonista.
- **Color**: Brand `#F97316` · Brand Dark `#C2410C` · Brand Light `#FED7AA` · Ink `#1A1614` · Surface `#FAF6F1` · Card `#FFFFFF` · Border `#EAE7E2` · Success `#16A34A` · Warning `#F59E0B` · Danger `#DC2626` · Info `#0EA5E9`.
- **Tipografía**: **Geist** para display, body y labels; **JetBrains Mono** solo para datos técnicos (IDs, precios, horas), con `tabular-nums` en contextos numéricos. Máx 3 tamaños por vista. La jerarquía se logra con peso (600-800 displays · 400-600 body · 500-700 microlabels), no con familias distintas.
  > Esta línea decía «Manrope única en toda la plataforma» y contradecía al código
  > desde la migración del design system (ver `Docs/context/design-system-migration-plan.md`,
  > que eligió Geist por ser más cercana al look moderno manteniendo legibilidad en
  > móvil).

> **No hay documento de design system.** Lo había (`Docs/06-ui-design-system.md`) y se
> eliminó porque llevaba tiempo desviado del código y ya indujo a error a más de una
> sesión. La fuente de verdad son los **tokens en `packages/ui/src/theme.css`** y el
> **uso real en `apps/motorizados`**, que es la app más pulida. Si necesitas el
> contenido histórico: `git show HEAD~1:Docs/06-ui-design-system.md`.
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

---

## 20. Buscador del catálogo en el cliente (2026-07-02)

Supera el "search bar no funcional v1.0" de `Docs/07-flujo-cliente.md` RF-CAT-03. Busca **negocios** (nombre + eslogan) y **platos** (nombre + descripción), insensible a **mayúsculas y tildes** en ambas direcciones ("PIÑA" ↔ "pina").

- **Filtrado en Postgres, no en el cliente** (migración `0052`): extensiones `unaccent` + `pg_trgm` (schema `extensions`), wrapper **`public.f_unaccent`** (IMMUTABLE para poder indexar; si cambian las reglas del diccionario → REINDEX) e **índices GIN trigram** sobre `f_unaccent(lower(name || ' ' || descripción/eslogan))`.
- ⚠️ **Grants de `f_unaccent`**: los índices de expresión evalúan la función con el rol que ESCRIBE la fila → EXECUTE para `authenticated` (el panel escribe `menu_items` directo vía PostgREST; revocarlo rompería el editor de menú) y `service_role` (la API escribe `businesses`). Revocada de `public`/`anon` (no escriben filas; el default de Supabase la dejaba invocable vía `/rest/v1/rpc/`).
- **RPC `search_catalog(p_query, p_limit)`** service-only (revoke anon/authenticated; la superficie pública es `GET /api/v1/public/search?q=`, mín 2 chars, máx 60): multi-palabra con AND de términos (`LIKE ALL`), wildcards `%_\` escapados, ranking por `similarity`, solo columnas públicas seguras, mismos filtros de publicación que `/public/businesses` (+ categoría activa y plato disponible).
- **`is_open_now` NO se calcula en el RPC**: la fuente de verdad del horario es `getOpenStatus()` en TS (§19); el home enriquece las cards de resultados desde su lista ya cargada.
- Cliente: hook `useCatalogSearch` (debounce 300ms + AbortController anti-race); los resultados reemplazan hero+lista; los platos navegan a la página del negocio. Colisiones tipo "año"/"ano" son tolerancia de búsqueda deseada.

---

## 21. Color de papelito: paleta establecida, fin de la unicidad (2026-07-02)

El alta de un negocio fallaba con `conflict` cuando el color elegido ya pertenecía a un negocio activo (índice único parcial `businesses_accent_color_active_idx` de `0002`; el default del form de alta era además `e11d48`, ya ocupado por La Florencia). Con una paleta documentada de 12 colores la unicidad no escala más allá de 12 negocios activos.

- **Paleta canónica en código**: `BUSINESS_ACCENT_PALETTE` (12 colores de `Docs/06 §2`, hex minúsculas sin `#`) + `AccentColorSchema` + `DEFAULT_ACCENT_COLOR` + `isPaletteAccentColor` en `packages/contracts/src/accent-colors.ts`. El spec 06 referencia esta constante como fuente.
- **Unicidad eliminada** (migración `0053`): dos negocios activos PUEDEN compartir color. Sin índice de reemplazo (ninguna query filtra/joinea por `accent_color`). El CHECK `accent_color_format` (minúsculas sin `#`) sigue vigente.
- **Colisiones visuales aceptadas por diseño**: el papelito sigue siendo identificador *referencial*, no clave. Mitigación: el picker del admin marca "en uso" (dot advisory, no bloquea) los colores de negocios activos — el panel del negocio NO lo muestra (RLS no le deja ver otros negocios y no es su decisión).
- **El color lo gestiona SOLO el admin** (confirmado por el usuario, 2026-07-02): `accentColor` se acepta únicamente en `POST /admin/businesses` (alta) y `PATCH /admin/businesses/:id`. `PATCH /business/profile` ya NO lo acepta (mismo enforcement server-side que las capacidades, §18). El panel del negocio lo muestra **solo lectura** (swatch + candado "Lo gestiona Tindivo") en Configuración → Datos.
- **`AccentColorSchema` normaliza** (`trim`, quita `#`, `toLowerCase`) antes de validar — cualquier cliente (curl/Capacitor) queda cubierto por el server.
- **Selector visual** (grid de 12 swatches + "Color personalizado" colapsable, auto-expandido si el valor no es de paleta — negocios legacy): en el alta del admin (`negocios/nuevo`). Hex libre sigue permitido.
- **Defaults**: el form de alta preselecciona el primer color de la paleta (Rosado `f472b6`); el default de la columna en DB sigue `f97316` (naranja = brand, con la reserva del spec: solo asignarlo si Tindivo no opera ese pueblo).

---

## 23. Regla de los 10 minutos post-Pedido Listo, co-existencia del temporizador y diferenciación de copy (2026-08-10)

- **Regla del temporizador en SQL (Fuente de Verdad)**: La reducción del tiempo estimado tras pulsar "Pedido listo" vive en el RPC `advance_order('ready')` en PostgreSQL usando `LEAST(estimated_ready_at, now() + queue_lead_minutes())`.
- **Configurabilidad**: `queue_lead_minutes` (default 10 min) es una constante configurable en `app_settings.timers` dentro de la base de datos.
- **Visibilidad en UI (`ready_early_used`)**: La marca `ready_early_used = true` registra si la acción se ejecutó antes de tiempo, pero **NO debe usarse como guarda para ocultar el temporizador** en la tarjeta de pedido.
- **Referencia histórica del legacy**: En el sistema legacy (`active-orders.tsx`), la tarjeta del listado mostraba simultáneamente la etiqueta "Comida lista" y el reloj de tiempo restante. La regresión en V2 (que ocultaba el contador al marcar listo) ha sido solucionada restituyendo la visibilidad conjunta en `negocios` y `motorizados`.
- **Formato del contador en Negocios**: El contador de la tarjeta de negocios (`CookingCountdown`) utiliza el formato `mm:ss` derivado de `formatReadyDelta(readySec)` para la cuenta positiva (e.g. `09:55 en cocina`), manteniendo la concordancia de tiempo con `motorizados`.
- **Diferenciación de copy ("Listo pero sin recoger")**: Cuando `ready_early_used = true` y `readySec < 0` (el reloj de comida lista expira), la responsabilidad no es de la cocina sino del reparto. Se distingue de la demora de cocina (`ready_early_used = false` $\rightarrow$ `¡Demorado!` / `Esperando mm:ss` en rojo):
  - **`negocios` (cajera)**: `Lista · esperando moto mm:ss` (información de monitoreo).
  - **`motorizados` (repartidor)**: `Te espera hace mm:ss` (llamada a la acción).
- **Escalada de color basada en `queue_lead_minutes`**:
  - Tiempo transcurrido $\le \text{queue\_lead\_minutes}$ (hasta 10 min): **ÁMBAR / warning** (`bg-amber-50 text-amber-800 border-amber-300`).
  - Tiempo transcurrido $> \text{queue\_lead\_minutes}$ (más de 10 min): **ROJO / danger** (`bg-danger-soft text-danger`).
  - El umbral de escalada se lee dinámicamente de `app_settings.timers.queueLeadMinutes` vía `useQueueLeadMinutes()`.

---

## 24. Rediseño Estructural de Cards: 3 Bandas en Motorizados y Ordenación por Urgencia en Negocios (2026-08-10)

- **Principio de Jerarquía Visual:** Ningún dato se elimina; se reorganizan por peso, tamaño y aislamiento para evitar la saturación informativa (11 elementos al mismo nivel).
- **Estructura en 3 Bandas (`motorizados` OrderCard):**
  - **Banda 1 (Orientación - peso medio):** Local, `#short_id`, Píldora de estado, Dirección de la ruta (`text-body` 14px font-medium), Cliente (`text-caption` 12px `text-ink-muted`).
  - **Banda 2 (Acción - peso máximo - M1):** Acción verbal explícita en infinitivo (`Ir al local`, `Recoger pedido`, `Entregar a [cliente]`, `Tomar pedido`) en `--text-lead` (17px) peso 600 **en su propia línea sola**, seguida en la Fila B por badges de estado (`Comida lista`) y temporizadores accionables (`Te espera hace mm:ss`).
  - **Banda 3 (Dinero - peso protegido - M2):** Fondo sutil propio aislado (`bg-ink/[0.03]`). Jerarquía interna: Cifra grande en mono 700 / "No cobrar" grande en sans 700 $\rightarrow$ Cualificador en caption (`Cobrar en efectivo` / `Cobrar por Yape/Plin` / `Prepagado en la app`) $\rightarrow$ Instrucción operacional en meta (`Muestra el QR` / `Paga con S/ X · devuelves S/ Y` / `Sin vuelto`).
- **Formato de Tiempo con Desbordamiento (M4):** Helper compartido (`mmss` y `formatReadyDelta`) conmuta automáticamente: $< 60$ min $\rightarrow$ `mm:ss` (`04:06`), $\ge 60$ min $\rightarrow$ `Xh Ym` (`2h 05m`).
- **Remoción de Barra Segmentada (M3):** La barra segmentada de 3 pasos se elimina ya que la Acción Verbal de Banda 2 indica el paso exacto dinámicamente sin duplicidad.
- **Ordenación por Urgencia en Negocios (N1):** La columna "En cocina" se ordena estrictamente por `getUrgencyTier`:
  - *P1 (Crítico):* `buffer_p3` (15m+ sin moto), cocina retrasada (`readySec < 0 & !readyEarly`), espera escalada $>10$m.
  - *P2 (Atención):* `waiting` (moto en puerta), `buffer_p2`, espera normal $\le 10$m.
  - *P3 (Normal):* `heading`, `buffer_p1`, `cooking` a tiempo ordenados de menor a mayor tiempo restante.
- **Cards Expandidas vs Compactas (N2):** Tarjetas críticas se renderizan expandidas (105px min, borde 2px semántico + CTA directo), mientras que las normales de cocina permanecen compactas (64px, 2 líneas limpias).
- **Democión de Jerarquía del Precio en Negocios (N3):** El total se desplaza a `--text-caption` (12px) `font-mono text-ink-muted` junto al `PayBadgeMini`, liberando la esquina superior derecha para el monitoreo operacional.

---

## 22. Pedido manual: la cajera teclea el TOTAL, la comida se deduce (2026-08-07)

**Solo el canal manual** (`create_business_manual_order`). El checkout del cliente no cambia: ahí el monto sale del carrito y el envío por banda se le sigue mostrando desglosado (§15).

El formulario de `apps/negocios/nuevo` rotulaba su campo "Total del pedido" pero lo mandaba como `p_order_amount`, que significa **comida**; el RPC le sumaba el envío encima. La cajera, que ya tiene el hábito de decirle al cliente el total con envío incluido, escribía 27 y el pedido salía a 29.

- **Entra el TOTAL, sale la comida** (migración `0129`): `p_order_amount` → `p_total_amount`, y `order_amount := round(total − delivery_fee, 2)`. El esquema NO cambia: `orders.order_amount` y `orders.delivery_fee` siguen separados, con la misma semántica, y el ledger/apelaciones/reportes no se enteran.
- **La resta vive en el RPC, nunca en el navegador.** El envío sale de una cadena de fallback (`delivery_bands ->> banda` → `businesses.delivery_fee` → `2.00`) que solo la función resuelve. Un cliente que restara mal —o que restara 0 porque no cargó las tarifas— cobraría el envío dos veces en silencio.
- **Un total que no cubre el envío se rechaza** con un mensaje que dice ambos números. Antes era imposible por construcción; ahora es la vía de error natural ("una gaseosa de S/2").
- **El selector de zona va AL FINAL y sin precios.** Ya no decide cuánto paga el cliente, así que mostrarle "S/ 2.00 / S/ 2.50" invitaría a sumarlos otra vez al monto. Sigue **sin preselección**: `canSubmit` la exige y el CTA nombra lo que falta.
- **Consecuencia económica asumida**: con el total fijo, elegir "Lejos" ya no le cobra S/0.50 más al cliente — se los resta a la comida, o sea que **el negocio absorbe** la diferencia (le sigue debiendo el envío íntegro a Tindivo vía `business_charges`, §4). Si se decide lo contrario, la salida es igualar `far` a `near` en `app_settings` (precedente de la `0110` con `commissions`), no revertir la `0129`.
- **Renombre deliberado del campo del endpoint** (`orderAmount` → `totalAmount`), sin alias de compatibilidad: un cliente viejo se lleva un 422 en vez de colar un total por comida. `apps/api` y `apps/negocios` se despliegan juntos.
- **Arregla de rebote dos defectos vivos** que nacían de la misma asimetría: el pago **mixto** era imposible de enviar (la pantalla exigía `billetera + efectivo = comida`, el servidor `= comida + envío`) y el **vuelto** se mostraba inflado por el importe del envío.
- **Supersede** `Docs/spec/spec_ui_cajera.md` en su punto "«Monto del pedido» pasa a ser solo comida" (líneas 62 y 374): sigue siendo `orders.order_amount`, pero ya no es lo que teclea la cajera.

---

## 25. El motorizado se entera: qué momentos disparan push (2026-08-10)

Portado del v1 (`Code/tindivo-delivery`), que notificaba **24 momentos**. El v2
sólo reenviaba tres tipos de evento al Edge Function (`OrderStatusChanged`,
`OrderExpired`, `CashDelivered`) de los diecinueve que emiten los RPC vivos: los
otros dieciséis se caían en el filtro de `dispatch_event`, en silencio. Migración
`0134`.

**Alcance: sólo motorizados.** `apps/motorizados` es hoy la única app que llama a
`pushManager.subscribe`; `negocios`, `customer` y `admin` tienen `sw.js` pero
nunca crean suscripción, así que sus avisos —los que ya se despachaban— no
tienen a quién llegar. Eso se arregla aparte.

**Los momentos que ahora avisan al motorizado:**

| Momento | Evento (payload) | A quién |
|---|---|---|
| Te piden tu pedido | `TransferRequested` | dueño (`fromDriverId`) |
| Aceptaron tu solicitud | `TransferResolved` `accepted` | solicitante |
| Rechazaron tu solicitud | `TransferResolved` `rejected` | solicitante |
| Venció y cedió el pedido | `TransferResolved` `expired` + `transferred` | **los dos**, mensajes distintos |
| Venció sin ceder (mochila llena) | `TransferResolved` `expired` sin `transferred` | solicitante, con el motivo |
| Pedido liberado, vuelve a la bolsa | `OrderReleased` | todos **menos** quien lo soltó |
| Nadie lo ha tomado, se enfría | `OrderOverdue` (nuevo) | todos |
| Pedido cancelado | `OrderStatusChanged` `cancel` | el asignado (además de cliente y negocio) |
| En cocina y va a tardar | `OrderCreated` / `OrderStatusChanged` `accept` | todos, sólo si `prep_time_minutes > 10` |
| Efectivo confirmado / disputado / resuelto | `CashConfirmed` / `CashDisputed` / `CashResolved` | el motorizado |

**Decisiones que conviene no re-litigar:**

- **La lista blanca sigue siendo explícita**, no un `not in` de auditoría. Lo que
  NO se notifica (`BusinessBlocked`, `CustomerNoShow`, `OrderValidated`,
  `OrderProofVerified`, `OrderPrepExtended`, `order/appeal.created`) es una
  decisión de producto y se lee mejor enumerada que deducida.
- **El doble aviso del traspaso por silencio lleva TAGS DISTINTOS**
  (`…-expired-from-…` / `…-expired-to-…`). Con el mismo tag, FCM/APNs los
  colapsan y quien pierde el pedido ve el mensaje de quien lo gana. El v1 ya
  había chocado con esto.
- **Notificar no es asignar** (§ heredada del v1): no se filtra por
  `driver_availability.is_available`. El cron `close-driver-shifts` apaga la
  disponibilidad de todos al cerrar; filtrar aquí deja a los motorizados en un
  limbo del que sólo salen entrando a la PWA por azar.
- **El aviso anticipado tiene umbral de 10 min** (`HEADS_UP_MIN_PREP_MINUTES`).
  Por debajo, el aviso de `ready` llega antes de que dé tiempo a moverse y son
  dos pushes por el mismo pedido.
- **`OrderOverdue` se emite UNA vez**, sellando `orders.urgent_since` en la misma
  transacción. `urgent_since` y `assignment_rules.urgentAfterMinutes` ya existían
  desde hace decenas de migraciones, escritos por nadie hasta ahora. El sello lo
  limpia el propio cron cuando el pedido consigue dueño.
- **`respond_order_transfer` mete `fromDriverId`/`toDriverId` en el rechazo.** Las
  otras dos resoluciones salen de `apply_order_transfer`, que sí los ponía; la
  rama de rechazo escribía sólo `requestId` y `resolution`, así que el aviso no
  tenía destinatario. El Edge Function además los recupera de
  `order_transfer_requests` si faltan, para que un despliegue en el orden
  equivocado (función antes que migración) no vuelva a dejar producción muda.

**Deuda que esto NO cubre**, por orden: suscripción push en `negocios` y
`customer`; outbox real (hoy `dispatch_event` es `net.http_post` a fondo perdido:
si falla, el aviso se pierde y `published_at` no lo escribe nadie, así que el
cron `prune-domain-events` tampoco borra nunca); avisos al cliente del prepago
rechazado (`validate_fail` / `validate_fail_retry` llegan al Edge Function y no
tienen rama).

---

## 26. La tarjeta del motorizado: qué dice cada sitio y por qué (2026-08-11)

**Supersede §24 en su mitad de `motorizados`.** La parte de `negocios` de §24
(ordenación por urgencia, cards expandidas vs compactas, democión del precio)
sigue vigente y no se ha tocado.

Esta entrada se reescribió entera tras ocho iteraciones sobre la tarjeta. Lo que
se conserva son las **reglas**, no la secuencia: los intentos descartados están
anotados solo donde entender por qué se descartaron evita repetirlos.

### El problema medido

La tarjeta de §24 medía ~250px. En un móvil de 390px de ancho el lienzo útil son
~440px —el resto se lo llevan la barra superior, el saludo, las pestañas
pegajosas y el `pb-28` de la nav—, así que entraban **dos**. Hoy ronda los
**~120-170px** según variante y longitud de la referencia.

**La altura no se recortó apretando la letra.** Eso habría empeorado justo lo que
ya se leía mal: `--color-ink-subtle` (#a8a29e) da **2,5:1** sobre blanco, por
debajo del mínimo AA, y ahí vivían el contador y el vuelto. Se recortó borrando
filas. Y hubo un punto en que se pasó de frenada: una versión de ~107px entraba
cuatro veces y se leía amontonada; se cambió la cuarta tarjeta por respiración.
**El techo útil no es cuántas caben, es cuántas se leen de un vistazo desde una
moto.**

### Las cuatro filas

1. **Cejilla** — `LOCAL · #código` en versalita gris, y a la derecha **la
   insignia de estado**.
2. **Identidad** — el nombre del cliente en `--text-lead`, y a su altura **el
   reloj**.
3. **Referencia** — pegada al nombre, en `--text-caption` gris y sin icono.
4. **Cobro** — en dos alturas: la cifra en `--text-title` mono, y debajo método,
   desglose y vuelto.

### Cada sitio dice UNA cosa

Esta es la regla que ordena todo lo demás, y la que más veces se rompió al
intentar atajos:

| Canal | Dice | Nunca dice |
|---|---|---|
| Franja izquierda | de qué local es | otra cosa |
| Insignia (cejilla) | **el estado del pedido** | urgencia |
| Reloj (junto al nombre) | **el tiempo** | el estado |
| Borde de la tarjeta | **la emergencia** | grados intermedios |

**LA INSIGNIA ES EL ESTADO DEL PEDIDO, TAL CUAL.** Hubo una versión donde llevaba
estados *derivados del reloj* ("Te espera", "Demorado") mientras una fila aparte
llevaba el verbo de la acción ("Recoger pedido"). Eran **dos estados
conviviendo** y diciendo lo mismo por dos vías —"En el local" y "Recoger pedido"
son la misma frase— y, entretanto, el estado real del pedido no se veía en
ninguna parte. El verbo se eliminó: era el estado traducido a imperativo.

**DÓNDE VA "LISTA", QUE ES EL CASO QUE NO ES OBVIO.** `advance_order('ready')`
(`0128:156-159`) hace dos cosas distintas:

- **Sin motorizado** ("En espera"): el status pasa a `waiting_driver`, así que el
  estado **ya dice** que está lista y la insignia la enseña.
- **Con motorizado** ("Míos"): el status **no cambia** —sigue siendo el viaje del
  motorizado— y lo único que marca la comida es `ready_early_used`. Ahí "Lista"
  no cabe en la insignia sin pisar el estado.

Por eso en Míos la marca viaja **con el reloj**: es el reloj de la comida, así
que su visto bueno pertenece ahí. Un pedido puede ser tuyo, ir de camino al local
y estar la comida lista: insignia "Voy al local", reloj "✓ 04:52". **Los dos
hechos, sin taparse** — que es lo que exige §23.

Y soltar un pedido encajó solo, sin código: `release` (`0121:205-210`) lo
devuelve a `preparing` o a `waiting_driver` según la comida esté o no.

### El reloj no se apaga nunca, y cambia de sentido

| Momento | Cuenta | Origen |
|---|---|---|
| En cocina | lo que falta | `estimated_ready_at` |
| Pasada la ETA | lo que se pasó | `estimated_ready_at` |
| En reparto | **lo que lleva rodando** | `picked_up_at` |
| Equipo, sin recoger | la edad del pedido | `created_at` |
| Historial | la hora de entrega | `delivered_at` |

Recoger no acaba el reloj: **cambia lo que cuenta**. Con dos o tres pedidos en la
mochila, cuál lleva más tiempo rodando es exactamente lo que decide a quién
entregar primero. `picked_up_at` hubo que añadirlo al select del board; existía
desde `0002` y nunca se pedía.

**Siempre en mm:ss.** Era adaptativo (`~12 min` por encima de dos minutos) y §23
afirmaba una "concordancia con motorizados" que no existía: la cajera veía
`09:55` y él `~10 min` del mismo pedido, justo cuando lo llama.

### Dos colores, dos umbrales, y ninguno intermedio

- **El reloj es negro o rojo.** Rojo en cuanto se pasa de cero. Hubo un escalón
  ámbar intermedio y se quitó por dos razones: **el número ya lleva el grado**
  (`00:45` y `14:20` lo dicen solos, así que el color solo tiene que decir *si*),
  y **el ámbar codificaba `queueLeadMinutes`, un umbral que el motorizado no
  conoce**. Un color que no se puede interpretar acaba ignorándose.
- **El borde es el segundo escalón**, con umbral propio: espera a que la demora
  cruce `queueLeadMinutes`. Así el margen sigue trabajando sin obligar a nadie a
  entenderlo — una tarjeta enmarcada en rojo se lee sin saber cuántos minutos
  son. Encendido a la vez que el reloj, un pedido con un segundo de retraso
  gritaría igual que uno de veinte y se perdería el "atiende ESTE".
- **El reloj de reparto enrojece a los `deliveryLateMinutes`** (`0139`, 20 por
  defecto). Nació sin alarma a propósito, porque no había umbral decidido y
  ponerlo a ojo habría sido fabricar una regla de negocio. En Equipo **no**
  enrojece: el pedido es de otro y lo recogido no es traspasable, así que sería
  alarmar sin salida.

**Los colores del ESTADO son categóricos, no semánticos**: nombran la fase (gris
en cocina, verde lista, azul de camino, naranja en el local, violeta en reparto,
gris entregado) y **excluyen ámbar y rojo a propósito**, porque esos dos son el
idioma de la urgencia. Es un **tipo distinto** en el código (`StateTone` vs
`Tone`) para que nadie pueda darle a un estado un tono de alarma sin que
TypeScript se queje, y hay un test que cubre lo que el tipo no puede.

### Lo que se decidió sobre el contenido

- **EL NOMBRE ES LA IDENTIDAD, NO UN DATO DE ENTREGA.** Es cómo el motorizado
  reconoce el pedido en la lista y cómo lo nombra cuando la cajera lo llama. Por
  eso desplazó al nombre del local —idéntico en el 100% de las tarjetas del
  piloto y ya codificado por la franja—, que baja a cejilla en versalita gris.
  **Y por eso pasó a ser obligatorio** en el formulario de la cajera y en el
  endpoint: era opcional (`0032`) en el único canal que crea pedidos. Se exige en
  el borde y no en la columna, porque hay filas viejas con NULL. El fallback al
  `#short_id` se queda para esas.
- **La referencia va pegada al nombre y sin icono.** Son la misma cosa —a quién y
  dónde—, y el pin robaba ancho justo a la línea que más se desborda.
- **El cobro, en dos alturas.** El importe es lo que se lee en la puerta del
  cliente, con prisa y con casco. `--text-title` y no `--text-display`: en mono
  los dígitos ya corren más de lo que dice su talla, así que a 22px pesa como el
  nombre a 17px **sin destronarlo**.
- **Sin verbos en el cobro**: la misma línea se pinta en el historial. `S/ 45.00 /
  efectivo` es cierto en cualquier tiempo verbal.
- **El prepago pone una PALABRA donde va la cifra** ("Prepagado" / "no cobrar").
  Enseñar `S/ 45.00` al lado de "Prepagado" es una invitación a cobrarlo por
  error; sin número no hay error posible. Un test fija que ningún otro método
  haga eso.
- **En el mixto la cifra grande es la parte en EFECTIVO**, no el total: el
  motorizado no cuenta 45, cuenta 30 y comprueba que entraron 15 por Yape.
- **El vuelto aparece también en "En espera"**: si no llevas sencillo, un pedido
  que paga con billete grande es un problema que prefieres ver antes de
  aceptarlo.

### La bandeja se ordena por el reloj que enseña

Ordenaba por `created_at` —"del más antiguo al más nuevo"— y **se leía como un
desorden**, porque `created_at` no coincide con el reloj: cada pedido lleva su
`prep_time_minutes`, así que uno pedido antes puede estar listo después. La lista
mostraba contadores en secuencias tipo `03:00 · 07:00 · 02:00` sin regla
deducible.

Con `estimated_ready_at` ascendente los contadores bajan monótonos y es **un solo
criterio**: lo pasado de cero queda arriba por aritmética. **Y deja de moverse**:
el comparador viejo dependía de la hora actual, así que una tarjeta saltaba al
tope al cruzar el cero, reordenando bajo el pulgar. Vive en `lib/orders/sort`.

### `urgent_since` no pinta el tablero

Lo sella el cron `OrderOverdue` (`0134`) tras `assignment_rules.urgentAfterMinutes`
(5 por defecto) — **otro reloj**, el de la asignación, que salta con la comida
todavía en el horno. Se retiró de `orderUrgency` porque:

1. A los 5 minutos sin dueño, con un motorizado y ~10 pedidos por noche, es
   **operación normal**: está repartiendo.
2. **Ya hay un aviso, y es fuerte**: push a todos con `requireInteraction` y
   vibración. Añadirle banner, reordenación y bloqueo eran tres canales más para
   el mismo hecho. Un banner que grita cuando no pasa nada deja de creerse.

Por lo mismo, ni el banner ni el bloqueo dicen ya **"vencido"**: esa palabra
promete un plazo agotado y se leía junto a un contador corriendo tan tranquilo.

### El view-model del board, con tests

`apps/motorizados` no tenía **un solo test** mientras `apps/negocios` ya había
elegido este patrón en `lib/orders/view-model.ts`. Las decisiones de presentación
salen del JSX a `lib/orders/card-view-model.ts`, puro y con 56 tests entre él y
`sort`. Sin eso, 4 variantes × 4 métodos de cobro × 4 estados de urgencia solo se
verificaban abriendo la app y mirando — que es exactamente como se colaron los
defectos de abajo.

### Defectos que esto cerró, cada uno con su test

| Defecto | Arreglo |
|---|---|
| El **historial entero en rojo**: el borde se calculaba sin mirar la variante y una ETA de hace horas dispara la alarma | `delivered` nunca se colorea |
| **Dos definiciones de "vencido"**: la bandeja ordenaba y gritaba con un criterio y la tarjeta con otro más estricto, así que el banner señalaba una tarjeta neutra | La tarjeta enrojece exactamente cuando `orderUrgency` marca; hay test |
| Un `preparing` tomable mostraba **"Ver pedido"** en el sitio de peso máximo | Ya no hay fila de verbo |
| Equipo pintaba **"Entregar a {compañero}"**: imperativo a quien no puede ejecutarlo, con el nombre del dueño donde se espera el del cliente | Equipo no tiene verbo; el estado va a la insignia |
| **El vuelto de un pago mixto no se mostraba nunca**: `cash_amount`/`yape_amount` existen desde `0002` y `negocios` ya los leía, pero el board no los pedía | Al select; el mixto desglosa |
| Un `payment_intent` **nulo o desconocido** afirmaba "Cobrar en efectivo" | `método por confirmar` |
| El historial mostraba el cobro **en imperativo** y un `20:45` desnudo sin rótulo | Sin verbos; insignia "Entregado" + hora |
| La tarjeta entera era un `<button>` con `<p>`/`<div>` dentro: HTML inválido y ~40 palabras como una sola etiqueta | `div` + botón estirado con `aria-label` corto |
| Rejilla desalineada 4px, glow del acento recortado por `overflow-hidden`, tallas `text-[10.5px]`…`text-[20px]` esquivando la escala | Rejilla única, sin glow, solo tokens |
| **`cn()` borraba en silencio las tallas del tema** (ver §27) | `extendTailwindMerge` en `packages/ui` |

### Sin botón de acción en la tarjeta, y se evaluó a fondo

Un botón "Tomar" sería un **segundo objetivo táctil** a 44px del primero con
consecuencia distinta: tocar abre el detalle, el botón te compromete con una
entrega. Con guantes, un fallo deja de ser "una pantalla de la que sales con
atrás". Y `release` no es gratis: avisa a todo el equipo (§25). **La tarjeta es
el índice; el detalle, donde se decide y se actúa.**

`pickup` y `deliver` **no podrían** tenerlo aunque quisiéramos: `pickup` pide
`slots` (abre hoja) y es donde se devengan los cargos (`0128`); `deliver`
confirma el cobro.

La forma rápida de tomar que sí se va a construir es un **swipe
izquierda→derecha**: no compite con el toque —ejes distintos—, no se dispara sin
querer si va con umbral, y cuesta 0px. Va como cambio aparte para poder
revertirlo solo.

### Pendiente

- **La pantalla de detalle** (`/pedido/[id]`) todavía habla otro idioma visual:
  su `status-hero`, `money-card` y `preview-section` no siguen estas reglas.
- **`negocios`** conserva la mitad de §24 que le toca.

---

## 27. `cn()` borraba en silencio las tallas de texto del tema (2026-08-11)

`tailwind-merge` resuelve conflictos por grupos de clases y solo conoce las
tallas de fábrica (`text-sm`, `text-lg`…). Una `text-caption` le resulta
desconocida y la clasifica como **color** de texto —tiene la misma forma,
`text-<algo>`—, así que cualquier `text-ink-muted` en la misma llamada la pisa.
El elemento se queda **sin talla y hereda 16px, sin avisar**.

Comprobado contra el propio merger:

```
cn('mt-1 text-caption font-medium', 'text-ink-muted')
  -> mt-1 font-medium text-ink-muted        (text-caption BORRADA)
cn('text-sm font-medium', 'text-ink-muted')
  -> text-sm font-medium text-ink-muted     (sobrevive)
```

Lo perverso es que **el mismo par funciona escrito a pelo en un `className`**
—ahí `twMerge` no corre— y falla dentro de `cn()`. Se descubrió porque el detalle
del cobro de la tarjeta del motorizado salía más grande que la referencia
teniendo los dos `text-caption`; estaban afectados también la cifra y el reloj,
que se veían casi del mismo tamaño.

Las nueve tallas de `theme.css` se declaran ahora como grupo `font-size` en
`packages/ui/src/lib/cn.ts`. Los conflictos de verdad siguen resolviéndose
(`cn('text-caption', 'text-title')` sigue dando `text-title`).

**Al añadir una talla nueva a `@theme`, hay que añadirla también ahí.** Es el
único acoplamiento que deja esta solución, y no avisa si se olvida.

