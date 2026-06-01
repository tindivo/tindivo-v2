# 02 · Requerimientos no funcionales

> Atributos de calidad que el sistema debe cumplir además de las features funcionales. Performance, seguridad, observabilidad, accesibilidad, PWA, compliance, mantenibilidad.
>
> Cada RNF tiene **objetivo medible** y **estrategia de cumplimiento**. Numerados `RNF-AREA-N`.

---

## Tabla de contenidos

- [1. Performance](#1-performance)
- [2. Disponibilidad y resiliencia](#2-disponibilidad-y-resiliencia)
- [3. Seguridad](#3-seguridad)
- [4. Privacidad y compliance](#4-privacidad-y-compliance)
- [5. Observabilidad](#5-observabilidad)
- [6. Accesibilidad](#6-accesibilidad)
- [7. PWA y soporte offline](#7-pwa-y-soporte-offline)
- [8. Localización](#8-localización)
- [9. Mantenibilidad y calidad de código](#9-mantenibilidad-y-calidad-de-código)
- [10. Escalabilidad](#10-escalabilidad)
- [11. Compatibilidad](#11-compatibilidad)
- [12. UX transversal](#12-ux-transversal)

---

## 1. Performance

### RNF-PERF-01 · Core Web Vitals de `tindivo.com`

**Objetivo**:

| Métrica | Bueno (objetivo) | Aceptable | Crítico (alertar) |
|---|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5s | 2.5-4s | > 4s |
| INP (Interaction to Next Paint) | < 200ms | 200-500ms | > 500ms |
| CLS (Cumulative Layout Shift) | < 0.1 | 0.1-0.25 | > 0.25 |
| TTFB (Time to First Byte) | < 200ms | 200-600ms | > 600ms |
| FCP (First Contentful Paint) | < 1.8s | 1.8-3s | > 3s |

**Estrategia**:
- SSR con streaming (Next.js 16 App Router + React Server Components con `Suspense`).
- `next/image` con AVIF/WebP, dimensiones explícitas, `priority` en LCP image.
- Critical CSS inline; resto async.
- Fonts: `next/font` con `font-display: swap`, preload de Bricolage Grotesque y Geist.
- Code splitting por ruta (App Router lo hace por defecto).
- Bundle del cliente con `analyze` en CI; budget máximo 200KB JS por ruta.
- Compresión Brotli (Vercel lo hace).
- CDN de assets (Vercel Edge Network).
- TanStack Query con `staleTime: 15s` para reducir refetches.

### RNF-PERF-02 · Tiempos de respuesta de la API

**Objetivo**: P95 < 300ms, P99 < 800ms en endpoints autenticados.

**Estrategia**:
- Índices apropiados en queries críticas (ver `04-base-de-datos.md`).
- Paginación cursor-based (no `OFFSET`).
- Sparse fieldsets (`?fields=id,name`).
- N+1 elimination con join + select explícito en Supabase queries.
- Permisos cacheados en JWT claims (`app_metadata.user_roles`) — no hay query por request para auth.
- Idempotency cache en `idempotency_keys` (24h TTL).

### RNF-PERF-03 · Latencia de notificaciones push críticas

**Objetivo**: P99 < 5 segundos desde el trigger del evento hasta que el SO del dispositivo muestra la notificación.

**Eventos críticos** (con `requireInteraction: true`, `vibrate: [200,100,200,100,200]`):
- `OrderReadyForDrivers` (pedido listo para asignación)
- `OrderAssigned` (driver recibe asignación)
- `OrderOverdue` (pedido demorado >5min)
- `OrderMarkedUrgent` (pedido entró a cola urgente)
- `OrderTransferRequested` (recibo solicitud de transferencia)

**Estrategia**:
- **Inngest** para scheduling event-driven en lugar de cron polling. `step.sleepUntil()` con precisión ~2-5s.
- Web Push VAPID estándar (sin SDK externo).
- Edge Function `send-push` ejecutándose en POP cercano (Vercel/Supabase Edge).
- Tag dedup por `${event_type}-${shortId}` (evita colapsar pushes distintos).
- Failsafe cron cada 5 min como red de seguridad por si Inngest falla.

### RNF-PERF-04 · Reconexión Realtime

**Objetivo**: cuando un usuario pierde conexión y vuelve, las suscripciones Supabase Realtime se restablecen en < 3s y trae los cambios perdidos.

**Estrategia**:
- Supabase Realtime tiene reconexión automática con exponential backoff.
- Tras reconectar, el cliente hace un refetch explícito de la query (TanStack Query `refetchOnReconnect: true`).
- Banner global "⚠️ Conexión perdida — reintentando" si la conexión cae > 5s, y "Conectado ✓" cuando vuelve.

### RNF-PERF-05 · Performance budget en CI

**Estrategia**: Lighthouse CI en cada PR de `apps/customer`. Bloquea merge si:
- LCP > 2.5s en preview deploy.
- Bundle JS > 200KB por ruta.
- Imágenes sin dimensiones explícitas (causa CLS).

---

## 2. Disponibilidad y resiliencia

### RNF-AVAIL-01 · Uptime objetivo del MVP

- 5 apps + API + Supabase: **99.5%** mensual (~ 3.6h downtime/mes aceptado).
- Métrica más relevante: **% de pedidos completados con éxito** (creación → delivered o cancelled limpio). Objetivo: ≥ 98%.

### RNF-AVAIL-02 · Idempotencia en endpoints mutativos

**Estrategia**: todos los endpoints `POST` que crean recursos aceptan header `Idempotency-Key: <UUID v4>`. Implementación: tabla `idempotency_keys` (Stripe-style):
- Cliente envía la key. Servidor cachea la respuesta por 24h.
- Misma key + mismo body → respuesta cacheada (sin re-ejecutar).
- Misma key + body distinto → 409 `IDEMPOTENCY_KEY_MISMATCH`.
- Sin header → ejecuta tal cual (back-compat).
- Solo se cachean respuestas < 500 (las 5xx liberan placeholder para retry seguro).

### RNF-AVAIL-03 · Retries con backoff

**Estrategia**: en endpoints internos invocados via `pg_net` (Inngest, send-push, assign-one):
- Reintentos con exponential backoff + jitter: 1s, 2s, 4s, 8s.
- Después de 4 intentos, evento a Dead Letter Queue (tabla `push_delivery_log` con `status='failed'`).

### RNF-AVAIL-04 · Graceful degradation

- Si Realtime cae → polling cada 10s (TanStack Query con `refetchInterval: 10000` cuando se detecta `realtime: down`).
- Si Inngest cae → cron failsafe cada 5 min toma el relevo.
- Si Supabase Storage cae → la creación de pedidos sigue funcionando sin imágenes (los placeholders se muestran).
- Si pasarela Yape estuviera offline (post-MVP) → opción "Pagar al recibir" siempre disponible.

### RNF-AVAIL-05 · Backups y recovery

- Supabase hace backups diarios automáticos con retención de 7 días.
- En PRO (paid tier): PITR (point-in-time recovery) hasta 7 días.
- **RPO** (Recovery Point Objective): 24h (peor caso, perdemos un día de datos).
- **RTO** (Recovery Time Objective): 1h.
- Backup manual semanal vía `pg_dump` a Google Drive del fundador (durante MVP).

### RNF-AVAIL-06 · Maintenance window

- Despliegues en madrugada (3-6am Lima) cuando posible.
- Maintenance mode con página explicativa si la app está en mantenimiento programado >5min.

---

## 3. Seguridad

### RNF-SEC-01 · Autenticación

- Supabase Auth + cookies httpOnly + Secure + SameSite=Lax (cross-subdomain). 
- JWT corto (1h) + refresh token de larga vida (7 días).
- `signOutLocal()` con scope local — cerrar sesión NO cierra otras sesiones del mismo usuario.
- 5 intentos fallidos consecutivos desde el mismo dispositivo → bloqueo del formulario por 60s.

### RNF-SEC-02 · Autorización

- **Row Level Security** activada en TODAS las tablas (incluyendo `push_delivery_log`, que en v1 estaba sin RLS).
- Helper functions SQL: `current_user_role()`, `current_business_id()`, `current_driver_id()`.
- Endpoints validan rol con `requireAuth(role)` ANTES de la query.
- RLS es la red de seguridad — si el endpoint tiene bug, la BD bloquea igual.

### RNF-SEC-03 · OWASP Top 10 mitigado

| Riesgo | Mitigación |
|---|---|
| Injection (SQL) | `@supabase/supabase-js` usa prepared statements |
| Broken auth | Supabase Auth con tokens firmados + RLS |
| Sensitive data exposure | TLS 1.3, secrets en Supabase Vault, no en código |
| XML External Entities | No usamos XML |
| Broken access control | RLS + endpoint validation dual |
| Security misconfiguration | Biome + reviews. Variables de env separadas dev/prod |
| XSS | React escapa por default. CSP headers en Next.js config |
| Insecure deserialization | Zod schemas validan TODO input |
| Vulnerable dependencies | Renovate automático, `pnpm audit` en CI |
| Logging insuficiente | Logs estructurados con `request_id`, retenidos 30 días |

### RNF-SEC-04 · CORS

- `apps/api` valida origen contra whitelist: `tindivo.com`, `www.tindivo.com`, `admin.tindivo.com`, `negocios.tindivo.com`, `motorizados.tindivo.com`, y `localhost:3000-3004` en dev.
- Headers permitidos: `Content-Type`, `Authorization`, `X-Request-Id`, `Idempotency-Key`.
- Métodos permitidos: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
- `Access-Control-Allow-Credentials: true` para cookies.

### RNF-SEC-05 · Rate limiting

- Endpoints públicos (`/public/*`): 60 req/min por IP.
- Endpoints autenticados: 600 req/min por user_id.
- Endpoint de login: 5 req/min por IP+email.
- Endpoint de creación de pedidos (`POST /restaurant/orders`, `POST /public/customer-orders`): 30 req/min por user.
- Implementación: middleware Next.js con Upstash Ratelimit (free tier 10k/día).

### RNF-SEC-06 · Secrets management

- Variables sensibles (Service Role Key, VAPID private, Inngest signing key) viven en Supabase Vault o Vercel env vars.
- NUNCA en código fuente. `.env.local` en `.gitignore`.
- Rotación cada 90 días (manual en MVP).

### RNF-SEC-07 · Audit logs

- Tabla `domain_events` ya funciona como log inmutable de eventos de dominio (4000+ filas en v1, política de retención en v2: 90 días).
- Tabla `admin_actions_log` adicional para registrar acciones del admin (cancelaciones, desbloqueos, cambios de config) con `actor_id`, `action`, `target_id`, `reason`, `at`.

### RNF-SEC-08 · Endpoints internos

- Endpoints bajo `/internal/*` requieren header `Authorization: Bearer <SERVICE_ROLE_KEY>`.
- Solo invocables desde Postgres `pg_net.http_post` o Inngest webhooks firmados.
- Si la key está expuesta (Service Role bypassa RLS), la operación fue maliciosa o un bug — auditar.

---

## 4. Privacidad y compliance

### RNF-PRIV-01 · PII del cliente

**Datos personales recolectados**:
- Nombre completo
- Email
- Teléfono (+51 9XXXXXXXX)
- Dirección de entrega
- Coordenadas (lat, lng) — opcional

**Reglas**:
- El teléfono del cliente **NUNCA se expone públicamente**. El tracking público (`/pedidos/<shortId>`) muestra solo el nombre y estado.
- Cuando un driver recibe un pedido, ve teléfono y dirección del cliente. Cuando lo entrega, los datos quedan en historial de su app pero NO se comparten con otros drivers.
- El negocio ve teléfono y dirección de SUS pedidos. NO ve datos de pedidos de otros negocios.
- El admin ve todo.
- Contrato visible para el cliente: *"Nunca compartimos tu número. Solo lo usa el motorizado del pedido en curso."*

### RNF-PRIV-02 · Derecho de acceso y eliminación

- El cliente puede ver sus datos en `tindivo.com/cuenta`.
- Puede solicitar eliminación de cuenta vía WhatsApp soporte. El admin ejecuta soft delete: `users.is_active = false`, datos persisten para auditoría pero el cliente no puede loguearse ni aparecer en búsquedas.
- Hard delete (eliminación completa) solo si hay orden judicial. Conservamos `orders` de los últimos 5 años por requerimiento contable.

### RNF-PRIV-03 · Cookies y consentimiento

- Cookies estrictamente necesarias (auth) NO requieren consentimiento.
- En MVP NO se usan cookies de analytics/tracking de terceros, por lo que no se requiere banner GDPR/CCPA.
- Si en el futuro se agrega Google Analytics o similar, agregar banner de consentimiento.

### RNF-PRIV-04 · Almacenamiento

- Datos en Supabase región `us-east-1` (AWS) — fuera de Perú pero dentro de jurisdicción amigable.
- Comprobantes de Yape (post-MVP) se guardarían en `payment-proofs` bucket privado con signed URLs de 24h.
- Datos personales NO se respaldan en dispositivos personales del equipo.

### RNF-PRIV-05 · Compliance peruano

- **Ley de Protección de Datos Personales (Ley 29733)**: cumplimos al pedir consentimiento explícito al registro y permitir eliminación.
- **SUNAT** (impuestos): Tindivo emite boletas/facturas por sus servicios a negocios. NO emite por pedidos de clientes (eso lo hace el negocio).
- **MTC** (transporte de paquetes): no aplica al MVP porque no hay encomiendas.

---

## 5. Observabilidad

### RNF-OBS-01 · Logs estructurados

- Logs en formato JSON con campos: `level`, `request_id`, `user_id` (si auth), `service`, `path`, `method`, `status`, `duration_ms`, `error_message`.
- Centralizados en **Vercel Logs** (free tier incluye 1 día de retención) + export a **Axiom** (free tier 500GB/mes) para retención más larga.
- Logs sensibles (datos del pedido) se redactan en producción — solo se loguea `orderId` y `shortId`, NO `clientPhone` ni `deliveryAddress`.

### RNF-OBS-02 · Métricas (Four Golden Signals)

- **Latency**: p50, p95, p99 por endpoint. Recopilado vía middleware Next.js que mide `Date.now()` start/end.
- **Traffic**: RPS por endpoint.
- **Errors**: rate de 4xx y 5xx por endpoint.
- **Saturation**: uso de Postgres connection pool (Supabase dashboard).

Dashboard básico en Supabase + Vercel Analytics. Post-MVP considerar Grafana Cloud free tier o Better Stack.

### RNF-OBS-03 · Distributed tracing (best effort)

- Cada request entrante recibe un `X-Request-Id` (UUID v4) que se propaga a queries Supabase, llamadas a Inngest, llamadas a Edge Functions.
- El `request_id` aparece en todos los logs relacionados.
- En MVP no usamos OpenTelemetry completo (overhead innecesario).

### RNF-OBS-04 · Real User Monitoring (RUM)

- Vercel Analytics (free tier): Core Web Vitals reales del cliente final.
- Tracking de eventos JavaScript: `Sentry` free tier (5k errores/mes) en `tindivo.com` y `motorizados.tindivo.com` (las apps de cliente y driver son donde más impacto tiene un error visible).

### RNF-OBS-05 · Synthetic monitoring

- Pingdom o UptimeRobot free tier — chequeo cada 5 min de:
  - `tindivo.com` → 200 OK
  - `api.tindivo.com/health` → `{status: 'ok'}`
- Alerta al admin (WhatsApp/email) si 3 pings consecutivos fallan.

### RNF-OBS-06 · Error tracking

- Sentry SDK en las 5 apps. Captura errors no manejados, errores de fetch, errores de React.
- Errores agrupados por `fingerprint`. Cada release nuevo "limpia" el grupo viejo.
- Alertas al admin si aparece un error nuevo con > 10 ocurrencias en 1h.

### RNF-OBS-07 · Push delivery log

- Tabla `push_delivery_log` registra cada intento de envío de Web Push con `endpoint`, `status` (ok/error), `error_code`, `at`.
- Append-only, retención 30 días, prune diario.
- **En v2 esta tabla tiene RLS activado** (en v1 estaba expuesta).
- Permite diagnosticar problemas de entrega (suscripciones inválidas, iOS específico, FCM down).

---

## 6. Accesibilidad

### RNF-A11Y-01 · WCAG 2.1 AA

**Objetivo**: cumplir con WCAG 2.1 nivel AA en `tindivo.com` (público, alto riesgo legal). En las apps de staff (admin, negocios, motorizados) cumplir con nivel A (mínimo).

**Estrategia**:
- Contraste mínimo 4.5:1 para texto normal, 3:1 para texto grande.
- Navegación completa por teclado (Tab, Enter, Escape).
- Foco visible en todos los elementos interactivos.
- `<button>` reales (no `<div onClick>`).
- ARIA labels en iconos sin texto (e.g., `aria-label="Cerrar"` en X de modal).
- Anuncios para screen readers en cambios dinámicos (`aria-live="polite"` en counters, `aria-live="assertive"` en errores).
- Imágenes con `alt` descriptivo o `alt=""` si decorativas.
- Form fields con `<label>` asociado.

### RNF-A11Y-02 · Tamaños de touch target

- Mínimo 44×44 px en mobile.
- Buttons con padding suficiente (no solo color visual sin área clickeable).

### RNF-A11Y-03 · Soporte para zoom

- La app NO bloquea zoom (sin `user-scalable=no` en meta viewport).
- A 200% de zoom todo sigue legible y operable.

### RNF-A11Y-04 · Preferencias del usuario

- Respetar `prefers-reduced-motion`: deshabilitar animaciones de Motion.
- Respetar `prefers-color-scheme`: en MVP NO hay dark mode (regla del proyecto), pero respetamos el setting si el usuario lo activa accidentalmente.

### RNF-A11Y-05 · Testing

- En CI: `axe-core` en build de Storybook (post-MVP).
- En manual: NVDA (Windows) o VoiceOver (Mac) en cada release mayor.

---

## 7. PWA y soporte offline

### RNF-PWA-01 · Manifest

Cada app tiene su propio `manifest.ts`:
- `name`, `short_name`, `description`, `start_url`, `scope`, `display: 'standalone'`.
- `theme_color: '#F97316'`, `background_color: '#FAF6F1'`.
- Iconos 192×192 y 512×512 (any + maskable).
- `categories` apropiado (food, lifestyle, business).
- `id` único por app (importante para iOS no colapse las 4 PWAs).

### RNF-PWA-02 · Service Worker (Serwist)

- Cada app registra su propio SW.
- Estrategias de cache:
  - **Static assets** (`_next/static/*`): CacheFirst con TTL 1 año.
  - **API responses**: NetworkFirst con fallback a cache de 5 min en lecturas (GETs).
  - **HTML**: NetworkOnly (siempre fresh).
- iOS workarounds:
  - Penalty timeout para evitar SW que se cuelga en iOS Safari.
  - Forzar update del SW en cada activación.

### RNF-PWA-03 · Push subscriptions

- En registro del usuario o tras primer login, prompt para "Activar notificaciones".
- Suscripción VAPID guardada en `push_subscriptions` con `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`.
- Multi-dispositivo soportado (un user puede tener N suscripciones).
- Limpieza diaria de suscripciones inactivas >14 días vía cron `prune-stale-push-subscriptions`.

### RNF-PWA-04 · Soporte offline (best effort)

- En MVP, las apps requieren conexión para funcionar (no es app offline-first).
- Excepción: la PWA del motorizado debe poder mostrar pedidos activos almacenados localmente cuando la conexión es intermitente (caso real en pueblos con cobertura espotty).
- Estrategia: TanStack Query con `persistQueryClient` + IndexedDB. Las queries cacheadas siguen disponibles 1h sin red.
- Acciones (POST) sin conexión: se ponen en `outbox` local (IndexedDB) y se reintentan cuando vuelve la red.

### RNF-PWA-05 · Instalación

- Prompt `BeforeInstallPromptEvent` interceptado y mostrado custom tras 30s de uso o tras primer pedido.
- En iOS, instrucciones "Compartir → Agregar a pantalla de inicio" (no hay API automática).
- Banner persistente en la app del driver hasta que se instale (motorizado SÍ necesita PWA instalada para push fiable).

---

## 8. Localización

### RNF-L10N-01 · Idioma

- **Español Perú** (es-PE) en todo el sistema.
- Sin i18n en MVP. Strings hardcoded en JSX.
- Si en post-MVP se agrega otro idioma, refactor con `next-intl`.

### RNF-L10N-02 · Moneda

- **PEN** (S/) en todos los montos.
- Formato: `S/ 25.00` (con espacio, dos decimales, punto como separador decimal).
- Money guardado en Postgres como `DECIMAL(10, 2)`. NUNCA float.

### RNF-L10N-03 · Fechas

- Timezone: **America/Lima** (UTC-5).
- Almacenamiento: UTC en BD.
- Display: formato `dd/mm/yyyy HH:mm` (24h).
- Fechas relativas: "hace 3 min", "hace 2h", "ayer", "hace 3 días" (usar `date-fns` + locale es-PE).

### RNF-L10N-04 · Teléfonos

- Formato peruano: `+51` + `9` + 8 dígitos (total 9 dígitos después de +51).
- Validación regex: `/^9\d{8}$/`.
- Display: `+51 987 654 321` con espacios.

### RNF-L10N-05 · Direcciones

- Sin enforce de estructura (calle/jirón/nro/distrito). Texto libre + referencia.
- Ejemplo válido: "Jr. Sucre 412, frente al grifo azul, segundo piso".

---

## 9. Mantenibilidad y calidad de código

### RNF-MAINT-01 · Convenciones de código

- TypeScript strict mode en TODOS los packages y apps.
- Biome para lint + format. `biome.json` en raíz del monorepo.
- Nombres: archivos `kebab-case.ts`, componentes `PascalCase.tsx`, clases `PascalCase`, funciones `camelCase`, tipos `PascalCase`.
- Tablas DB en `snake_case`. Enums en `snake_case` valor.

### RNF-MAINT-02 · Estructura de packages

- `packages/core` es backend-only (NO React, NO Supabase client web). Solo `@tindivo/supabase` en `infrastructure/`.
- `packages/ui` es frontend-only.
- `packages/contracts` (Zod) y `packages/api-client` son compartidos cliente-servidor.
- Vertical slicing por feature en cada app.

### RNF-MAINT-03 · Testing

- `packages/core` tiene Vitest con cobertura mínima 70% en use cases.
- Tests obligatorios para policies (R1-R5, cancellation, transfer).
- Apps tienen tsc + Biome pero NO test suite en MVP (decisión consciente: pilot speed > cobertura E2E).
- Post-MVP: agregar Playwright E2E para flujos críticos (crear pedido, aceptar, entregar).

### RNF-MAINT-04 · Documentación

- Cada módulo de `packages/core` tiene un `README.md` con: entidades, use cases, eventos.
- Cada Edge Function tiene comentario header con: propósito, trigger, payload.
- ADRs (Architecture Decision Records) en `Docs/adr/` para decisiones grandes (ej. "ADR-001: por qué Inngest en lugar de pg_cron").

### RNF-MAINT-05 · Versionado de la API

- Versionado en URL: `/api/v1/...`. Si hay breaking change → `/api/v2/...`.
- Deprecaciones se anuncian con 6 meses de aviso vía changelog.

### RNF-MAINT-06 · Code review

- Todo PR requiere 1 reviewer (en MVP, el fundador). Post-MVP equipo de 2+.
- PRs pequeños (< 400 líneas de diff) preferidos.
- Branch protection en `main`: no force push, requiere CI verde.

---

## 10. Escalabilidad

### RNF-SCALE-01 · Volumen esperado en MVP

- 100-500 pedidos/día en San Jacinto.
- 3-5 negocios activos.
- 2-3 motorizados activos.
- 50-200 clientes registrados.

### RNF-SCALE-02 · Volumen esperado al fin del año 1

- 2,000-5,000 pedidos/día (sumando 3 pueblos).
- 10-15 negocios activos.
- 8-10 motorizados activos.
- 2,000-5,000 clientes registrados.

### RNF-SCALE-03 · Capacidad de Postgres (Supabase)

- En MVP: Supabase Pro plan ($25/mes) — 8GB DB, 100 connections.
- A los 5,000 pedidos/día: la tabla `orders` crece ~150k filas/mes. Particionar por mes si supera 1M filas (`pg_partman`).
- `domain_events` tiene retención 90 días (cron diario de prune). En MVP creciendo a ~50k filas/mes.
- `push_delivery_log` retención 30 días.

### RNF-SCALE-04 · Capacidad de Inngest

- Free tier: 50k function runs/mes.
- Estimado MVP: ~3 runs por pedido (check-overdue, transfer-expiration si aplica, cancel-pending-acceptance si aplica). Con 300 pedidos/día = 9k runs/día = 270k/mes.
- **Excede el free tier**. Mitigación: usar Inngest solo para eventos críticos (overdue, transfer). Para `cancel-pending-acceptance` mantener cron de Supabase.
- Si el cuello de botella es Inngest, evaluar self-hosting (open source).

### RNF-SCALE-05 · Capacidad de Realtime

- Supabase Realtime free tier: 200 concurrent connections.
- Pro tier: 500 concurrent. Suficiente para MVP.
- Optimización: cliente público de tracking (`tindivo.com/pedidos/<shortId>`) usa Realtime con filter específico — no se suscribe a la tabla entera.

---

## 11. Compatibilidad

### RNF-COMPAT-01 · Browsers soportados

- **Chrome / Edge** (últimas 2 versiones).
- **Safari** iOS 16.4+ (requisito para Web Push).
- **Safari** macOS 16.4+ (Web Push).
- **Firefox** (últimas 2 versiones) — best effort.
- **Samsung Internet** (Android default en muchos celulares peruanos).
- NO soporte: Internet Explorer (zero cuota de mercado en Perú).

### RNF-COMPAT-02 · Dispositivos

- **Mobile-first**: 360-414px ancho (rango común de celulares Android medios y iPhones).
- Tablets soportadas (768-1024px) — apps de staff.
- Desktop (>1280px) — admin principalmente.
- Imágenes responsive con `srcset`.

### RNF-COMPAT-03 · Conectividad

- 3G mínimo. En 2G la app puede ser lenta pero funcional.
- Sin conexión: ver RNF-PWA-04.

---

## 12. UX transversal

### RNF-UX-01 · Empty states

- Cada lista tiene mensaje útil cuando está vacía. Ejemplo: "Aún no hay pedidos hoy. Cuando llegue uno, aparecerá aquí."
- No mostrar lista vacía sin contexto.

### RNF-UX-02 · Loading states

- Skeletons que reflejan el contenido (no spinners genéricos).
- Tiempo máximo de loading visible: 3s antes de mostrar mensaje "Estamos cargando, un segundo..."

### RNF-UX-03 · Error boundaries

- Cada sección crítica (cart, checkout, payment, tracking) envuelta en `ErrorBoundary` que muestra fallback amigable + botón "Recargar".

### RNF-UX-04 · Confirmación de acciones destructivas

- Cancelar pedido: modal con resumen + razón obligatoria + botón "Sí, cancelar" estilo destructivo.
- Desactivar negocio: modal con razón obligatoria.
- Eliminar cuenta (cliente): doble confirmación + WhatsApp soporte.

### RNF-UX-05 · Toasts

- Acciones exitosas: toast verde 3s con icono check.
- Acciones fallidas: toast rojo 5s con icono X + mensaje claro + opción "Reintentar" si aplica.
- No usar `alert()` ni `confirm()` nativo.

### RNF-UX-06 · Optimistic UI (selectivo)

- `useCart()` (agregar/quitar items): optimistic (update local, sync background).
- Botón "Aceptar pedido" del motorizado: NO optimistic (race condition con otro driver — esperamos respuesta servidor).

### RNF-UX-07 · 404 y 500 con utilidad

- Página 404: mensaje cálido + link a home + link a soporte.
- Página 500: mensaje cálido + link "Recargar" + link a soporte WhatsApp.

### RNF-UX-08 · Soporte por WhatsApp

- Cada error / pantalla crítica tiene link al WhatsApp de soporte de Tindivo: `wa.me/51987654321?text=...`.
- El mensaje pre-rellenado incluye el contexto (`#shortId`, pantalla, error).

---

**Este documento es vivo**. Se revisa cada release mayor. Si un RNF deja de cumplirse, se documenta el porqué y la fecha en que se planea recuperar.
