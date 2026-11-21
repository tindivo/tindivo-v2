# CUS-REV · Reseñas

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `reviews` · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-REV-001 | La app debe preguntar por la reseña de un pedido `delivered` **en el siguiente contacto**, no al entregar. | `get_pending_review` (RPC) devuelve el pendiente o `null`; ventana ⚙ `reviews.windowDays` (21). Se consulta al abrir inicio con sesión, al salir del seguimiento y en el historial; nunca junto al banner de un pedido activo. | `features/reviews/lib/pending.ts`; `hooks/use-pending-review.ts`; `DECISIONS.md §28` · Android: `feature/reviews/ReviewViewModel.kt` (consulta de la reseña pendiente; los puntos de consulta no se verificaron) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-REV-002 | La app debe permitir puntuar de 1 a 5 con etiquetas y un comentario opcional. | Etiquetas ⚙ (`todo_bien`, `buen_trato`, `demoro`, `llego_fria`, `falto_algo`); comentario ≤ ⚙ 400; `create_order_review`. **El negocio ve nota y etiquetas, no el texto** (GRANT por columna). Nada es público. | `features/reviews/components/review-sheet.tsx`; `pending.ts:44-53` · Android: `feature/reviews/ReviewSheets.kt` | ✅ | ⬜ | IGUAL · M1 |
| CUS-REV-003 | La app debe permitir descartar la pregunta sin cerrar la ventana. | «Ahora no» inserta en `order_review_dismissals`; se cierra la tarjeta **antes** de esperar a la base. | `pending.ts:61-66`; `use-pending-review.ts:98-111` · Android: `feature/reviews/ReviewViewModel.kt` («Ahora no» (`review_not_now`)) | ✅ | ⬜ | IGUAL · M1 |

## Migrado a `Docs/producto/resenas/` (2026-11-19)

Esta área pasó a la capacidad `Docs/producto/resenas/`; allí manda. Decisión de Jesús del 2026-11-19 (opción C, PR #201): al borrar la cuenta se conservan la nota y las etiquetas, sin autor y sin comentario. Es el requisito CUS-REV-004 y reemplaza el comentario conservado de CUS-ACC-008.
