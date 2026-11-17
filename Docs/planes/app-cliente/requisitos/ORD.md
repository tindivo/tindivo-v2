# CUS-ORD · Mis pedidos

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `orders` · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-ORD-001 | La app debe listar el historial del cliente con negocio, resumen de ítems, código, fecha relativa, total y estado. | **Últimos 40**, sin paginación; total = importe + envío; fecha relativa («hace 5 min», «ayer», fecha corta). Sin sesión lleva a entrar. | `app/pedidos/page.tsx:76-231` · Android: `feature/orders/OrdersViewModel.kt` (paginado por cursor con «Ver más pedidos») | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-ORD-002 | La app debe mostrar el estado con una etiqueta corta. | ⚠️ `STATUS_LABEL` **no cubre `awaiting_payment` ni `ready_for_pickup`**: el cliente vería el texto interno. Debe salir de la misma proyección que el seguimiento. | `pedidos/page.tsx:39-50` · Android: `feature/orders/OrderMapping.kt:85` (proyección propia (`headlineOf`); `awaiting_payment` y `ready_for_pickup` no se verificaron) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-ORD-003 | La app debe ofrecer, según el pedido, «Ver seguimiento», «Ver caso de pago», calificar y «Volver a pedir». | «Ver seguimiento» si está activo; «Ver caso de pago» si `proof_rejected_final`. | `pedidos/page.tsx:186-209` · Android: `feature/orders/OrdersScreen.kt` («Volver a pedir» y soporte; «Ver caso de pago» no se encontró) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-ORD-004 | La app debe ofrecer ayuda por WhatsApp en un pedido cancelado. | Mensaje con el código. ⚠️ Usa `#TDV-`; la referencia oficial es `#TND-` (`DECISIONS §6`): unificar. | `pedidos/page.tsx:211-221`; `appeal-create-view.tsx:26-28` · Android: `feature/orders/SupportContact.kt:90` (usa `#TDV-`) | ⚠️ | ⬜ | ADAPTAR · M1 |
| CUS-ORD-005 | La app debe mantener el contador de pedidos activos con una sola consulta compartida. | `ACTIVE_ORDER_STATUSES`; se descarta la respuesta vieja si llega una nueva (testigo `ultimaPeticion`). | `lib/active-orders.ts` | 📝 | ⬜ | ADAPTAR · M1 |
| CUS-ORD-006 | El servidor debe paginar el historial y devolver el estado ya proyectado. | Hoy: 40 fijos por PostgREST. | — | — | — | NUEVO · M1 |

## Defectos conocidos

Encontrados al especificar la web (2026-09/10); se corrigen en nativo, no se copian.

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-ORD-002 | El historial (`STATUS_LABEL`) **no traduce** `awaiting_payment` ni `ready_for_pickup`: se ve el estado interno. | `app/pedidos/page.tsx:39-50` |
| 2 | CUS-ORD-004 | Los mensajes de WhatsApp usan `#TDV-…`; la referencia oficial es `#TND-…`. | `pedidos/page.tsx:213`, `appeal-create-view.tsx:27` |

## Notas
- Defecto 2 de la web: sigue vivo en Android (`feature/orders/SupportContact.kt:90` usa `#TDV-`); ver decisión 3 en `decisiones-abiertas.md`.
- Defecto 1: Android usa su propia proyección de estados (`feature/orders/OrderMapping.kt:85`); falta comprobar que cubre `awaiting_payment` y `ready_for_pickup`.
