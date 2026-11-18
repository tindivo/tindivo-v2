@AGENTS.md

## Solo para Claude Code

- **Lanza Claude desde la raíz del repo o de su worktree.** Desde una subcarpeta, todo `@import` de fuera de ella
  cuenta como externo: en sesión interactiva pide aprobación una vez; con `claude -p` se ignora **en silencio** y la
  sesión arranca sin este archivo ni el `AGENTS.md` raíz (medido con Claude Code 2.1.296).
- Las reglas locales se cargan solas al leer o editar dentro de su carpeta: cada `CLAUDE.md` anidado importa su
  `AGENTS.md`.
- **Tu memoria local no es documentación**: nadie más la ve. Una regla que encuentres ahí se contrasta con el código y
  con lo aprobado; si es norma, va al canon (con aprobación) y la nota se borra (estándar §6.6).
- **Cada tarea sigue el ciclo de `Docs/README.md` §7.7** (o su ciclo corto, si califica). Al empezar, aplica la skill
  `using-agent-skills` y di qué skill usas en cada paso.
- **Aplica siempre `.claude/rules/`** (`gemini-worker.md`: encargos y auditoría de Antigravity; `codex-worker.md`: cuándo
  y cómo firma Codex, sus rondas y su contingencia sin cuota). Se cargan solas, pero no se aplican solas. Antes de cada
  tarea, di el reparto según la tabla de §7.6: Haiku lee y da contexto; Antigravity barre; Sonnet programa con encargo
  cerrado; tú diseñas, haces el piloto y escribes encargos; un subagente limpio revisa lo de cualquier Claude; Fable,
  con Argon o Hydrogen como segunda opinión, decide la arquitectura; Codex firma lo que dispare `codex-worker.md` §2.
  Si haces tú algo que le toca a otro, di por qué.
