# Prueba de carga de instrucciones por herramienta (2026-10-10)

## Codex CLI 0.162

Repo de juguete: AGENTS.md (RAIZ-7341), apps/negocios/AGENTS.md (LOCAL-9182), .agents/AGENTS.md (OCULTA-5527).
Perfil: revisor (read-only, approval never). Prompt: enumerar las claves de las instrucciones cargadas sin leer archivos.

```
codex exec -p revisor -C <repo> -o load-root.txt -               -> RAIZ-7341
codex exec -p revisor -C <repo>/apps/negocios -o load-sub.txt - -> RAIZ-7341 LOCAL-9182
```

Alcance: dos lanzamientos; en ninguno cargó .agents/AGENTS.md automáticamente.

## Antigravity CLI (`agy` 1.3.3), mismo repo de juguete + `GEMINI.md` (GEMINI-3141)

```
agy -p "<prompt>" --model gemini-3.8-flash-high --mode plan   (desde la raíz)          -> RAIZ-7341 GEMINI-3141 OCULTA-5527
agy -p "<prompt>" --model gemini-3.8-flash-high --mode plan   (desde apps/negocios)     -> RAIZ-7341 GEMINI-3141 OCULTA-5527 LOCAL-9182
```

Alcance: dos lanzamientos; resultado según la respuesta del modelo (no se inspeccionó su registro). Antigravity sí
carga `.agents/AGENTS.md` (`.agents/` es su convención), además de `AGENTS.md` y `GEMINI.md` de la raíz, y los
locales hasta el directorio de lanzamiento.

## Claude Code 2.1.296, en el worktree real (`docs/agentes-unificados`)

`claude -p "<prompt>" --model haiku` con herramientas desactivadas, preguntando si las instrucciones contienen
`America/Lima` (solo en `AGENTS.md` raíz) e `icons.txt` (solo en `apps/negocios/AGENTS.md`).

```
lanzado en la raíz                                        -> Lima=SÍ (CLAUDE.md → @AGENTS.md)
lanzado en supabase/                                      -> PGRST203 sí (local); Lima sí, pero también está en el local: no distingue
lanzado en apps/negocios/                                 -> Lima=NO icons=SÍ
lanzado en la raíz, leyendo apps/negocios/package.json    -> Lima=SÍ icons=SÍ
señuelo: CLAUDE.md raíz = @SENUELO.md, lanzado en la raíz  -> RAIZ-4401
señuelo, lanzado en apps/negocios                          -> NINGUNA (no carga ni el de la raíz ni el local)
```

`~/.claude.json` → proyecto `…/tindivo-v2`: `hasClaudeMdExternalIncludesApproved: false`. Desde una subcarpeta,
los imports de fuera de ella son «externos»: interactivo, pide aprobación una vez; en `-p`, se ignoran sin aviso.

## Antigravity, en el mismo worktree

```
raíz            -> Lima sí · PGRST203 no · icons.txt no
supabase/       -> Lima sí · PGRST203 sí · icons.txt no
apps/negocios/  -> Lima sí · PGRST203 no · icons.txt sí
```
