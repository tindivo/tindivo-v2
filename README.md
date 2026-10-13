# Tindivo

Plataforma de delivery hiperlocal para pueblos del Perú. Opera en **San Jacinto (Áncash)**, de noche, con pedidos de
restaurante, **Tindivo Entregas** (llevar de A a B algo ya pagado) y **Tindivo Store**. Tindivo no retiene fondos: el
cliente paga directo al negocio.

## Dónde está cada cosa

| Quiero… | Voy a… |
|---|---|
| Entender el negocio | [`Docs/negocio/`](./Docs/negocio/) (plataforma, dinero, antifraude, apps, diseño y un archivo por servicio) |
| Saber el nombre de algo | [`Docs/glosario.md`](./Docs/glosario.md) |
| Ver cómo está construido | [`Docs/arquitectura/README.md`](./Docs/arquitectura/README.md) |
| Operar, desplegar o diagnosticar | [`Docs/operacion/`](./Docs/operacion/) |
| Ver por qué se decidió algo | [`Docs/decisiones/`](./Docs/decisiones/) y [`DECISIONS.md`](./DECISIONS.md) |
| Ver lo que está en ejecución | [`Docs/planes/`](./Docs/planes/) (migraciones y migración a apps nativas) |
| Saber cómo se documenta y se trabaja con agentes | [`Docs/README.md`](./Docs/README.md) |
| **Trabajar con un agente de IA** | [`AGENTS.md`](./AGENTS.md) (Claude Code lo importa desde `CLAUDE.md`) |

`Docs/trabajo/` son borradores y análisis: **no manda**.

## Estructura

```
apps/
  api/          API REST /api/v1               (apiv2.tindivo.com)
  customer/     el cliente                     (tindivo.com)
  negocios/     la cajera                      (negocios.tindivo.com)
  motorizados/  el motorizado                  (motorizados.tindivo.com)
  admin/        Jesús: operación y cobros      (admin.tindivo.com)
packages/       contracts (la fuente canónica), core, supabase, api-client, ui, map, images
supabase/       migraciones (inmutables), funciones y reglas locales
```

Stack: Next.js 16 · React 19 · TypeScript 6 estricto · Tailwind v4 · Zod v4 · Supabase (Postgres 17) · Inngest ·
Biome · Vitest · Turborepo + pnpm.

## Cómo empezar

```bash
pnpm install                                  # Node >= 20.9, pnpm 9
cp .env.example apps/<app>/.env.local         # y completa las variables
pnpm dev                                      # todas las apps
```

Comandos habituales: `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm check:docs`, `pnpm db:types`.
La base local, las migraciones y los tests de integración tienen sus reglas en
[`supabase/AGENTS.md`](./supabase/AGENTS.md); las trampas conocidas, en
[`Docs/operacion/trampas.md`](./Docs/operacion/trampas.md).

## Cómo se trabaja

- Una rama por cambio y un PR contra `develop`, con la línea `Impacto documental:` completa (la plantilla del PR la trae
  y la CI falla si queda vacía).
- Nadie revisa su propio trabajo.
- Una vez por clon, activa el hook que mantiene al día el grafo del repo: `git config core.hooksPath .githooks`
  (detalle en [`Docs/operacion/graphify.md`](./Docs/operacion/graphify.md)).
