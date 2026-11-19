---
canvas: [Seguimiento, Seguimiento-recogiendo, Seguimiento-llego, Seguimiento-pago]
requisitos: [CUS-TRK-001, CUS-TRK-002, CUS-TRK-003, CUS-TRK-004, CUS-TRK-005, CUS-TRK-006, CUS-TRK-008, CUS-TRK-009, CUS-TRK-010, CUS-TRK-012, CUS-TRK-014, CUS-TRK-015, CUS-TRK-020, CUS-TRK-021, CUS-TRK-022, CUS-TRK-023, CUS-TRK-024, CUS-ORD-007]
operaciones: [getCustomerOrder, cancelOrder]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/tracking/components/**, apps/customer/features/tracking/lib/**, apps/customer/app/pedido/**]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailSections.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderHeadline.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderCancelViews.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/CancelOrderViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/DriverContact.kt]
  ios: []
---

# Seguimiento del pedido

| | |
|---|---|
| **Tarea de la persona** | Saber en qué va su pedido, cuánto falta, quién lo lleva y qué debe hacer ella: pagar, esperar o recibir. |
| **Se llega desde** | `seguimiento/esperando-aceptacion` cuando el negocio acepta · el pedido en curso del Inicio · «Ver seguimiento» de `mis-pedidos/mis-pedidos` · una notificación. |
| **Se sale hacia** | «Ver resumen del pedido»: el detalle (hoja con productos, totales y dirección). «Ayuda con este pedido»: WhatsApp de soporte (capacidad `soporte`). El pago: el bloque de la capacidad `pagos`. Entregado: la pregunta de calificar (capacidad `resenas`). Volver: el Inicio. |

El pago de este seguimiento (efectivo con vuelto, Yape o Plin con su tarjeta, y el comprobante) lo define la capacidad `pagos`: aquí solo está el sitio donde aparece.

## Contenido, de arriba abajo

1. Barra superior: volver · «Pedido #TDV-K7M3PQ2A» · «Actualizar estado» (CUS-ORD-007).
2. Titular del estado: «Preparando tu pedido», «En camino» y los de cada fase. Sobre la ruta, la moto avanza: en «Preparando» se acerca al local y, al recoger, salta al tramo hacia la casa (CUS-TRK-024).
3. Progreso en cuatro etapas: Recibido, Preparando, En camino, Entregado. La activa late; la pendiente va en gris. En recojo la tercera dice «Listo» (CUS-TRK-002).
4. «Llega en» y un rango de minutos, nunca una hora exacta; en recojo no se suma trayecto (CUS-TRK-004).
5. Motorizado: nombre completo y «Tu motorizado». Sin teléfono, WhatsApp ni placa en ningún estado (CUS-TRK-021). Foto: abierta (DA-19); mientras tanto, iniciales.
6. Lugar reservado, sin tarjeta, para las 5 estrellas al entregar: lo define `resenas`.
7. Bloque de pago, según la forma de pago elegida: lo define `pagos` y aparece cuando el negocio acepta (CUS-TRK-020).
8. «Ver resumen del pedido» (fila de texto) y «Ayuda con este pedido» (acción de texto con ícono).

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | Esqueleto del titular y de la tira | CUS-TRK-001 |
| Esperando que el negocio acepte | La pantalla `seguimiento/esperando-aceptacion` | CUS-TRK-019 |
| Recibido (`validando`, `pending_acceptance`, `awaiting_payment`, `confirmed`) | «Pedido recibido» · «Estamos confirmándolo con el restaurante» | CUS-TRK-002, CUS-TRK-003 |
| Cualquier pago en `pending_acceptance` | La pantalla de espera, con «Responde en hasta [plazo] min» y, aparte, su cuenta atrás; «Esperando confirmación de disponibilidad» queda solo para un prepago en `validando` sin comprobante | CUS-TRK-019, CUS-TRK-005 |
| Prepago, turno del cliente | «Restaurante confirmó. Paga ahora», con el bloque de `pagos` | CUS-TRK-003, CUS-TRK-020 |
| Prepago, verificando | «Verificando tu comprobante de pago» | CUS-TRK-003 |
| Prepago verificado | «Pago verificado. En preparación» | CUS-TRK-003 |
| Preparando | «Preparando» · «Tu pedido está en cocina» | CUS-TRK-002, CA-TRK-03 |
| En camino | «En camino» · «El motorizado va en ruta» | CUS-TRK-002, CA-TRK-02 |
| Listo para recoger | «Listo para recoger» · «Pásalo a recoger en el local» | CUS-TRK-002, CA-TRK-02 |
| El motorizado llegó | «[Nombre] llegó» · «Sal a recibir tu pedido»; sin botón de contacto | CUS-TRK-021, CA-TRK-08 |
| No se presentó | El motorizado se va; de noche el pedido se marca «no se presentó» y el cliente recibe la falta; Jesús la confirma o anula | CUS-TRK-022, CA-TRK-10 |
| Entregado | «Entregado» · «¡Buen provecho!»; la consulta se detiene; se ofrece calificar | CUS-TRK-002, CA-TRK-12 |
| Se puede cancelar | «Estamos confirmando tu pedido» · «Hasta entonces puedes cancelar sin costo» · «Cancelar» → «¿Cancelar tu pedido?» · «Sí, cancelar pedido» / «No, mantener pedido» | CUS-TRK-006, CA-TRK-01 |
| Ya pagó y quiere cancelar | «Ya enviaste tu pago, así que este pedido no se cancela desde la app; escríbenos por soporte» | CUS-TRK-006, CA-TRK-01 |
| Cancelado | Titular y cuerpo según el motivo (cliente, tiempo de pago, negocio sin respuesta, restaurante, admin, comprobante rechazado, recojo sin retirar, entrega sin éxito) y «Escribir por WhatsApp» y «Volver al menú»; si ya pagó, pide escribir por WhatsApp para coordinarlo | CUS-TRK-015, CA-TRK-11 |
| Estado desconocido | «Tu pedido sigue en curso»; sigue consultando | CA-TRK-03 |
| Sin conexión | Se conserva lo último mostrado y se sigue consultando | CUS-TRK-014, CA-TRK-13 |
| Pedido de otra cuenta | «No puedes abrir este pedido» · «Mis pedidos» / «Entrar con otra cuenta»; sin sesión, «Inicia sesión para intentar abrir este pedido» | CUS-TRK-023, CA-TRK-09 |
| Pedido no encontrado | El mismo texto de «otra cuenta»; la consulta se detiene | CUS-TRK-023 |
| Sesión vencida (401) | Se cierra la sesión local y se sale de la pantalla | CUS-TRK-001 |

## Diferencias por plataforma

- Mantener la pantalla encendida: en Android, la bandera de pantalla de la ventana; en iOS, el bloqueo de inactividad (CUS-TRK-012). La web usaba el Wake Lock del navegador.
- Avisos: solo la notificación del sistema de `notificaciones` (CUS-TRK-010); no hay tono ni interruptor propios.
- Movimiento: la moto se acerca al local (250 ms por actualización) y el segmento activo late; con «reducir movimiento», sin animaciones.

## Pendiente

- «Cambiar monto» del efectivo, que dibuja el tablero y no existe en el código ni en la API: toca dinero y no entra: lo ve Jesús en `pagos`.
- Si «El motorizado va al local» o «está esperando en el local» se ven dentro de «Preparando» como línea de detalle, sin paso nuevo (propuesta de la junta del 17-nov, aún sin ratificar por Jesús).
