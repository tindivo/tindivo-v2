# Verificar qué instrucciones carga cada agente

> Verificado: 2026-10-12 · entorno: Windows de Jesús, Claude Code 2.1.296, Antigravity CLI (`agy`) 1.3.3, Codex CLI 0.162 (sin lanzar) · `develop@591ec569`

Procedimiento de `Docs/README.md` §6.1.1. Se ejecuta al adoptarlo y tras cada actualización de Codex, Claude Code o Antigravity. El resultado se anota en §6.1, con la versión de cada herramienta. Cómo se invoca cada una sin que falle: `agentes-en-esta-maquina.md`.

## Pasos

1. **Preparar**: `CANARY_WORKTREE=<ruta> bash scripts/canary.sh place`. Crea un worktree temporal y añade un token aleatorio al final de cada archivo de instrucciones versionado (`AGENTS.md`, `CLAUDE.md` y `GEMINI.md`, en la raíz y en las carpetas locales). Imprime la ruta del worktree; los tokens esperados quedan en `<git-common-dir>/canary/`, fuera del árbol de trabajo. En Windows, pasa `CANARY_WORKTREE` con una ruta de estilo `C:/Users/…`: la predeterminada (`$TMPDIR` o `/tmp`) no la entiende `claude` ni `agy`.

2. **Lanzar cada herramienta** desde ese worktree, como se usa de verdad, desde la raíz y desde `apps/negocios`. Encargo:

   > Sin leer archivos ni ejecutar comandos: copia literalmente todas las líneas que empiezan por «Token de carga:» que estén en tus instrucciones cargadas. Si no hay ninguna, responde NINGUNA.

   Guarda cada respuesta en `<worktree>/.canary/<herramienta>-<directorio>.txt` (`claude-raiz.txt`, `agy-negocios.txt`, `codex-raiz.txt`…). Los comandos:

   - **Claude Code** (desde la raíz del worktree, o de `apps/negocios` para la segunda prueba):
     `claude -p "<encargo>" --model haiku --disallowedTools "Read,Bash,Grep,Glob,Edit,Write"`
     Imprime un aviso sobre PowerShell al prohibir `Bash`: es inofensivo, pero queda en el `.txt`.
   - **Antigravity** (no está en el PATH de Git Bash):
     `/c/Users/Jesus/AppData/Local/agy/bin/agy.exe -p "<encargo>" --model gemini-3.8-flash-high --mode plan`
     No permite prohibir sus herramientas de lectura: anótalo como límite de la prueba.
   - **Codex** (cuota reservada: solo cuando toque probarlo o tras una actualización):
     `codex exec -p revisor -C "<worktree>" -o codex-raiz.txt - < encargo.md` para la raíz; para `apps/negocios`, lanzarlo desde esa carpeta. El perfil `revisor` es de solo lectura y no puede escribir, así que la respuesta la guarda `-o` (`~/.codex/revisor.config.toml`, ver `agentes-en-esta-maquina.md`).

3. **Comparar**: `CANARY_WORKTREE=<ruta> bash scripts/canary.sh check`. Para cada respuesta, lista qué archivos de instrucciones estaban cargados y cuáles no.

4. **Validez**: si una herramienta leyó archivos o ejecutó comandos para responder, su resultado no vale. Claude Code y Codex se limitan por configuración; con `agy`, revisa el registro de la sesión si el resultado sorprende.

5. **Limpiar**: `CANARY_WORKTREE=<ruta> bash scripts/canary.sh clean`.

## Qué se anota en §6.1

Por herramienta: versión, desde qué directorio se lanzó, qué archivos cargó y la fecha. Si el resultado contradice la tabla, se corrige la tabla y se revisan los archivos de instrucciones afectados.

## Hook de graphify

El hook `.githooks/post-commit` se activa una vez por clon con `git config core.hooksPath .githooks`; ver `graphify.md`.
