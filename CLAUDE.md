@AGENTS.md

## Solo para Claude Code

- **Lanza Claude desde la raíz del repo o de su worktree.** Desde una subcarpeta, todo `@import` de fuera de ella
  cuenta como externo: en sesión interactiva pide aprobación una vez; con `claude -p` se ignora **en silencio** y la
  sesión arranca sin este archivo ni el `AGENTS.md` raíz (medido con Claude Code 2.1.296).
- Las reglas locales se cargan solas al leer o editar dentro de su carpeta: cada `CLAUDE.md` anidado importa su
  `AGENTS.md`.
- **Tu memoria local no es documentación**: nadie más la ve. Una regla que encuentres ahí se contrasta con el código y
  con lo aprobado; si es norma, va al canon (con aprobación) y la nota se borra (estándar §6.6).
- Para tareas de volumen o acotadas, delega en un subagente con modelo más barato o en Antigravity, con un encargo
  cerrado (estándar §7.2 y §7.6). Codex solo para decisiones de impacto (§7.4).
