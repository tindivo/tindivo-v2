# TRK · Seguimiento del pedido

> Maquetas: tableros `Seguimiento-recogiendo` (preparando, pago en efectivo) y `Seguimiento` (en camino, pago por billetera).
> La hoja de pago de este mismo seguimiento es `PAY-pago-al-recibir`.

| | |
|---|---|
| **Tarea de la persona** | Saber en qué va su pedido, cuánto falta, quién lo lleva y qué debe hacer ella (pagar, esperar, recibir). |
| **Se llega desde** | Pedido creado en `CHK-confirmar-pedido` (**reemplaza** esa pantalla, CUS-CHK-011) · pastilla «Ver» de `CAT-inicio` · «Ver seguimiento» en `ORD-mis-pedidos` · notificación. |
| **Se sale hacia** | «Ver resumen del pedido» → detalle del pedido (hoja con productos, totales y dirección). «Ayuda por WhatsApp» → WhatsApp de soporte. Pago → `PAY-pago-al-recibir` / `PAY-comprobante`. Entregado → pregunta de reseña (REV). Volver → `CAT-inicio`. |
| **Requisitos** | CUS-TRK-001…015 · CUS-CHK-011 · CUS-PAY-001, 002, 007 · CUS-ORD-004 · CUS-REV-001 · (requisito nuevo: tira de 4 etapas con la moto sobre la ruta) · (requisito nuevo: «Cambiar monto» del efectivo) · (requisito nuevo: lugar reservado para 5 estrellas al entregar) |
| **Endpoints** | `GET /customer/orders/{id}` (sondeo cada 8 s, mientras la pantalla es visible) · `GET /public/orders/{shortId}` (vista pública, sin sesión) · `POST /customer/orders/{id}/cancel` · `GET /customer/orders/{id}/prepay-info` · `POST /customer/orders/{id}/prepay-proof/upload-url` y `POST /customer/orders/{id}/prepay-proof` · `POST /customer/orders/{id}/appeal` · `GET /customer/reviews/pending` · (endpoint nuevo: cambiar el monto con el que paga en efectivo, si se aprueba «Cambiar monto») |
| **Estado** | Android: 🟡 detalle con titular por estado, cuatro pasos, cancelar, prepago y motorizado; sin mapa ni moto, sin «Cambiar monto» · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Barra superior:** volver · «Pedido #K7M3PQ2A» (código de 8 caracteres).
2. **Titular del estado:** «Preparando tu pedido» / «En camino» (y los de cada fase: ver estados). Sobre la ruta, la moto avanza
   (en «Preparando» se acerca al local; al recoger salta al tramo hacia la casa).
3. **Progreso en cuatro etapas** (CUS-TRK-002): Recibido · Preparando · En camino · Entregado. La activa late en 1,6 s; la
   pendiente usa `#7A828C`. En recojo, la tercera etapa es «Listo».
4. **«Llega en» «18–25 min»**: siempre un rango, nunca una hora exacta (CUS-TRK-004). Sin trayecto en recojo.
5. **Motorizado:** «Carlos Ramos» · «Tu motorizado». Su teléfono solo existe cuando llegó (`arrivedAtCustomerAt`): entonces
   aparece «Escribirle por WhatsApp» (CUS-TRK-007).
6. **Espacio reservado** (sin tarjeta) para 5 estrellas de 24 px al entregar: «calificar» (CUS-REV-001).
7. **Bloque de pago**, según la forma de pago elegida:
   - **Efectivo al recibir:** «Efectivo al recibir» · «Pagas con S/ 50 · Vuelto S/ [VUELTO]» · «Cambiar monto».
   - **Billetera digital al recibir:** «Paga al recibir» · «S/ [TOTAL] · La Florencia» · número «987 654 321» · «Titular: Rosa Mendoza
     Quispe» · «Copiar» · «Desde Yape, Plin o tu billetera» · «Ver QR o subir captura» (abre `PAY-pago-al-recibir`).
   - **Prepago:** el bloque pasa a ser `PAY-comprobante` cuando el negocio acepta (CUS-PAY-001).
8. **«Ver resumen del pedido»** (fila de texto) y **«Ayuda por WhatsApp»** (acción de texto con ícono).

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | Esqueleto del titular y la tira | CUS-TRK-001 |
| Recibido (`validando`, `pending_acceptance`, `awaiting_payment`, `confirmed`) | «Pedido recibido» · «Estamos confirmándolo con el restaurante» | CUS-TRK-002/003 |
| Prepago, esperando al negocio | «Esperando confirmación de disponibilidad» + cuenta atrás del plazo de aceptación | CUS-TRK-005 |
| Prepago, turno del cliente | «Restaurante confirmó. Paga ahora» + `PAY-comprobante` | CUS-PAY-001 |
| Prepago, verificando | «Verificando tu comprobante de pago» | CUS-TRK-003 |
| Prepago verificado | «Pago verificado. En preparación» | CUS-TRK-003 |
| Preparando | «Preparando» · «Tu pedido está en cocina» | CUS-TRK-002 |
| En camino | «En camino» · «El motorizado va en ruta» | CUS-TRK-002 |
| Listo para recoger | «Listo para recoger» · «Pásalo a recoger en el local» | CUS-TRK-002 |
| El motorizado llegó | «Ya está en tu domicilio y no logra ubicarte.» + «Escribirle por WhatsApp» | CUS-TRK-007 |
| Entregado | «Entregado» · «¡Buen provecho!»; el sondeo se detiene; se ofrece calificar | CUS-TRK-002, CUS-REV-001 |
| Se puede cancelar | Fila «Estamos confirmando tu pedido» · «Hasta entonces puedes cancelar sin costo» · «Cancelar» → «¿Cancelar tu pedido?» · «Sí, cancelar pedido» / «No, mantener pedido» | CUS-TRK-006 |
| Ya pagó y quiere cancelar | «Ya enviaste tu pago, así que este pedido no se cancela desde la app; escríbenos por soporte» | CUS-TRK-006 |
| Cancelado | Titular y cuerpo según el motivo (cliente, tiempo de pago, negocio sin responder, restaurante, admin, comprobante rechazado, recojo sin retirar, entrega sin éxito) + «Escribir por WhatsApp» y «Volver al menú»; si ya pagó, «escríbenos por WhatsApp para coordinarlo» | CUS-TRK-015, CUS-PAY-009 |
| Estado desconocido | «Tu pedido sigue en curso»; sigue sondeando | CUS-TRK-014 |
| Sin conexión | Se conserva lo último mostrado y se sigue sondeando | CUS-TRK-014 |
| Pedido no encontrado | «Algo salió mal. Inténtalo de nuevo.» (hoy); el sondeo se detiene | CUS-TRK-001 |
| Sesión vencida (401) | Se cierra la sesión local y se sale de la pantalla | CUS-AUT-012 |

## Criterios de aceptación propios de la pantalla

```
CA-TRK-P1 · El tiempo es un rango
  Dado un pedido en camino con estimado calculado
  Entonces la pantalla muestra «Llega en [A]–[B] min»
  Y nunca una hora de reloj; con el motorizado en la puerta no se muestra

CA-TRK-P2 · La moto sigue el estado
  Dado un pedido en «Preparando»
  Cuando el estado pasa a «picked_up»
  Entonces el titular cambia a «En camino» y la moto salta al tramo hacia la casa

CA-TRK-P3 · El teléfono del motorizado no aparece antes de llegar
  Dado un pedido en camino sin `arrivedAtCustomerAt`
  Entonces no hay botón de WhatsApp al motorizado ni se muestra su número
  Y al llegar aparece «Escribirle por WhatsApp»

CA-TRK-P4 · La cancelación coincide con el servidor
  Dado un pedido de efectivo en `validando` o `pending_acceptance`
  Entonces se ofrece «Cancelar»; en cualquier otro estado, no
  Y en prepago solo en `pending_acceptance` y sin pago enviado
```

## Movimiento

La moto se acerca al local (250 ms por actualización); el segmento activo late 1,6 s. Al recoger, la moto salta al tramo
hacia la casa y el título cambia a «En camino». «Copiar» cambia a «Copiado» con check durante 2 s. «Ver QR o subir
captura» abre la hoja con deslizamiento de 250 ms. Con «reducir movimiento»: sin animaciones.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta no dibuja la acción de **cancelar** ni el estado de cancelado; el código sí (fila, diálogo y 12 variantes de motivo). Se conserva lo del código mientras Jesús no decida otra cosa.
- **Maqueta ↔ código:** «Cambiar monto» (efectivo) y la tira con la moto sobre la ruta no existen en el código. Cambiar el monto tras pedir toca dinero: requiere revisión de Jesús.
- **Maqueta ↔ código:** la maqueta usa el VUELTO «S/ [VUELTO]» dentro de la tarjeta de efectivo; el «VUELTO» amarillo de la captura de la tarjeta del motorizado no está en el código.
- **Maqueta ↔ código:** el código muestra en el detalle «Pagas con» y «vuelto» como filas del resumen; la maqueta las sube al bloque de pago.
- La notificación que pide `NOT-activar-notificaciones` se muestra encima de esta pantalla la primera vez.
