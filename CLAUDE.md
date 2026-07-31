# CLAUDE.md — Tindivo 2.0

Instrucciones canónicas para cualquier sesión de Claude Code en este repo.
**Antes de tocar nada, lee `DECISIONS.md`** (fuente única de verdad) y los specs en `Docs/`.

## Qué es

Plataforma de delivery hiper-local para pueblos del Perú. Piloto: San Jacinto,
Áncash · 1 restaurante (La Florencia) · de noche · 1 motorizado · equilibrio
~10 pedidos/noche. Antifraude **humano** (la cajera llama). Tindivo **no retiene
fondos** (Yape/Plin/efectivo directo al negocio). Reconstrucción desde cero del
v1 (`C:\Users\mauri\Documents\Tindivo`), que tenía deuda técnica.

## Arquitectura (resumen — detalle en `DECISIONS.md §3`)

- **Monorepo** Turborepo + pnpm workspaces (versiones en `pnpm-workspace.yaml` catalog).
- **5 proyectos**: `apps/api` (REST `/api/v1`) + 4 frontends (`customer`, `negocios`, `motorizados`, `admin`), uno por subdominio.
- **Sin Server Actions ni BFFs** (Capacitor-ready). **Sin Prisma/Drizzle** (RLS).
- `packages/core` puro: hexagonal solo en `orders`; services+repos para el resto.
- `packages/contracts`: Zod canónico (primitivas, enums, máquina de estados, errores).
- Supabase "Web v2" (ref `zpnipajgwfthxhdtzhly`), Postgres 17. **Independiente del v1.**

## Convenciones

- **Código, DB y commits en inglés**; contenido y UI en **español peruano**.
- TypeScript **strict** (TS 6). Zod **v4** (≠ v3). Next **16** + React **19** + Tailwind **v4**.
- **Vertical slicing por feature**; una feature no importa de otra (lo común sube a `lib/`/`packages/`).
- No DRY prematuro (extraer con 3+ usos). No abstracción sin 2+ implementaciones.
- Dinero `numeric(10,2)`; coordenadas `numeric(10,7)`; parámetros operativos en `app_settings` (no hardcode).
- Formato/lint con **Biome** (`pnpm lint`, `pnpm format`).

## Invariantes que NO se rompen (lecciones del v1)

1. **`short_id`**: validar solo al CREAR, **nunca al rehidratar** desde la DB. Alfabeto sin I/O/0/1, 8 chars.
2. **`numero_pedido`** atómico desde el backend, **nunca `Date.now()`**.
3. **RLS activada en TODAS las tablas** con policies explícitas; helpers `SECURITY DEFINER` con `SET search_path = ''`.
4. **Outbox transaccional**: `domain_events` en la MISMA transacción que el agregado.
5. **Tag de push** = `${event_type}-${shortId}` (no solo `shortId`).
6. **Migraciones idempotentes** y versionadas (`DROP IF EXISTS`/`CREATE OR REPLACE`).
7. **Multi-rol desde el día 1** (`users` + `user_roles` + JWT claims).

## Comandos

```bash
pnpm install            # instala todo el workspace
pnpm dev                # turbo run dev (todas las apps)
pnpm lint               # biome check
pnpm type-check         # turbo type-check
pnpm test               # vitest (core + contracts)
pnpm db:types           # genera packages/supabase/src/database.types.ts
pnpm graphify:update    # actualiza el grafo incrementalmente (sin costo de API para código)
pnpm graphify:cluster   # re-agrupa y actualiza reportes del grafo existente
pnpm graphify:hooks     # instala post-commit git hook para auto-actualizar
```

## Supabase

- **Dos bases.** Local en `127.0.0.1:54321` (Postgres en `54322`), que es donde
  apuntan todos los `.env.local` y donde corren las apps. Remota
  `zpnipajgwfthxhdtzhly`, cuyo nombre real es **`tindivo-prod`** (el viejo
  "Web v2" es `psjigdoinfpgrnedxeyf`, ABANDONADO). Los contenedores locales se
  llaman `supabase_db_zpnipajgwfthxhdtzhly`, con el ref del remoto: eso confunde.
  Antes de sacar conclusiones de una consulta, declara contra cuál la ejecutaste.
- **Sí hay CLI** (`supabase`, v2.109+), y las migraciones se aplican SOLO con él:
  `supabase db reset` / `migration up` en local, `supabase db push` en remoto.
  Nunca por MCP `apply_migration`, editor SQL del panel, ni `docker cp` + `psql`.
  El detalle de qué rompió cada vía está en `.agents/AGENTS.md §2.1-bis`.
- El MCP de Supabase sirve para **leer** el remoto (consultas, advisors), no para
  aplicar migraciones.
- Las migraciones se versionan en `supabase/migrations/` con numeración `NNNN_`.
  Antes de crear una, `supabase migration list` para ver el primer número libre.
- Tras cada migración: `pnpm db:types` (apunta al remoto, así que **después** del
  push) y revisar `get_advisors`.

## Reglas de proceso (del sistema multi-agente de Mauri)

- Build fase por fase con **aprobación del usuario en cada hito**.
- Two-stage review antes de "done": `code-reviewer` + `verification-before-completion`.
- Cada agente UI corre Playwright/`/browse` antes de declarar "done".
- Backend con TDD (test primero) en `packages/core`.
- Nunca `--no-verify` ni `push --force` a main sin permiso explícito.
