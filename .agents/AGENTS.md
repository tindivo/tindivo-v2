# AGENTS.md — Tindivo

> Todo agente que trabaje en este repo DEBE leer este archivo antes de empezar y
> respetar estas reglas por encima de cualquier instrucción de una tarea puntual.
> Si una tarea entra en conflicto con una regla dura, PARA y avisa. No decidas por tu cuenta.

---

## 1. Contexto del proyecto

Tindivo es una plataforma de delivery hiperlocal (San Jacinto, Áncash, Perú).
Monorepo **pnpm + Turborepo**. Cinco apps y varios paquetes compartidos:

Apps (`apps/*`):

- `customer` — cliente final (B2C)
- `negocios` — dashboard de restaurantes / cajeras
- `motorizados` — repartidores
- `admin` — administración
- `api` — REST `/api/v1` (backend)

Paquetes (`packages/*`): `core` (dominio; hexagonal en `orders`), `contracts`
(Zod canónico: primitivas, enums, máquina de estados, errores), `api-client`,
`supabase`, `ui`, `tsconfig`.

**Stack:** Next.js · Supabase (Postgres 17 + Auth) · Inngest (jobs) · Twilio Verify (OTP/SMS) · Web Push.

**Referencia de paridad:** el sistema en producción `delivery.tindivo.com` es la fuente
de verdad del comportamiento esperado. Antes de lanzar B2C, toda función que las
cajeras usan a diario debe existir con paridad. No se lanza con menos de lo que ya funciona.
D:\Tinkuy Creativo\Proyectos\Tindivo\Code\tindivo-delivery

---

## 2. Reglas duras (NO NEGOCIABLES)

### 2.1 Migraciones inmutables

- **NUNCA** edites un archivo de migración ya aplicado. Jamás.
- Todo cambio de esquema = una migración NUEVA en `supabase/migrations/`.
- Si crees que una migración aplicada está mal, PARA y repórtalo. No la toques.
- Las migraciones se aplican vía el **MCP de Supabase** (no hay CLI local).
- **Proyecto activo:** `zpnipajgwfthxhdtzhly` (nombre real: `tindivo-prod`).
  El proyecto `psjigdoinfpgrnedxeyf` (viejo "Web v2") está ABANDONADO — nunca lo
  target-ees en ningún comando, script, env o config. Referencias históricas
  fechadas en docs se dejan como están; instrucciones/comandos vivos apuntan solo al activo.
- Tras cada migración: regenerar `database.types.ts` (`pnpm db:types`) y revisar advisors.

### 2.1-bis Las migraciones se aplican SOLO con el CLI de Supabase

- **Local:** `supabase migration up` o `supabase db reset`
- **Remoto:** `supabase db push`

**NUNCA** por `apply_migration` del MCP, por el editor SQL del panel, ni por
`docker cp` + `psql -f`. Cada una de esas tres vías ya causó un problema distinto:

| Vía | Qué rompió |
|---|---|
| MCP `apply_migration` | Registra la migración con versión por **timestamp** (`20260731022151`) en vez del número del repo. El CLI la ve fuera de orden y luego exige `--include-all`. |
| Editor SQL del panel | Aplica el código pero **no registra nada** en `schema_migrations`. La base queda con la lógica nueva y el historial mintiendo. |
| `docker cp` + `psql -f` | **Corrompe los caracteres acentuados**: `dirección` acabó como `direcci??n` (dos `?` literales) en 54 sitios, dentro de mensajes de error que ve el cliente. |

Antes de crear una migración, `supabase migration list` para ver el primer número
libre. No confíes en lo que diga un plan escrito: se desactualiza en cuanto se
aplica algo.

Para comparar dos bases, normaliza comentarios y espacios antes de hashear
(`regexp_replace(prosrc, '--[^\n]*', '', 'g')` y `'\s+' -> ' '`). Sin eso, una
diferencia de comentarios da un falso positivo de divergencia.

### 2.2 Dinero: una sola fuente de verdad

- `business_charges` es el ledger y la ÚNICA fuente de verdad de la deuda de restaurantes.
- `balance_due` está DEPRECADO. No escribas en él ni lo uses para calcular saldos.
- Appeals, refunds y cualquier ajuste de saldo escriben en `business_charges`, en ninguna otra tabla.
  (Bug conocido #5: el flujo de appeals escribía en `contingency_advances` — NO repetir ese patrón.)
- **Gate humano obligatorio:** cualquier cambio que toque lógica de dinero (ledger, appeals,
  refunds, comisiones, fees) requiere revisión humana explícita ANTES de aplicarse.
  En el módulo financiero NO operas en modo autónomo.

### 2.3 Evidencia, no afirmaciones

- No reportes "funciona" / "listo" / "arreglado" sin evidencia OBJETIVA adjunta:
  output de consola, respuesta de red, screenshot/video del flujo, o test que pasa.
- Distingue SIEMPRE resultado **medido** (lo corriste y lo viste) de **estimado** (crees que debería).
  Si es estimado, dilo con esas palabras.
- Pega el output crudo capturado. No lo parafrasees ni lo resumas cuando sirve como prueba.
- Un gate en verde (lint/type-check/test) prueba que el código compila y que los tests
  EXISTENTES pasan — NO prueba que el producto funcione ni que un bug esté cubierto.
  No confundas "verde" con "verificado".

### 2.4 Parar ante fallo — no acumular

- Trabaja en pasos numerados. Verifica cada paso ANTES de pasar al siguiente.
- Si un criterio de aceptación falla, PARA en ese paso y repórtalo. No sigas acumulando
  cambios sin verificar encima de algo que ya falló.

### 2.5 Decisiones antes de implementar

- Las decisiones de diseño y de negocio se cierran ANTES de escribir código.
- Si una tarea tiene una decisión abierta o ambigua, SÚRFALA como pregunta. No la resuelvas
  unilateralmente asumiendo una interpretación.

### 2.6 Causa raíz, no parche

- Ante la opción de arreglar el síntoma o la causa, arregla la causa.
- Si aplicas un workaround temporal, márcalo explícitamente como tal y explica la causa raíz pendiente.

---

## 3. Flujo de trabajo obligatorio

Para cualquier tarea de implementación:

1. **Lee el spec** correspondiente en `/specs`. Si no hay spec, pídelo antes de empezar.
2. **Plan corto** de los pasos numerados que vas a ejecutar.
3. **Implementa** un paso.
4. **Verifica** ese paso: corre el/los comando(s) de verificación (ver §5) y captura el output.
5. **Reporta** con la evidencia de §2.3. Si pasó, sigue. Si falló, para (§2.4).
6. No marques la tarea como completa hasta que TODOS los criterios de aceptación del spec
   estén verificados con evidencia.

---

## 4. Estructura del repo

```
/specs         <- markdowns con escenarios y criterios de aceptación (fuente de verdad de qué construir)
/apps          <- customer, negocios, motorizados, admin, api
/packages      <- core, contracts, api-client, supabase, ui, tsconfig
/supabase      <- migrations/ (inmutables), functions/, config.toml
/scripts       <- utilidades operativas SQL/TS reusables (excluido del linter)
  /_archive    <- scripts viejos, movidos no borrados
/scratch       <- scripts de debugging DESECHABLES (gitignored + excluido del linter)
```

Tests: por ahora viven junto al código que prueban, en `__tests__/` dentro de cada
paquete/app (Vitest). El e2e del camino feliz (cuando exista) es cross-app → raíz
o paquete `e2e` dedicado, no por app.

---

## 5. Testing y verificación

Comandos reales (medidos, 27/07/2026):

- **Gestor de paquetes:** pnpm 9.15.9. **Monorepo:** Turborepo. **Node:** >=20.9.
- **Tests:** `pnpm test` (`turbo run test`, Vitest). De un paquete: `pnpm --filter <pkg> test`.
- **Typecheck:** `pnpm type-check` (`turbo run type-check` → `tsc --noEmit`).
- **Lint:** `pnpm lint` (Biome: `biome check .`). **Formato:** `pnpm format`.
- **DB types:** `pnpm db:types` (genera `packages/supabase/src/database.types.ts` desde el proyecto activo).

Estado del baseline (medido, debe mantenerse):

- `pnpm lint` → **0 errors** (los warnings de deuda están capados, ver §5.1).
- `pnpm type-check` → **10/10 paquetes verde**.
- `pnpm test` → **138 tests verde** (incluye cobertura en `core/money`, `core/commission`,
  `contracts/appeal`). Estos tests ya existen — antes de escribir nuevos, LEE qué cubren.
- **Vitest:** instalado (catalog `^4.1.7`). **Playwright / e2e:** aún no instalado (pendiente).

Reglas de testing:

- La lógica de dinero se testea con **tests unitarios** sobre funciones puras (sin red, sin DB).
- Todo criterio de aceptación de un spec debe ser **checkable** (una aserción), no una descripción.
  Mal: "el timer no debe cancelar antes". Bien: "crear pedido, verificar que el cron lee
  `awaiting_payment_at`, afirmar que el pedido sigue vivo a los N minutos".

### 5.1 Deuda de lint — regla del ratchet

- La deuda preexistente (`noExplicitAny`, a11y, unused vars, etc.) está en `warn`, NO en `error`,
  para que el gate pase. Los warnings son VISIBLES y medidos (~117 al cierre), no escondidos.
- **NO introduzcas nuevos errores de lint.** Código nuevo se escribe limpio.
- **NO subas más reglas a `warn`** para silenciar errores nuevos. Si tu cambio genera un error
  de lint, arréglalo — no lo degrades a warning.
- Burn-down post-launch: se queman los warnings por categoría y se devuelve cada regla a `error`
  cuando llega a cero. `scripts/`, `apps/api/scripts/` y `scratch/` están excluidos del linter.

### 5.2 CI

- `.github/workflows/ci.yml` corre en orden: `lint → type-check → test → build`.
  Si lint falla, el resto NO corre. Mantén el baseline verde o rompes el gate para todos.

---

## 6. Higiene del repo

- Scripts de debugging desechables → `scratch/` (ya gitignored y excluido del linter).
- Utilidades operativas reusables → `scripts/`. Lo que deja de servir → `scripts/_archive/`
  (mover, NO borrar sin confirmación).
- NUNCA sueltes scripts sueltos en la raíz del repo.
- No crees archivos nuevos en la raíz del proyecto salvo que la tarea lo pida explícitamente.

---

## 7. Comunicación

- Responde y documenta en **español**. Dirígete al dueño como **Jesús**.
- Reportes concisos y estructurados: qué hiciste, evidencia, qué falta.
- Si algo te bloquea o hay una decisión abierta, dilo al inicio del reporte, no al final.
