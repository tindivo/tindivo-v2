# Antigravity (Gemini) barre: resumen (el protocolo completo manda)

Texto completo y normativo: `Docs/operacion/antigravity-worker.md`. **Léelo antes de escribir el primer encargo de la
sesión**: tiene el comando probado y las tres plantillas.

- **Para qué:** leer mucho y resumir (mapa técnico), clonar un patrón desde un archivo piloto que hiciste tú, y corregir
  errores mecánicos de compilación. Nunca lógica de negocio, SQL de dinero ni RLS, y no sustituye a Codex.
- **Comando:** `agy.exe -p "$(cat <encargo>)" --model gemini-3.8-flash-high --mode plan` desde la raíz del worktree
  (`--mode accept-edits` solo para escritura controlada). Nunca `--dangerously-skip-permissions`.
- **Encargo cerrado:** la lista exacta de archivos que puede leer y la prohibición de explorar fuera de ella, sin
  inventar helpers ni truncar código. Usa una de las plantillas 1–3.
- **Archivos efímeros** (`.gemini_task.tmp.md`, `.gemini_output.tmp.md`): en el scratchpad de la sesión, nunca en el repo.
- **Después:** revisa por diff (`git diff`) y corre tú los gates. Si falla una condición puntual, la corriges tú; no le
  repitas el encargo en bucle.
- **Modelos:** para barrer, solo `gemini-3.8-flash-high` (decisión de Jesús, 2026-10-10). Argon e Hydrogen solo dan
  segunda opinión de arquitectura junto a Fable (`CLAUDE.md`).
