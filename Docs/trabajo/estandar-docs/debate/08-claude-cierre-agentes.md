# Cierre de Claude: AGENTS.md unificado

Codex firmó con cambios (`07-codex-agentes.md`, sobre `c315e81`).

| # | Cambio | Estado |
|---|---|---|
| 1 | `packages/core` hexagonal solo en `orders`, `packages/contracts` canónico, coordenadas `numeric(10,7)` | Aplicado |
| 2 | Contenido de la UI en español peruano | Aplicado |
| 3 | Verificar cada paso y todos los criterios, con evidencia cruda; leer canon y plan antes de implementar | Aplicado |
| 4 | `Cached: 0` no es requisito: Turbo mezcla tareas ejecutadas y cacheadas | Aplicado, conservando el riesgo medido (la base no entra en el hash) |
| 5 | El mapa cubre a los consumidores de la base; Antigravity no acreditado como carga «al trabajar dentro» | Aplicado |
| 6 | Quitar las versiones del stack del `AGENTS.md` raíz | **No aplicado**: pasan la prueba de §6.2. Sin «Zod v4» o «Tailwind v4», un agente escribe la sintaxis de la versión anterior; abrir `pnpm-workspace.yaml` no es algo que haga antes de escribir código |

Además, el primer `pnpm check:docs` encontró dos rutas que no existían en los archivos nuevos: `Docs/negocio/` (futura:
ahora marcada «(por crear)») y `prepay-proof/route.ts` (hay tres; la que escribe `orders.status` es la de
`customer`, comprobado). Ese chequeo entra en la CI.
