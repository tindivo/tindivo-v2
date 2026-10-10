# AGENTS.md — Tindivo 2.0

Instrucciones para **cualquier agente** en este repo: Claude Code (lo importa desde `CLAUDE.md`), Codex y Antigravity
(lo leen directamente). Es la única fuente: no hay copias en otros archivos de agentes.

## Qué es

Plataforma de delivery hiperlocal para pueblos del Perú; opera en San Jacinto (Áncash) y `tindivo-prod` es
**operación real**. Servicios: pedidos de restaurante, **Tindivo Entregas** (llevar de A a B algo ya pagado) y
**Tindivo Store**. Antifraude **humano** (la cajera llama). Tindivo **no retiene fondos**: el cliente paga directo
al negocio (Yape, Plin o efectivo). Monorepo pnpm + Turborepo: `apps/{api,customer,negocios,motorizados,admin}` y
`packages/{core,contracts,api-client,supabase,ui}`. El v1 está en `../tindivo-delivery` (solo como referencia).

## Dónde está la verdad

| Zona | Dónde | ¿Manda? |
|---|---|---|
| **Canon** | `Docs/decisiones/` (ADR), `DECISIONS.md` (decisiones §1–§32 e índice), y lo que vaya naciendo en `Docs/negocio/`, `Docs/arquitectura/`, `Docs/operacion/` | Sí |
| **Planes** | `Docs/planes/` | Sí, solo dentro de su alcance |
| **Trabajo** | `Docs/trabajo/` | **No**: borradores, debates, análisis |
| **Historia** | git | No. Lo borrado se cita por commit |

- La documentación está en plena reorganización: manda `Docs/planes/estandar-docs/estandar.md`. Lo que queda en
  `Docs/` fuera de esas zonas es material anterior, pendiente de reescribir: **no es norma por estar ahí**.
- **Norma ≠ evidencia.** El código y la base dicen qué pasa; el canon, qué debe pasar. Si no coinciden y ninguna
  decisión explica el cambio, **no elijas ganador: pregunta a Jesús** con alternativas y recomendación, y sigue con lo
  independiente (estándar §4).
- **Ningún agente cambia una regla del canon por iniciativa propia.** Erratas y enlaces, sí.

## Reglas locales: léelas antes de tocar esa carpeta

Codex lanzado desde la raíz **no** las carga solo; Claude y Antigravity sí, al trabajar dentro.

| Si tocas… | Lee |
|---|---|
| `supabase/` (migraciones, funciones, cualquier SQL contra una base) | `supabase/AGENTS.md` |
| iconos en `apps/negocios`, `apps/motorizados` o `packages/ui` | `apps/negocios/AGENTS.md` |
| `e2e/` (Playwright) | `e2e/AGENTS.md` |

## Invariantes (lecciones del v1; no se rompen)

1. **`short_id`**: se valida solo al CREAR, **nunca al rehidratar** desde la base. 8 caracteres, sin I/O/0/1.
2. **`numero_pedido`** atómico desde el backend, **nunca `Date.now()`**.
3. **RLS en TODAS las tablas** con policies explícitas; helpers `SECURITY DEFINER` con `SET search_path = ''`.
4. **Outbox transaccional**: `domain_events` en la MISMA transacción que el agregado.
5. **Tag de push** = `${event_type}-${shortId}`, no solo `shortId`.
6. **Migraciones idempotentes** y versionadas (`DROP IF EXISTS` / `CREATE OR REPLACE`), inmutables una vez aplicadas.
7. **Multi-rol desde el día 1**: `users` + `user_roles` + claims del JWT.
8. **`delivered` es terminal.** Ninguna función puede sacar un pedido de ahí; si alguna vez se abre ese camino, antes
   lee el detalle en `supabase/AGENTS.md`.
9. **Dinero:** `numeric(10,2)`; la deuda de los negocios vive en `business_charges`, y todo ajuste de saldo
   (apelaciones, reembolsos) se escribe ahí y en ninguna otra tabla; `balance_due` es derivado, no se escribe a mano. **Todo cambio que toque dinero** (ledger, apelaciones, reembolsos, comisiones, tarifas) **requiere
   la revisión explícita de Jesús antes de aplicarse.**
10. **Fechas operativas en hora de Lima**: `(now() at time zone 'America/Lima')::date`, nunca `current_date` (es UTC,
    y de 19:00 a medianoche ya es mañana). Parámetros operativos en `app_settings`, no en el código.

## Cómo se trabaja

- **Evidencia, no afirmaciones.** Nada está «listo» sin evidencia objetiva (salida de consola, test, captura, consulta).
  Distingue **medido** de **estimado**. Un gate en verde prueba que compila y que los tests existentes pasan, no que
  el producto funcione.
- **Pasos numerados; si uno falla, para** ahí y repórtalo. No acumules cambios sobre algo roto.
- **Un criterio de aceptación se puede comprobar** con una aserción o una consulta, no es una descripción.
- **Causa raíz, no parche.** Un workaround se marca como tal, con la causa pendiente.
- **Decisiones antes de código.** Una decisión de diseño o de negocio abierta se pregunta; no se asume.
- **«Uno → varios» incluye a los consumidores**: si una relación pasa de uno a varios, el inventario de quién la lee es
  parte del cambio.
- **Un cambio de comportamiento nunca viaja como «corrección de lint»**: se reporta y se commitea por separado.
- **Graphify antes de buscar a lo ancho**: `graphify query "<pregunta>" --budget 1500`, `graphify explain "<símbolo>"`,
  `graphify path "<A>" "<B>"`. Lo que sugiere se confirma en el archivo. Si no hay grafo, `graphify update .` (gratis).
  Runbook: `Docs/operacion/graphify.md`.
- **Una sesión, un worktree** (`git worktree add`). Varias sesiones comparten esta máquina y la base local: la base se
  usa bajo candado (`pnpm db:cycle`, `pnpm db:lock status`).
- **Artefactos de un solo uso** (salidas de modelos, muestras, scripts de depuración) van a `scratch/` o a la carpeta
  temporal del agente, nunca al repo; las utilidades reusables, a `scripts/`. No crees archivos en la raíz si la
  tarea no lo pide. Lo que deja de servir se borra con confirmación: git es el archivo.
- **Commits en español, con tilde**, y `type(scope)` en inglés. La frase cuenta qué cambia para quien lo usa
  (`feat(recojo): en el mostrador no se fía`). En Git Bash un heredoc corrompe los acentos: escribe el mensaje en un
  archivo UTF-8 y `git commit -F archivo`. Nunca `--no-verify` ni `push --force` a `main`.
- **Roles y modelos** (quién decide, quién revisa, qué modelo para qué tarea): estándar §7.
- Responde y documenta en **español peruano**; el dueño es **Jesús**. Código, base y ramas en inglés.

## Convenciones de código

TypeScript **strict** (TS 6) · Zod **v4** · Next **16** + React **19** + Tailwind **v4** · Biome (`pnpm lint`) sin
errores nuevos y sin bajar reglas a `warn` · vertical slicing por feature (una feature no importa de otra; lo común
sube a `lib/` o `packages/`) · sin Server Actions ni BFFs: las apps nativas (Swift + Kotlin) usan la misma API REST
· sin Prisma/Drizzle (RLS) · TDD en `packages/core` · no se extrae con menos de 3 usos ni se abstrae con menos de 2 implementaciones · lógica
de dinero con tests unitarios sobre funciones puras.

## Comandos

```bash
pnpm install · pnpm dev · pnpm lint · pnpm type-check · pnpm test   # mira el pie: «Cached: 0» o no se ejecutó nada
pnpm db:cycle            # base local bajo candado: reset → seed e2e → tests de la API
pnpm db:types            # tipos desde tindivo-prod (después del db push)
pnpm test:e2e            # Playwright
graphify update .        # grafo al día (AST, sin coste)
```
