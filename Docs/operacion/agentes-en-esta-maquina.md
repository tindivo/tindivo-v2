# Cómo se llama a cada agente en esta máquina

> Verificado: 2026-10-15 (Codex) y 2026-10-10 (resto) · entorno: Windows de Jesús, Codex CLI 0.162.0, Antigravity CLI (`agy`) 1.3.3, Claude Code 2.1.296

Quién hace qué y con qué modelo lo fija el estándar (`Docs/README.md` §7). Aquí, solo cómo se
invoca cada uno sin que falle.

## Codex: auditor de solo lectura

> **Modo provisional con riesgo aceptado** (`.claude/rules/codex-worker.md` §13.1 bis), vigente hasta el
> **2026-11-14**. Codex puede leer todo lo que lee Jesús: no es aislamiento. Preflight medido el 2026-10-15 con
> Codex CLI 0.162.0.

La invocación es la de §13.2–§13.4 del protocolo (array `COMMON`), sobre una copia `git archive` fuera del repo, y
después de cada ronda `node scripts/codex-audit-scope-check.mjs <eventos.jsonl> <AUDIT_ROOT>`.

- **`exec --ignore-user-config` no aplica `--profile`.** El perfil `~/.codex/revisor.config.toml` documenta la
  configuración, pero la que manda son los `-c`/`--disable` de `COMMON`. Sin ellos, la sesión trae `spawn_agent`,
  objetivos persistentes, generación de imágenes y el conector `codex_apps` (que incluye desplegar sitios y cambiar
  variables de entorno), y además **no puede leer** (`blocked by policy`).
- **Backend `unelevated` obligatorio.** Con `elevated`, PowerShell no arranca para `CodexSandboxOffline` (error
  `8009001d`) y Codex no lee nada; además, su primer arranque concede lectura a `CodexSandboxUsers` en todo el
  perfil. Si alguna vez se usa, revisar después con `Get-Acl` (respaldo y limpieza del 2026-10-15 en
  `../tindivo-auditorias/acl-respaldo-2026-10-15/`).
- **`agents.enabled=false`** es lo que quita las herramientas de subagentes; `--disable multi_agent` no basta.
- Comprobar las herramientas sin gastar una ronda: una sonda con el mismo `COMMON` que pida listar las herramientas
  disponibles, sobre una carpeta de prueba.
- **No toques `~/.codex/config.toml`**: es la configuración de las sesiones de Jesús.
- Python: en esta máquina es `python` (3.12); `python3` es el acceso directo de la Store. Con `python -I`, las
  variables `PYTHON*` se ignoran: para UTF-8, `python -I -X utf8`.
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
- **En modo `-p` no puede pedir permiso para comandos de terminal:** si intenta uno, lo deniega y termina **sin salida**
  (`jetski: no output produced`). Pídele en el encargo que lea solo con su herramienta de lectura de archivos.
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
