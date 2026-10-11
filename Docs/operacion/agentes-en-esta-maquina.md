# Cómo se llama a cada agente en esta máquina

> Verificado: 2026-10-10 · entorno: Windows de Jesús, Codex CLI 0.162, Antigravity CLI (`agy`) 1.3.3, Claude Code 2.1.296

Quién hace qué y con qué modelo lo fija el estándar (`Docs/planes/estandar-docs/estandar.md` §7). Aquí, solo cómo se
invoca cada uno sin que falle.

## Codex: revisor de solo lectura

```bash
codex exec -p revisor -C "<repo o worktree>" --json -o salida.md - < encargo.md
codex exec -p revisor -C "<repo>" --json -o salida2.md resume <thread_id> - < encargo2.md   # segunda ronda
```

- **Perfil `revisor`** (`~/.codex/revisor.config.toml`): `sandbox_mode = "read-only"`, `approval_policy = "never"`,
  `[windows] sandbox = "unelevated"`. Lee el repo por su cuenta (`rg`, `Get-Content`) y **no puede escribir**: la
  respuesta la guarda `-o`. Sin red: los datos de producción se los pasa quien encarga.
- **Sin el perfil, read-only rechaza todo comando** (`blocked by policy`) y Codex responde con opinión genérica sin
  haber leído nada.
- **No toques `~/.codex/config.toml`**: es la configuración de las sesiones de Jesús.
- **El encargo va por stdin** (`-`). Con `resume`, un prompt pasado como argumento ignora el stdin.
- El `thread_id` para `resume` sale del evento `thread.started` de la salida `--json`.
- Modelo y esfuerzo: `-m <modelo>` y `-c model_reasoning_effort=<low|medium|high>`. La configuración no fija modelo.
- `Not logged in` → todo da 401: Jesús hace `codex login`.
- `turn.failed` por «workspace routing discovery timed out» es un corte de red pasajero: reintentar.
- **Carga de instrucciones:** los `AGENTS.md` desde la raíz hasta el directorio de lanzamiento. Con `-C <repo>`, solo
  el raíz.
- Acierta al auditar, pero puede «corregir» una cifra que no vio en crudo: verifícala antes de aceptarla.

## Antigravity (`agy`): ejecutor rápido

```bash
/c/Users/Jesus/AppData/Local/agy/bin/agy.exe -p "<encargo>" --model gemini-3.8-flash-high --mode plan
```

- **No está en el PATH de Git Bash**: se llama por su ruta. En PowerShell, recargando el PATH del usuario, sí aparece.
- **Modelo: solo `gemini-3.8-flash-high`** (decisión de Jesús, 2026-10-10; los demás Gemini están «Leaving Soon»).
  `agy models` lista los disponibles; también ofrece Claude Opus/Sonnet 5.5 sobre la cuota de Google.
- `--mode plan` para que no edite. **Nunca `--dangerously-skip-permissions`.**
- Otras opciones útiles: `--output-format json`, `--json-schema <archivo>`, `--effort`, `--print-timeout`.
- El prompt va como argumento (unos 6 KB de encargo + lista de rutas funcionaron). Varios lotes en paralelo, sí:
  4 a la vez, ~16 s por archivo leído.
- **Carga de instrucciones:** `AGENTS.md` y `GEMINI.md` de la raíz y los `AGENTS.md` hasta el directorio de
  lanzamiento.
- Gemini CLI quedó desinstalado: Google rechaza su login para cuentas individuales y remite a Antigravity.

## Claude Code: subagentes y modo no interactivo

- **Lanzar siempre desde la raíz del repo o del worktree.** Desde una subcarpeta, los `@import` de fuera de ella son
  externos: interactivo, pide aprobarlos; con `claude -p`, se ignoran en silencio y la sesión arranca sin reglas.
- Para probar qué instrucciones carga: `claude -p "<pregunta>" --model haiku --disallowedTools "Read,Bash,Grep,Glob,Edit,Write"`.

## Encargo y auditoría

Todo encargo a otro agente lleva objetivo, entradas exactas, qué no tocar, formato de salida cerrado, criterio de
aceptación verificable y qué hacer ante la duda (estándar §7.2). Lo que entrega Antigravity se audita según su uso:
completo si decide algo, por cobertura si es un inventario (§7.3).
