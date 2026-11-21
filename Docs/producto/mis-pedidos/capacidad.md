---
id: mis-pedidos
nombre: Mis pedidos
actores: [CUS]
lineas: [pedidos-restaurante, entregas]
depende_de: [seguimiento]
dinero: true
codigo:
  web: [apps/customer/app/pedidos/**, apps/customer/lib/active-orders.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrdersScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrdersViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDates.kt]
  ios: []
  backend: [apps/api/app/api/v1/customer/orders/route.ts, apps/api/lib/mappers/customer-orders.ts]
operaciones: []
reglas: [ACTIVE_ORDER_STATUSES, isActiveOrderStatus, STATUS_TO_TRACKING]
---

# Mis pedidos

> Verificado: 2026-11-18 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el 2026-11-19 (conversación con Claude Code: «apruebo las recomendaciones de los cuatro»)

## Antes de tocar

- Es la pestaña «Pedidos»: el pedido en curso arriba y, debajo, los anteriores con su estado, su total y la ayuda si se canceló.
  Tocar una fila abre el seguimiento de `seguimiento`.
- `dinero: true`: cada fila muestra el total del pedido, que es solo para mostrar (el servidor manda el importe y la app no suma).
  Un importe ilegible falla cerrado: nunca se enseña uno inventado.
- El estado de cada fila sale de la misma proyección que el seguimiento (`STATUS_TO_TRACKING`), no de una tabla propia: así
  `awaiting_payment` y `ready_for_pickup` no muestran texto interno (defecto de la web que no se copia).
- El código del pedido se muestra siempre como «#TDV-» y los 8 caracteres (CUS-ORD-007). El canon y un comentario del contrato aún
  usan el prefijo antiguo y se corrigen aparte.
- «Volver a pedir» repone la bolsa: lo define `bolsa` (CUS-CRT-012). Esta capacidad solo pone el botón.
- La pregunta de calificar al entregar es de `resenas`; la pastilla y el punto del pedido en curso en el Inicio, de `catalogo`.
- Android comparte `feature/orders` con `seguimiento`, `pagos` y `soporte`: esta capacidad solo es dueña de la lista.
- Las entregas (Tindivo Entregas) hoy viven en una lista aparte; el tablero las junta con filtros (CUS-ORD-008).
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-ORD-001 | La app debe listar el historial del cliente, el más reciente primero, con negocio, resumen de productos, código, fecha relativa, total y estado; sin sesión lleva a entrar. | `Docs/trabajo/app-cliente/requisitos/ORD.md` · `listCustomerOrders` | |
| CUS-ORD-002 | La app debe mostrar el estado de cada pedido con una etiqueta corta que sale de la misma proyección que el seguimiento. | `ORD.md` · `packages/contracts/src/order-status.ts` (`STATUS_TO_TRACKING`) | |
| CUS-ORD-003 | La app debe ofrecer, según el pedido, «Ver seguimiento» si está activo, «Ver caso de pago» si se canceló por `proof_rejected_final`, calificar y «Volver a pedir». | `ORD.md` | |
| CUS-ORD-004 | La app debe ofrecer ayuda por WhatsApp en un pedido cancelado, con un mensaje que lleve el código del pedido. | `ORD.md` · Decisión de Jesús, 2026-11-17 | |
| CUS-ORD-005 | La app debe mantener el contador de pedidos activos con una sola consulta compartida, y descartar la respuesta vieja si llega una nueva. | `ORD.md` · `apps/customer/lib/active-orders.ts` · `packages/contracts/src/enums.ts` (`ACTIVE_ORDER_STATUSES`) | |
| CUS-ORD-006 | El servidor debe paginar el historial por cursor, y cada app debe proyectar el estado con el vector compartido de `packages/contracts/fixtures/vectores/`. | `ORD.md` · Decisión de Jesús, 2026-11-19 | |
| CUS-ORD-007 | La app debe mostrar el código del pedido como «#TDV-» seguido de los 8 caracteres, en el seguimiento, en «Mis pedidos», en los mensajes de WhatsApp y en el soporte. | Decisión de Jesús, 2026-11-17 (decisión 15) | |
| CUS-ORD-008 | La app debe permitir filtrar la lista con «Todos», «Restaurantes» y «Entregas», sin repetir la consulta al volver a «Todos». | Canvas v35, tablero `Pedidos` (requisito del tablero, numerado con la aprobación de Jesús del 2026-11-19) | |
| CUS-ORD-009 | La app debe mostrar el pedido en curso arriba, en una tarjeta con una sola acción («Ver seguimiento»), y los anteriores debajo, sin botones salvo «Volver a pedir» en el último entregado. | Canvas v35, tablero `Pedidos` (requisito del tablero, numerado con la aprobación de Jesús del 2026-11-19) | |
| CUS-ORD-010 | La app debe abrir, al tocar un pedido anterior, una hoja con sus productos, el motivo si se canceló y «Calificar» si aún no se calificó. | Canvas v35, tablero `Pedidos` (requisito del tablero, numerado con la aprobación de Jesús del 2026-11-19) | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-ORD-01 | Dado cada estado del vector compartido de proyección (incluidos `awaiting_payment` y `ready_for_pickup`), entonces la fila muestra la etiqueta del paso que dice el vector y nunca el texto interno del estado. | CUS-ORD-002, CUS-ORD-006 |
| CA-ORD-02 | Dado más pedidos que una página, cuando se llega al final, entonces la app pide la página siguiente con el cursor del servidor; si esa página falla, conserva la lista y avisa del error sin perder lo cargado. | CUS-ORD-001, CUS-ORD-006 |
| CA-ORD-03 | Dado un importe que no tiene la forma del contrato, entonces la lista entera falla con un error genérico y no se muestra un total inventado. | CUS-ORD-001 |
| CA-ORD-04 | Dado un pedido cancelado, entonces la fila ofrece ayuda por WhatsApp con el mensaje que lleva «#TDV-» y el código; sin número de soporte, no se muestra el enlace. | CUS-ORD-004, CUS-ORD-007 |
| CA-ORD-05 | Dado un pedido cancelado por `proof_rejected_final`, entonces la fila ofrece «Ver caso de pago» y no ofrece «Volver a pedir». | CUS-ORD-003 |
| CA-ORD-06 | Dado un pedido en camino y varios entregados, entonces la tarjeta en curso aparece sobre «Anteriores» con «Ver seguimiento», y las filas de «Anteriores» no llevan botones salvo «Volver a pedir» en el último entregado. | CUS-ORD-009, CUS-ORD-003 |
| CA-ORD-07 | Dado la lista «Todos» con pedidos y entregas, cuando se toca «Entregas», entonces solo se ven las entregas; volver a «Todos» no repite la petición. | CUS-ORD-008 |
| CA-ORD-08 | Dado un pedido en curso que pasa a `delivered`, entonces sale de «En curso» y aparece arriba de «Anteriores». | CUS-ORD-009 |
| CA-ORD-09 | Dado la sesión cerrada o vencida, cuando se abre la lista, entonces la app sale de la pantalla y no muestra pedidos de la cuenta anterior. | CUS-ORD-001 |
| CA-ORD-10 | Dado el código «K7M3PQ2A», entonces el seguimiento, la lista y los mensajes de WhatsApp lo muestran como «#TDV-K7M3PQ2A». | CUS-ORD-007 |

## Reglas

- Pedido vivo, para el contador y para «En curso»: `ACTIVE_ORDER_STATUSES` e `isActiveOrderStatus`.
- Etiqueta de estado de cada fila: `STATUS_TO_TRACKING`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 2 | CUS-ORD-003 | La fila ofrece «Ver caso de pago» y «Volver a pedir»; «Calificar» no está en la lista de Android. | `feature/orders/OrdersScreen.kt` |
| 3 | CUS-ORD-006 | El servidor manda `status` y `cancelReason` en crudo y cada app proyecta: el vector compartido las mantiene iguales. | `packages/contracts/fixtures/vectores/` |
| 4 | CUS-ORD-005, CUS-ORD-008, CUS-ORD-009, CUS-ORD-010 | Android no tiene contador de activos, filtros, tarjeta en curso ni hoja de detalle; la lista es una sola. | `feature/orders/OrdersScreen.kt` |
