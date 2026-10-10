# Prueba de carga de AGENTS.md en Codex CLI 0.162 (2026-10-10)

Repo de juguete: AGENTS.md (RAIZ-7341), apps/negocios/AGENTS.md (LOCAL-9182), .agents/AGENTS.md (OCULTA-5527).
Perfil: revisor (read-only, approval never). Prompt: enumerar las claves de las instrucciones cargadas sin leer archivos.

```
codex exec -p revisor -C <repo> -o load-root.txt -               -> RAIZ-7341
codex exec -p revisor -C <repo>/apps/negocios -o load-sub.txt - -> RAIZ-7341 LOCAL-9182
```

Alcance: dos lanzamientos; en ninguno cargó .agents/AGENTS.md automáticamente.
