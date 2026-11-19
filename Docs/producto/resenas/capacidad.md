---
id: resenas
nombre: Reseñas
actores: [CUS]
lineas: [pedidos-restaurante]
depende_de: []
dinero: false
codigo:
  web: [apps/customer/features/reviews/**]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/reviews/ReviewModels.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/reviews/ReviewViewModel.kt]
  ios: []
  backend: [apps/api/app/api/v1/customer/reviews/**, packages/core/src/review/eligibility.ts]
operaciones: [getCustomerPendingReview, createCustomerReview, dismissCustomerReview]
reglas: [app_settings:reviews]
---

# Reseñas

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — pendiente de su visto bueno

## Antes de tocar

- Es la pregunta «¿cómo estuvo tu pedido?» tras la entrega: una nota de 1 a 5 estrellas, etiquetas y un comentario opcional. **Nada es público.**
- El negocio ve la nota y las etiquetas, **nunca el texto**: el comentario lo lee solo el equipo de Tindivo (permiso por columna en la base). Ninguna app lo muestra al negocio.
- La pregunta no sale al entregar sino **en el siguiente contacto**, y nunca junto al banner de un pedido activo. Un solo pedido pendiente a la vez: el último entregado, sin reseña ni descarte y dentro de la ventana.
- Los parámetros (ventana de días, etiquetas, largo máximo del comentario) viven en `app_settings:reviews`; la app no los escribe. Android copia hoy el máximo del comentario (defecto 1).
- Las reglas de quién puede reseñar y cuándo las decide el servidor (`getCustomerPendingReview`, `createCustomerReview`, `dismissCustomerReview`); la app solo muestra lo que él responde.
- **Al borrar la cuenta se conservan la nota y las etiquetas, sin autor y sin comentario** (opción C, aprobada por Jesús el 2026-11-19 en el PR #201). Lo hace la base (migración de retención); esta capacidad solo debe decirlo con claridad en la app.
- `dinero: false`. Lo que toque retención de datos pasa por Jesús y por Codex.
- Trampa conocida: «Ahora no» saca al pedido de los pendientes; ver la decisión abierta del PR sobre cómo vuelve a ofrecerse «Calificar».
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-REV-001 | La app debe preguntar por la reseña de un pedido entregado en el siguiente contacto, no al entregar: al abrir el inicio con sesión, al salir del seguimiento y en el historial; nunca junto al banner de un pedido activo. | `DECISIONS.md §28` · `apps/customer/features/reviews/lib/pending.ts` | |
| CUS-REV-002 | La app debe permitir puntuar de 1 a 5 con etiquetas y un comentario opcional; el negocio ve la nota y las etiquetas, no el texto. | `apps/customer/features/reviews/components/review-sheet.tsx` · `app_settings:reviews` | |
| CUS-REV-003 | La app debe permitir descartar la pregunta con «Ahora no» sin cerrar la ventana; la hoja se cierra al instante, antes de esperar a la base. | `apps/customer/features/reviews/hooks/use-pending-review.ts` | |
| CUS-REV-004 | Cuando el cliente borra su cuenta, la app debe decirle que sus reseñas se conservan sin su nombre y sin su comentario, y que la nota y las etiquetas se quedan. | Decisión de Jesús, 2026-11-19 (opción C, PR #201); reemplaza el comentario conservado de CUS-ACC-008 | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-REV-01 | Dado un pedido entregado dentro de la ventana, sin reseña ni descarte, cuando el cliente abre el inicio con sesión, entonces sale la pregunta una sola vez; no sale al entregar ni mientras hay un pedido activo. | CUS-REV-001 |
| CA-REV-02 | Dado que el cliente toca una estrella de la pregunta, entonces se abre el detalle con esa nota puesta; la nota se puede cambiar y se envía con las etiquetas marcadas. | CUS-REV-002 |
| CA-REV-03 | Dado un comentario más largo que el máximo de `app_settings:reviews`, entonces la app lo recorta a ese máximo y un comentario en blanco no se envía. | CUS-REV-002 |
| CA-REV-04 | Dado una reseña enviada, entonces el negocio la ve con nota y etiquetas y sin el texto, y ningún cliente ni visitante la ve. | CUS-REV-002 |
| CA-REV-05 | Dado un envío en curso, entonces un segundo toque en «Enviar» no manda otra reseña y no se puede cerrar ni cambiar lo escrito. | CUS-REV-002 |
| CA-REV-06 | Dado la pregunta abierta, cuando se toca «Ahora no», entonces la hoja se cierra al instante, el descarte sale detrás y un fallo del descarte no se muestra. | CUS-REV-003 |
| CA-REV-07 | Dado una cuenta con reseñas, cuando se borra, entonces la nota y las etiquetas quedan sin autor, el comentario desaparece, y la pantalla de borrado lo dice así antes de confirmar. | CUS-REV-004 |

## Estado en Android hoy

Contrastado el 2026-11-19 con develop@25a6d537. Rutas bajo `apps/android/customer/src/main/kotlin/com/tindivo/customer/`. Es una foto: el estado vivo lo calcula `pnpm spec:traza`. La cita es por archivo y símbolo, no por línea (lo exige el validador).

| Requisito | Estado | Evidencia |
|---|---|---|
| CUS-REV-001 | FALTA | Sale al abrir el inicio (`navigation/AppNavHost.kt`, `rememberReviewController(autoPrompt = true)`) y el detalle ofrece «Calificar» si ese pedido es el pendiente (`OrderDetailWithReview`). No hay pregunta al salir del seguimiento ni en el historial: `feature/orders/OrdersScreen.kt` no usa `feature/reviews/`. La regla «nunca junto al banner de un pedido activo» no se comprueba. |
| CUS-REV-002 | HECHO | `feature/reviews/ReviewSheets.kt` (estrellas, etiquetas, comentario), `feature/reviews/ReviewViewModel.kt` (`submit`, recorte del comentario); `res/values/strings.xml` (`review_privacy`: «Tu nota la ve [negocio]. Lo que escribas lo lee solo el equipo de Tindivo.»). Pruebas en `ReviewViewModelTest`. Defecto 1. |
| CUS-REV-003 | HECHO | `feature/reviews/ReviewViewModel.kt` (`dismiss`: la hoja se va al instante y el aviso sale detrás); prueba «Ahora no cierra al instante…» en `ReviewViewModelTest`. Defecto 2. |
| CUS-REV-004 | FALTA | La base ya lo hace (migración de retención: `supabase/migrations/0284_los_datos_tienen_plazo_de_conservacion.sql`, borra el comentario y el autor). El texto de la app (`res/values/strings.xml`, `delete_account_kept_body`) dice solo «Las reseñas se quedan sin tu nombre»: no dice que el comentario se borra ni que la nota y las etiquetas se quedan. |

Resumen: HECHO 2 · FALTA 2 · DIFIERE 0.

## Reglas

- Ventana, etiquetas y largo máximo del comentario: `app_settings:reviews`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-REV-002 | Android copia el máximo del comentario en una constante (`MAX_REVIEW_COMMENT`); el servidor lo toma de `app_settings:reviews` y, si cambia, la app y el servidor dejan de coincidir. | `feature/reviews/ReviewModels.kt` |
| 2 | CUS-REV-003 | Tras «Ahora no» el pedido sale de los pendientes del servidor: el detalle solo ofrece «Calificar» mientras la app lo recuerda en esa sesión y no en la siguiente. | `feature/reviews/ReviewViewModel.kt` · `supabase/migrations/0280_las_resenas_se_piden_por_la_api.sql` |
| 3 | CUS-REV-004 | CUS-ACC-008 (fuente de trabajo) todavía dice que se conserva el comentario; manda la decisión del 2026-11-19. | `Docs/trabajo/app-cliente/requisitos/ACC.md` |
