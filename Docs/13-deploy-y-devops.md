# 13 · Deploy y DevOps

> Cómo se despliegan las 5 apps, las migrations de Supabase, las Edge Functions, las Inngest functions, y los crons. CI/CD, variables de entorno, backups, monitoring.

---

## Tabla de contenidos

- [1. Arquitectura de deploy](#1-arquitectura-de-deploy)
- [2. Vercel · 5 proyectos](#2-vercel--5-proyectos)
- [3. Supabase · proyecto único](#3-supabase--proyecto-único)
- [4. Inngest · cloud o self-hosted](#4-inngest--cloud-o-self-hosted)
- [5. Variables de entorno](#5-variables-de-entorno)
- [6. CI/CD con GitHub Actions](#6-cicd-con-github-actions)
- [7. Migrations de base de datos](#7-migrations-de-base-de-datos)
- [8. Edge Functions de Supabase](#8-edge-functions-de-supabase)
- [9. Crons](#9-crons)
- [10. Backups y disaster recovery](#10-backups-y-disaster-recovery)
- [11. Monitoring y alertas](#11-monitoring-y-alertas)
- [12. Local dev setup](#12-local-dev-setup)
- [13. Release process](#13-release-process)

---

## 1. Arquitectura de deploy

```
┌────────────────────────────────────────────────────────────────┐
│                         GITHUB (main)                          │
└──────────────────────────────┬─────────────────────────────────┘
                               │ push
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  ┌──────────┐          ┌──────────┐           ┌──────────┐
  │  Vercel  │          │ Supabase │           │ Inngest  │
  │ 5 apps   │          │ Migrations│           │ Functions│
  │ Deploy   │          │  Edge    │           │  Deploy  │
  └──────────┘          │ Functions│           └──────────┘
                        │  Crons   │
                        └──────────┘
```

**Proveedores externos**: Vercel (hosting + CDN), Supabase (BD + Auth + Realtime + Storage + Edge), Inngest (scheduling). Tres proveedores. Cada uno con free tier suficiente para MVP.

---

## 2. Vercel · 5 proyectos

Cada app en `apps/` se despliega como un proyecto Vercel independiente:

| Proyecto Vercel | Repo path | Dominio producción | Dominio preview |
|---|---|---|---|
| `tindivo-api` | `apps/api` | `api.tindivo.com` | `api-tindivo-pr-N.vercel.app` |
| `tindivo-customer` | `apps/customer` | `tindivo.com` + `www.tindivo.com` | `customer-tindivo-pr-N.vercel.app` |
| `tindivo-admin` | `apps/admin` | `admin.tindivo.com` | `admin-tindivo-pr-N.vercel.app` |
| `tindivo-negocios` | `apps/negocios` | `negocios.tindivo.com` | `negocios-tindivo-pr-N.vercel.app` |
| `tindivo-motorizados` | `apps/motorizados` | `motorizados.tindivo.com` | `motorizados-tindivo-pr-N.vercel.app` |

### Configuración por proyecto

En Vercel Dashboard, cada proyecto tiene:

- **Root Directory**: `apps/<app>`
- **Build Command**: `cd ../.. && pnpm turbo build --filter=<app>`
- **Install Command**: `pnpm install --frozen-lockfile`
- **Output Directory**: `apps/<app>/.next`
- **Framework Preset**: Next.js
- **Node version**: 20.x

### Turborepo cache

Vercel detecta `turbo.json` y reusa cache entre proyectos si los inputs no cambiaron. Cuando un PR solo toca `apps/customer`, los otros 4 proyectos NO rebuildan.

### Custom domains

DNS apuntando a Vercel:

```
A     tindivo.com               76.76.21.21
A     www.tindivo.com           76.76.21.21
CNAME api.tindivo.com           cname.vercel-dns.com
CNAME admin.tindivo.com         cname.vercel-dns.com
CNAME negocios.tindivo.com      cname.vercel-dns.com
CNAME motorizados.tindivo.com   cname.vercel-dns.com
```

Vercel emite certificados SSL automáticos (Let's Encrypt).

### Preview deployments

Cada PR genera 5 preview URLs (una por app). El admin puede testear antes de merge.

---

## 3. Supabase · proyecto único

Un solo proyecto Supabase para v2: `tindivo-v2` (separado del v1 que sigue en producción durante migración).

### Plan

- **Free tier** para los primeros 30 días de piloto (8GB DB, 50GB egress, 100 connections).
- **Pro plan** ($25/mes) cuando se acerquen límites del free tier o cuando se requiera PITR.

### Componentes

| Componente | Uso |
|---|---|
| Postgres 15 | Base de datos principal |
| Auth | Login email + Google + Apple (post-MVP) |
| Realtime | `postgres_changes` + broadcast |
| Storage | 5 buckets (business-logos, business-qrs, menu-items, payment-proofs, receipts) |
| Edge Functions | `send-push`, `prune-domain-events`, etc. |
| pg_cron | Failsafe scheduling cada 5 min |
| Vault | Secrets (VAPID, service_role, app_internal_api_url) |

### Acceso

- **Dashboard**: solo admin y CTO/fundador.
- **Service Role Key**: en Vercel env vars de `apps/api` Y en Supabase Vault. NUNCA en repo.
- **Anon Key**: en `NEXT_PUBLIC_SUPABASE_ANON_KEY` de cada app — puede estar expuesto (RLS protege).
- **DB password**: en password manager. Solo se usa para migraciones manuales si CLI falla.

---

## 4. Inngest · cloud o self-hosted

### Inngest Cloud (recomendado MVP)

- Free tier: 50k function runs/mes.
- Estimación uso MVP: ~270k/mes si TODOS los pedidos usan las 4 functions. Mitigación:
  - Solo `checkOrderOverdue` y `processTransferTimeout` van por Inngest.
  - `autoCancelPending` y `closeDriversAtShiftEnd` van por cron Supabase (no event-scheduled, batch).
  - Estimado real MVP: ~30-50k runs/mes. Dentro de free tier.

### Endpoint en Vercel

`apps/api/app/api/inngest/route.ts` expone el endpoint que Inngest llama:

```ts
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [checkOrderOverdue, processTransferTimeout],
  signingKey: process.env.INNGEST_SIGNING_KEY,
})
```

Inngest auto-discovers el endpoint al hacer deploy.

### Inngest Cloud → Vercel webhook

En Inngest Dashboard:
1. Crear app "tindivo-v2".
2. Endpoint URL: `https://api.tindivo.com/api/inngest`.
3. Verificar firma con `INNGEST_SIGNING_KEY`.

### Self-hosting (alternativa post-MVP)

Si el free tier se queda corto:
- Inngest es open source (Apache 2.0).
- Self-host en Fly.io o Railway con SQLite ($5/mes).
- Mismo SDK, solo cambia el endpoint base.

---

## 5. Variables de entorno

### Por app (Vercel env vars)

Cada app tiene un subset de variables. Patrón:

#### Comunes a todas las apps

```env
NEXT_PUBLIC_SUPABASE_URL="https://<proj>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
NEXT_PUBLIC_VAPID_PUBLIC_KEY="B..."

# URLs públicas (para construir links cross-app)
NEXT_PUBLIC_CUSTOMER_URL="https://tindivo.com"
NEXT_PUBLIC_ADMIN_URL="https://admin.tindivo.com"
NEXT_PUBLIC_NEGOCIOS_URL="https://negocios.tindivo.com"
NEXT_PUBLIC_MOTORIZADOS_URL="https://motorizados.tindivo.com"
NEXT_PUBLIC_API_URL="https://api.tindivo.com"
NEXT_PUBLIC_SOPORTE_WHATSAPP="51987654321"
```

#### Solo en `apps/api`

```env
SUPABASE_SERVICE_ROLE_KEY="eyJ..."            # bypassa RLS
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:admin@tindivo.com"
INNGEST_EVENT_KEY="..."
INNGEST_SIGNING_KEY="signkey-..."
SENTRY_AUTH_TOKEN="..."                       # para source maps
UPSTASH_REDIS_REST_URL="..."                  # rate limiting
UPSTASH_REDIS_REST_TOKEN="..."
ALLOWED_ORIGINS="https://tindivo.com,https://admin.tindivo.com,..."
```

#### Solo en apps cliente con Sentry

```env
NEXT_PUBLIC_SENTRY_DSN="https://...@sentry.io/..."
```

### En Supabase Vault

Secrets accesibles desde Edge Functions y triggers `pg_net`:

```sql
INSERT INTO vault.secrets (name, secret) VALUES
  ('service_role_key', '<service_role>'),
  ('app_internal_api_url', 'https://api.tindivo.com/api/v1/internal'),
  ('send_push_url', 'https://<proj>.supabase.co/functions/v1/send-push'),
  ('inngest_webhook_url', 'https://inn.gs/e/<inngest_event_key>');
```

### Sincronización dev / staging / prod

- **dev**: `.env.local` por app (no commit).
- **staging**: branch `staging` → preview deployment Vercel + Supabase staging project.
- **prod**: branch `main` → production deployment.

---

## 6. CI/CD con GitHub Actions

### Workflow principal

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check          # Biome
      - run: pnpm type-check     # tsc en cada package

  test-core:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @tindivo/core test

  build:
    runs-on: ubuntu-latest
    needs: [lint-and-type-check]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

### Deploy automático

Vercel detecta push a `main` y despliega cada app automáticamente. No necesitamos workflow propio para deploys.

Para Supabase migrations:

```yaml
# .github/workflows/migrate.yml
name: Migrate Supabase
on:
  push:
    branches: [main]
    paths: ['supabase/migrations/**']

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase db push --db-url ${{ secrets.SUPABASE_DB_URL }}
```

Para Edge Functions:

```yaml
# .github/workflows/deploy-functions.yml
name: Deploy Edge Functions
on:
  push:
    branches: [main]
    paths: ['supabase/functions/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

---

## 7. Migrations de base de datos

### Convención

Archivos en `supabase/migrations/<timestamp>_<name>.sql`. Timestamp en formato `YYYYMMDDHHMMSS`.

Ejemplo: `20260101120000_init.sql`, `20260102100000_add_business_capabilities.sql`.

### Workflow

1. **Local**: editar SQL en `supabase/migrations/*.sql`. Aplicar a local Supabase con `supabase db reset`.
2. **PR**: incluir migration en el PR. CI valida (corre `db reset` + `db push` contra preview Supabase).
3. **Merge a main**: workflow `migrate.yml` aplica con `supabase db push` contra producción.
4. **Tipos**: tras cada migration, regenerar tipos con `pnpm db:types` y commitear `packages/supabase/src/types.gen.ts`.

### Expand-contract

Para cambios breaking, seguir el patrón expand-contract:

1. Migration 1: agregar columna nueva (compatible hacia atrás).
2. Deploy código que escribe en ambas (vieja y nueva).
3. Backfill datos.
4. Deploy código que lee solo de la nueva.
5. Migration 2: borrar columna vieja.

### Rollback

Cada migration tiene su sección `-- down` comentada al final con DROPs necesarios. En caso de rollback de emergencia, ejecutar manualmente.

---

## 8. Edge Functions de Supabase

### Estructura

```
supabase/functions/
├── send-push/
│   └── index.ts                # Web Push VAPID + iteración suscripciones
├── prune-domain-events/
│   └── index.ts                # DELETE FROM domain_events WHERE occurred_at < now() - 90d
├── prune-push-delivery-log/
│   └── index.ts                # Idem, 30d
└── _shared/
    └── cors.ts                 # Helper compartido
```

### Deploy

```bash
supabase functions deploy send-push --project-ref <ref>
```

CI lo hace automático en cada push a `main`.

### Secrets

Las Edge Functions leen secrets de Supabase Vault via env vars:

```bash
supabase secrets set VAPID_PUBLIC_KEY="..." --project-ref <ref>
supabase secrets set VAPID_PRIVATE_KEY="..." --project-ref <ref>
```

### Logs

`supabase functions logs send-push --project-ref <ref>` o ver en dashboard.

---

## 9. Crons

### En Supabase (pg_cron)

```sql
-- Failsafe overdue (cada 5 min)
SELECT cron.schedule(
  'enqueue-overdue-orders-failsafe',
  '*/5 * * * *',
  $$
  INSERT INTO domain_events (aggregate_type, aggregate_id, event_type, payload)
  SELECT 'order', id, 'OrderOverdue', 
    jsonb_build_object('orderId', id, 'shortId', short_id, 'businessId', business_id)
  FROM orders
  WHERE status = 'waiting_driver'
    AND driver_id IS NULL
    AND estimated_ready_at < now() - interval '5 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM domain_events de
      WHERE de.aggregate_id = orders.id
        AND de.event_type = 'OrderOverdue'
        AND de.occurred_at > now() - interval '10 minutes'
    );
  $$
);

-- Otros crons análogos para transfer expiration, pending acceptance, prune events, etc.
```

### Lista completa de crons

| Cron | Frecuencia | Propósito |
|---|---|---|
| `enqueue-overdue-orders-failsafe` | `*/5 * * * *` | Failsafe de Inngest checkOrderOverdue |
| `process-expired-transfer-requests-failsafe` | `*/5 * * * *` | Failsafe de Inngest processTransferTimeout |
| `auto-cancel-pending-acceptance` | `* * * * *` | Cancela pending_acceptance >5min |
| `auto-close-drivers` | `* * * * *` | Cierra disponibilidad fuera de turno |
| `enqueue-ready-for-drivers-failsafe` | `*/5 * * * *` | Emite OrderReadyForDrivers cuando appears_in_queue_at <= now() |
| `prune-stale-push-subscriptions` | `0 4 * * *` | Limpia suscripciones inactivas >14d |
| `prune-idempotency-keys` | `0 5 * * *` | Limpia keys vencidas (TTL 24h) |
| `prune-expired-rejections` | `0 5 * * *` | Limpia rejections vencidos (TTL 6h) |
| `prune-domain-events` | `0 6 * * *` | Limpia events >90d (Edge Function) |
| `prune-push-delivery-log` | `0 6 * * *` | Limpia logs >30d |

---

## 10. Backups y disaster recovery

### Supabase automatic backups

- **Free**: backups diarios, retención 7 días.
- **Pro**: idem + PITR (point-in-time recovery) hasta 7 días.

### Backups manuales

Durante MVP, además del automático, cada lunes el admin ejecuta:

```bash
pg_dump "$DIRECT_URL" > backups/tindivo_$(date +%Y%m%d).sql
# Subir a Google Drive personal del fundador
```

Retención de manuales: 6 meses.

### RPO / RTO

- **RPO** (data loss aceptable): 24h. Si pasa lo peor, perdemos un día.
- **RTO** (downtime aceptable): 1h. Restore + propagación DNS.

### Plan de disaster recovery

1. Supabase cae completo:
   - Vercel sigue sirviendo HTML estático cacheado (LCP visible).
   - APIs fallan → frontend muestra "Servicio caído temporalmente, reintenta en 5 min".
   - Si dura >30 min, migration manual a backup project Supabase con `pg_restore`.

2. Vercel cae:
   - DNS apunta a backup (Cloudflare Pages mirror, configurado en post-MVP).
   - Mientras tanto: página estática en GitHub Pages con mensaje "Mantenimiento, vuelve en X min".

3. Inngest cae:
   - Failsafe crons de Supabase toman el relevo (latencia P99 sube a 5 min).
   - Notificar al equipo. Inngest típicamente recupera en <1h.

---

## 11. Monitoring y alertas

### Stack de observabilidad

- **Vercel Analytics**: Core Web Vitals + traffic + edge functions metrics.
- **Vercel Logs**: 1 día retención. Para más, export a Axiom.
- **Axiom** (free tier 500GB/mes): logs estructurados centralizados.
- **Sentry** (free 5k errors/mes): error tracking en frontend + backend.
- **UptimeRobot** (free): synthetic monitoring de las 5 URLs cada 5 min.
- **Supabase Dashboard**: métricas DB (CPU, connections, slow queries).
- **Inngest Dashboard**: function runs, latencia, fallos.

### Alertas críticas

| Alerta | Trigger | Canal | Responsable |
|---|---|---|---|
| Una de las 5 apps cae | UptimeRobot 3 pings fallidos | WhatsApp + email al admin | Admin |
| Sentry error rate > 1/min | Sentry alert | Email al admin | Admin |
| Supabase DB CPU > 80% por 5 min | Supabase alert | Email al admin | Admin |
| Inngest function failure rate > 5% | Inngest webhook | WhatsApp al admin | Admin |
| Push delivery rate < 90% | Custom (query a push_delivery_log) | Daily digest email | Admin |

---

## 12. Local dev setup

### Pre-requisitos

- Node 20.x
- pnpm 9.x
- Supabase CLI (`brew install supabase/tap/supabase` o equivalente)
- Docker Desktop (para Supabase local stack)

### Setup inicial

```bash
git clone <repo>
cd tindivo-v2
pnpm install
cp .env.example .env.local
# Editar .env.local con keys de tu Supabase local

supabase start                          # Levanta Postgres + Realtime + Auth local
supabase db reset                       # Aplica migrations
pnpm db:types                           # Regenera tipos
pnpm dev                                # Levanta 5 apps en paralelo
```

Apps en local:
- `apps/api` → http://localhost:3001
- `apps/customer` → http://localhost:3002
- `apps/admin` → http://localhost:3000
- `apps/negocios` → http://localhost:3003
- `apps/motorizados` → http://localhost:3004

### Inngest dev server

```bash
npx inngest-cli@latest dev
# Dashboard en http://localhost:8288
```

Apunta al endpoint local de tu `apps/api`:

```bash
INNGEST_DEV=1 pnpm --filter @tindivo/api dev
```

### Seed data

```bash
pnpm db:seed
# Crea admin, 2 businesses, 2 drivers, 5 pedidos de prueba
```

---

## 13. Release process

### Versionado

- **Semver** en `package.json` root: `major.minor.patch`.
- MVP arranca en `2.0.0`.
- Features = minor (`2.1.0`).
- Bug fixes = patch (`2.0.1`).
- Breaking changes (API breaking, schema breaking) = major (`3.0.0`).

### Release checklist

1. Crear branch `release/v2.X.0` desde `main`.
2. Actualizar `CHANGELOG.md` con cambios.
3. Bump version: `pnpm version <minor|patch>` en root.
4. Smoke test en preview deployments (5 URLs).
5. PR a `main` → merge.
6. Tag `v2.X.0` en main.
7. Vercel despliega automático.
8. Migrations aplican automático.
9. Notificar al equipo + post mortem si hubo issues.

### Rollback

Si un deploy a `main` rompe producción:

1. Vercel Dashboard → Deployments → click en el deploy anterior → "Promote to Production".
2. Si hay migration nueva: revertir manualmente con SQL.
3. Investigar causa, fix en branch nuevo, repetir release.

### Maintenance window

Cambios destructivos (migration que requiere downtime) se agendan en:

- **Madrugada Lima** (3-6am).
- **Notificar a usuarios** vía banner en `tindivo.com` 24h antes.
- **Página de mantenimiento** custom durante la ventana (no 500).

---

**Próximo doc**: `04-base-de-datos.md` — schema completo con DDL.
