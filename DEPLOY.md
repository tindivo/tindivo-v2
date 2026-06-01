# DEPLOY.md — Runbook de go-live (Tindivo 2.0)

Checklist accionable para llevar el piloto a producción (San Jacinto · La Florencia · 1 moto).
Lo marcado **[tú]** requiere tus credenciales; el resto ya está preparado en el repo.

---

## 0. Pre-requisitos

- Proyecto Supabase **"Web v2"** (`psjigdoinfpgrnedxeyf`) — ya tiene migraciones 0001–0029 aplicadas.
- Cuenta Vercel, cuenta Inngest Cloud (keys ya en `apps/api/.env.local`), dominio `tindivo.com`.

## 1. Variables de entorno por app **[tú]**

Copia `.env.example` → `.env.local` (o configúralas en Vercel) por proyecto. Valores reales:

| Variable | customer | negocios | motorizados | admin | api |
|---|:--:|:--:|:--:|:--:|:--:|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_API_URL` (= `https://api.tindivo.com/api/v1`) | ✓ | ✓ | ✓ | ✓ | — |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✓ | ✓ | ✓ | ✓ | — |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` (= número real) | ✓ | — | — | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` (**secreto**) | — | — | — | — | ✓ |
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` (**secreto**) | — | — | — | — | ✓ |

> El service_role y las keys de Inngest **solo** van en `apps/api`. Nunca en las apps frontend.

## 2. Edge Function secrets (Web Push) **[tú]**

El Edge Function `send-push` ya está desplegado. Para que **envíe** (no solo registre), setea sus secrets:

```bash
supabase secrets set --project-ref psjigdoinfpgrnedxeyf \
  VAPID_PUBLIC_KEY="<NEXT_PUBLIC_VAPID_PUBLIC_KEY>" \
  VAPID_PRIVATE_KEY="<privada de apps/api/.env.local>" \
  VAPID_SUBJECT="mailto:soporte@tindivo.com"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente al Edge Function.

> **Rota** la llave privada VAPID y la signing key de Inngest si se compartieron en texto plano.

## 3. Vercel — 5 proyectos **[tú]**

Un proyecto por app, todos con root del monorepo y build filtrado:

| Proyecto | Root / build command | Dominio |
|---|---|---|
| tindivo-api | `pnpm --filter @tindivo/api build` | `api.tindivo.com` |
| tindivo-customer | `pnpm --filter @tindivo/customer build` | `tindivo.com` (apex) |
| tindivo-negocios | `pnpm --filter @tindivo/negocios build` | `negocios.tindivo.com` |
| tindivo-motorizados | `pnpm --filter @tindivo/motorizados build` | `motorizados.tindivo.com` |
| tindivo-admin | `pnpm --filter @tindivo/admin build` | `admin.tindivo.com` |

- Install command: `pnpm install --frozen-lockfile`. Output: `apps/<app>/.next`.
- La whitelist CORS (`apps/api/lib/http/cors.ts`) ya cubre los 4 orígenes frontend.

## 4. DNS **[tú]**

Apunta el apex `tindivo.com` + los CNAME `api`/`negocios`/`motorizados`/`admin` a Vercel.

## 5. Inngest Cloud **[tú]**

- Sirve el endpoint `https://api.tindivo.com/api/inngest`.
- Registra la app en Inngest Cloud con la signing key. Quita `INNGEST_DEV=1` en prod.
- Funciones: `order-acceptance-timeout`, `cash-settlement-auto-confirm`, `order-validation-timeout`, `order-prepay-timeout`.

## 6. Seeds de go-live

Parámetros operativos (`app_settings`) ya sembrados: `commissions` (3.00/3.50/0.50), `delivery_bands`,
`timers`, `prepay_threshold` (100), `validation` (80), `strikes` (2), `contingency_fund` (250),
`platform_schedule` (mar–sáb 18:00–23:00), `coverage` (San Jacinto). Ajusta desde **Admin → Configuración**.

Crear los actores del piloto (necesitan cuenta Auth → vía Admin, no SQL puro):

1. **Admin → + Negocio**: crea *La Florencia* (capacidades: publica catálogo + delivery + recojo + usa moto Tindivo). Luego, como negocio, en **/configuracion** carga Yape/QR, ETA y horario; en **/menu** carga la carta.
2. **Admin → + Motorizado**: crea el motorizado del piloto.
3. **[tú]** Setea `NEXT_PUBLIC_SUPPORT_WHATSAPP` y `app_settings.support_whatsapp` con el número real (Admin → Configuración).
4. **[tú]** Confirma el fondo de contingencia real disponible en el Yape del admin (S/200–300).

## 7. Contenido legal **[tú]**

`/terminos` y `/privacidad` (Ley 29733) ya tienen contenido base en la app cliente. Revisa con
asesoría legal antes de operar (cláusula de adelanto del fondo para restaurantes, política de strikes).

## 8. Smoke post-deploy

1. `GET https://api.tindivo.com/api/v1/health` → 200.
2. Las 4 apps cargan + se pueden instalar (PWA) en Android Chrome.
3. Flujo real: cliente nuevo → validación por llamada → aceptar → preparar → recoger → entregar (efectivo)
   → liquidación diaria (confirmar) → push recibido en cada paso (requiere HTTPS, ya disponible en prod).
4. Verifica que el push llega de verdad (paso 3 ya con VAPID secrets del Edge Function).

## 9. Observabilidad (opcional en piloto) **[tú]**

- Sentry (`SENTRY_DSN`) + UptimeRobot sobre `/health` de las 5 URLs.
- Cron `close-driver-shifts` (pg_cron, cada 15 min) ya activo: cierra disponibilidad fuera de horario.

---

**Estado del repo:** todas las fases funcionales (A–I) implementadas y verificadas e2e. Migraciones
0001–0029 en `supabase/migrations/`. Edge Function `send-push` desplegado. Falta solo lo marcado **[tú]**.
