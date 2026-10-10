# Encargo a Codex: auditoría del AGENTS.md unificado (paso 4 del estándar)

Lees el worktree `tindivo-v2-docs`, rama `docs/agentes-unificados`, commit `c315e81`. Declara rama y commit al empezar.
Jesús no está: tu veredicto lo lee él al volver. Encargo cerrado para ahorrar tu cuota.

## Qué cambió

Antes había tres archivos de instrucciones que no coincidían: `CLAUDE.md` y `AGENTS.md` (copias a mano) y
`.agents/AGENTS.md` (259 líneas que solo cargaba Antigravity). Ahora: `AGENTS.md` raíz como única fuente, `CLAUDE.md`
que lo importa, y reglas locales en `supabase/AGENTS.md`, `apps/negocios/AGENTS.md` y `e2e/AGENTS.md`. La guía de
graphify pasó a `Docs/operacion/graphify.md`. Las versiones anteriores: `git show 7e03038:AGENTS.md`,
`git show 7e03038:CLAUDE.md`, `git show 7e03038:.agents/AGENTS.md`.

## Ataca solo esto

1. **¿Se perdió o se deformó alguna regla vigente** al pasar de los tres archivos viejos a los nuevos? Lista cada una
   con dónde estaba y por qué crees que sigue vigente. Lo eliminado a propósito por envejecido: los «138 tests» y el
   baseline, la paridad con `delivery.tindivo.com`, `/specs`, `scripts/_archive`, las reglas de proceso de «Mauri», el
   orden del CI (está en `ci.yml`).
2. **¿Alguna afirmación de los archivos nuevos es falsa contra el repo?** (comandos, rutas, nombres de funciones,
   scripts de `package.json`).
3. **Tú, lanzado desde la raíz, no cargas los locales.** ¿El mapa de «Reglas locales» del `AGENTS.md` raíz basta para
   que los leas antes de tocar esas carpetas? ¿Falta alguna carpeta que debería tener reglas locales?
4. ¿Algo del `AGENTS.md` raíz sobra (no haría equivocarse a nadie si se borrara)?

Respuesta corta, en español, con texto exacto de cada cambio. Veredicto: firmo / firmo con cambios / no firmo.
