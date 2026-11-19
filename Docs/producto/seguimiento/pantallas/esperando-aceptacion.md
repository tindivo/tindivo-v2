---
canvas: [Seguimiento-aceptacion]
requisitos: [CUS-TRK-019, CUS-TRK-005, CUS-TRK-006, CUS-TRK-002, CUS-TRK-014, CUS-TRK-023]
operaciones: [getCustomerOrder, cancelOrder, getPublicConfig]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/tracking/components/tracking-countdown.tsx, apps/customer/features/tracking/components/tracking-cancel-row.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderCancelViews.kt]
  ios: []
---

# Esperando que el negocio acepte

| | |
|---|---|
| **Tarea de la persona** | Saber que su pedido llegó al negocio, cuánto tarda en responder y qué puede hacer mientras espera: cancelar o pedir ayuda. |
| **Se llega desde** | El pedido recién creado en el checkout (esta pantalla reemplaza a la de «pedido confirmado») · «Ver pedido» del Inicio · `mis-pedidos/mis-pedidos` · una notificación. |
| **Se sale hacia** | El negocio acepta: `seguimiento/seguimiento`. El plazo vence o el negocio rechaza: el pedido cancelado, con su motivo (CUS-TRK-015). «Ver resumen del pedido»: el detalle. «Cancelar pedido»: confirmación y cancelado. «Ayuda con este pedido»: WhatsApp de soporte (capacidad `soporte`). Volver: el Inicio. |

Es el primer estado del seguimiento: no hay pantalla intermedia entre el checkout y esta. El pago no se muestra aquí; aparece dentro del seguimiento cuando el negocio acepta (capacidad `pagos`).

## Contenido, de arriba abajo

1. Barra superior: volver · «Pedido #TDV-K7M3PQ2A» · «Actualizar estado». El tablero no lleva el prefijo; manda la decisión 15 (CUS-ORD-007).
2. Ilustración del negocio recibiendo el pedido (etiqueta accesible «Ilustración: el negocio recibe tu pedido»).
3. Progreso en cuatro etapas, con la primera activa: «Paso 1 de 4: Recibido, Preparando, En camino, Entregado» (CUS-TRK-002).
4. Estado: «Esperando al negocio» y «Responde en hasta» el plazo de aceptación en minutos, con cuenta atrás (CUS-TRK-005).
5. Resumen corto: nombre del negocio · número de productos y total · «Ver resumen del pedido».
6. Acciones de texto: «Cancelar pedido» y «Ayuda con este pedido», con ícono.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Esperando | Lo anterior, con la cuenta atrás | CUS-TRK-019, CA-TRK-06 |
| Menos de un tercio del plazo | La cuenta atrás en rojo, con tope de 3 minutos | CUS-TRK-005, CA-TRK-05 |
| Plazo vencido sin respuesta | «Confirmando…» hasta que el servidor resuelva; después el pedido se cancela y se explica el motivo | CUS-TRK-005, CUS-TRK-015 |
| Cancelar | «¿Cancelar tu pedido?» · «Sí, cancelar pedido» / «No, mantener pedido», solo mientras el servidor lo permita | CUS-TRK-006, CA-TRK-01 |
| El negocio acepta | Pasa a `seguimiento/seguimiento` y aparece el bloque de pago de `pagos` | CUS-TRK-020, CA-TRK-07 |
| Cliente sin historial (`validando`) | «Te llamaremos para confirmar tu pedido» y, debajo, el número verificado; sin cuenta atrás | CUS-TRK-005 |
| Sin conexión | Se conserva lo último mostrado y se sigue consultando | CUS-TRK-014, CA-TRK-13 |
| Pedido de otra cuenta | «No puedes abrir este pedido» · «Mis pedidos» / «Entrar con otra cuenta» | CUS-TRK-023, CA-TRK-09 |

## Movimiento

La ilustración entra con fundido de 200 ms y el reloj corre en vivo. Con «reducir movimiento», sin animaciones.

## Pendiente

- Desde cuándo corre el plazo de aceptación y qué hace la app para contarlo: `getCustomerOrder` no trae la hora en que el pedido pasó a `pending_acceptance` (decisión para Jesús 3).
- El texto exacto de la línea bajo «Te llamaremos para confirmar tu pedido» es propuesta de la junta del 17-nov, no decisión de Jesús.
