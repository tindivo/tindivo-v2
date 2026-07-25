# Project Behavioral Rules

## Regla Definitiva de Migraciones
El ÚNICO comando permitido para aplicar migraciones es `npx supabase db push`.
Está PROHIBIDO ejecutar archivos de migración con `db query`, `db query --file`, scripts ad-hoc o cualquier otro método que bypasee el historial de `schema_migrations`.
Sin excepciones. Si `npx supabase db push` falla, se reporta el error directamente al usuario. No se busca ningún atajo.
