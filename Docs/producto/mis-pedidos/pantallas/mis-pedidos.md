---
canvas: [Pedidos, Pedidos-vacio, Estados]
requisitos: [CUS-ORD-001, CUS-ORD-002, CUS-ORD-003, CUS-ORD-004, CUS-ORD-005, CUS-ORD-006, CUS-ORD-007, CUS-ORD-008, CUS-ORD-009, CUS-ORD-010]
operaciones: [listCustomerOrders, getCustomerOrder, listCustomerCourierOrders, getCustomerReorder]
textos: []
tokens: []
codigo:
  web: [apps/customer/app/pedidos/page.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrdersScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrdersViewModel.kt]
  ios: []
---

# Mis pedidos

| | |
|---|---|
| **Tarea de la persona** | Ver lo que tiene en curso, revisar los anteriores y volver a pedir. |
| **Se llega desde** | La barra inferior, «Pedidos» · la pastilla del pedido en curso del Inicio · el aviso «No sabemos si tu pedido anterior llegó» del checkout. |
| **Se sale hacia** | La tarjeta en curso o «Ver seguimiento»: `seguimiento/seguimiento`. Una fila anterior: su hoja de detalle. «Volver a pedir»: la carta del negocio o la bolsa repuesta (capacidad `bolsa`). El vacío «Hacer un pedido»: el Inicio. Una entrega: su seguimiento de Entregas. |

Es la pestaña «Pedidos» de la barra inferior (la barra la define `catalogo`).

## Contenido, de arriba abajo

1. Título: «Mis pedidos», en la barra y como título de página.
2. Filtros en chips: «Todos», «Restaurantes» y «Entregas». Cambiar de filtro hace un fundido cruzado de la lista (CUS-ORD-008).
3. Pedido en curso, en una tarjeta compacta con una sola acción: negocio · «Hoy 7:02 p. m.» y el total · estado «En camino» · «llega en [rango]» · «Ver seguimiento» (CUS-ORD-009).
4. «Anteriores»: una fila por pedido, sin botones salvo uno. Pedido de restaurante: negocio, fecha, total y estado; «Volver a pedir» solo en el último entregado. Entrega: «Entrega · Mercado», fecha, tarifa y estado. Cancelado: «Cancelado» y, al abrirlo, «¿Problema con este pedido?» (CUS-ORD-003, CUS-ORD-004).
5. Hoja de detalle, al tocar una fila: productos, el motivo si se canceló y «Calificar» si aún no se calificó (CUS-ORD-010).
6. En todos los lugares el código se muestra como «#TDV-» y los 8 caracteres (CUS-ORD-007).

Variante vacía (la del tablero `Pedidos-vacio`, aprobada el 2026-11-19): ilustración, «Sin pedidos todavía» y el botón «Hacer un pedido».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | «Cargando» con esqueletos de tarjetas | CUS-ORD-001 |
| Vacío | «Sin pedidos todavía» · «Hacer un pedido» | CUS-ORD-001 |
| Error | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» o «Algo salió mal. Inténtalo de nuevo.» y «Reintentar» | CUS-ORD-001 |
| Paginando | Indicador al final y «Ver más pedidos» | CUS-ORD-006, CA-ORD-02 |
| Falla la página siguiente | Se conserva la lista y aparece «Algo salió mal. Inténtalo de nuevo.» | CUS-ORD-006, CA-ORD-02 |
| Sin sesión | Se sale de la pantalla; la app cierra la sesión local ante un 401 | CA-ORD-09 |
| En curso | Tarjeta arriba con el estado y «Ver seguimiento»; el ícono y el punto laten | CUS-ORD-009, CA-ORD-06 |
| Entregado | Fila con «Entregado»; «Volver a pedir» en el último | CUS-ORD-003 |
| Cancelado | Fila con «Cancelado»; en la hoja, el motivo y «¿Problema con este pedido?», que abre WhatsApp con el código | CUS-ORD-004, CA-ORD-04 |
| Caso de pago | Si se canceló por `proof_rejected_final`: «Ver caso de pago» | CUS-ORD-003, CA-ORD-05 |
| Fecha | Relativa hasta 30 días («hace 5 min», «ayer», «hace N días») y, después, la fecha del calendario de Lima | CUS-ORD-001 |
| Importe ilegible | La lista falla cerrada con un error genérico; no se muestra un total inventado | CUS-ORD-001, CA-ORD-03 |
| Estado sin etiqueta | Todos los estados salen de la misma proyección que el seguimiento | CUS-ORD-002, CA-ORD-01 |
| Pedido que pasa a entregado | La tarjeta en curso muestra un check animado y el pedido sube a «Anteriores» | CA-ORD-08 |

## Movimiento

Al abrir, la tarjeta en curso entra con fundido y una subida de 8 px (200 ms, curva `cubic-bezier(.2,.8,.2,1)`); la etapa activa y el punto «En camino» laten suave. Tocar una fila o botón: escala 0,97 y sombra baja. La fila abre el detalle en una hoja inferior. Cambiar de filtro: fundido cruzado de 150 ms. Vacío: la ilustración entra con fundido y escala. Con «reducir movimiento», estático.

## Pendiente

- ¿«Calificar» de la hoja y la pregunta posterior a la entrega son la misma ventana de `resenas`? El tablero no lo aclara.
