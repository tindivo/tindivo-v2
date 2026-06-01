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
- Supabase "Web v2" (ref `psjigdoinfpgrnedxeyf`), Postgres 17. **Independiente del v1.**

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
```

## Supabase

- No hay CLI local: aplicar migraciones y generar tipos vía **MCP de Supabase**
  sobre el proyecto **"Web v2"** (`psjigdoinfpgrnedxeyf`). Las migraciones se
  versionan en `supabase/migrations/`.
- Tras cada migración: regenerar `database.types.ts` y revisar `get_advisors`.

## Reglas de proceso (del sistema multi-agente de Mauri)

- Build fase por fase con **aprobación del usuario en cada hito**.
- Two-stage review antes de "done": `code-reviewer` + `verification-before-completion`.
- Cada agente UI corre Playwright/`/browse` antes de declarar "done".
- Backend con TDD (test primero) en `packages/core`.
- Nunca `--no-verify` ni `push --force` a main sin permiso explícito.
