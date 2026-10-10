# Preguntas para Jesús: la migración móvil

> 2026-10-10 · La carpeta de la migración a apps nativas pasó entera a `Docs/trabajo/movil/` porque no hay una
> aprobación explícita del conjunto como plan. Se borra cuando esté respondida.

## ¿Qué de la migración móvil está aprobado y pasa a `Docs/planes/movil/`?

Tres candidatos:

1. **Las decisiones de la sección 1 de `Docs/trabajo/movil/04-decisiones-abiertas.md`** (D-00 Swift + Kotlin, D-01
   primero el customer, D-30, D-40…): están registradas como tuyas, con fecha. Recomendación: promoverlas.
2. **El contrato REST** (`Docs/trabajo/movil/debate-rest/conclusion.md`: las apps hablan solo con `/api/v1`; Supabase
   queda para el login y el tiempo real). El plan de migraciones aprobado se apoya en él, y el carril móvil de la cola ya
   lo ejecuta, pero no consta tu aprobación explícita. Recomendación: promoverlo.
3. **El plan de ejecución** (`Docs/trabajo/movil/05-arranque/03-plan-de-ejecucion.md`): está escrito como propuesta.

El resto (diagnóstico del sistema, auditoría del backend, requisitos por app, publicación en tiendas) es análisis y se
queda en `trabajo/movil/` mientras dure la migración.
