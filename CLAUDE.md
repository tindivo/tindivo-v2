@AGENTS.md

## Solo para Claude Code

- **Lanza Claude desde la raíz del repo o de su worktree.** Desde una subcarpeta, todo `@import` de fuera de ella
  cuenta como externo: en sesión interactiva pide aprobación una vez; con `claude -p` se ignora **en silencio** y la
  sesión arranca sin este archivo ni el `AGENTS.md` raíz (medido con Claude Code 2.1.296).
- Las reglas locales se cargan solas al leer o editar dentro de su carpeta: cada `CLAUDE.md` anidado importa su
  `AGENTS.md`.
- **Tu memoria local no es documentación**: nadie más la ve. Una regla que encuentres ahí se contrasta con el código y
  con lo aprobado; si es norma, va al canon (con aprobación) y la nota se borra (estándar §6.6).
- **Aplica siempre `.claude/rules/`** (`gemini-worker.md`, `codex-worker.md`): se cargan solas, pero no se aplican
  solas. Antes de cada tarea, decide y di el reparto:
  - **Gemini** (Antigravity, `--mode plan`, lista cerrada de archivos): exploración, barridos y contraste
    documento↔código.
  - **Subagente Sonnet** con encargo cerrado: desarrollo.
  - **Codex**: todo lo que dispare `codex-worker.md` §2 (dinero, seguridad, irreversibilidad, producción).
  - **Tú**: diseño, archivo piloto y auditoría de lo que entregan los demás.

  Si haces tú algo que le toca a Gemini, di por qué. Estándar §7.2, §7.4 y §7.6.
