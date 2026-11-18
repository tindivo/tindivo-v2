# TRK · Esperando que el negocio acepte

> Decisión de Jesús, 2026-11-17: tras confirmar, el pedido espera a que el negocio acepte. Maqueta: tablero `Seguimiento-aceptacion`.
> Es el primer estado del seguimiento (`TRK-seguimiento`); no hay pantalla intermedia entre Checkout y esta.

| | |
|---|---|
| **Tarea de la persona** | Saber que su pedido llegó al negocio, cuánto tarda en responder y qué puede hacer mientras espera (cancelar o pedir ayuda). |
| **Se llega desde** | Pedido creado en `CHK-confirmar-pedido` (**reemplaza** esa pantalla, CUS-CHK-011) · «Ver pedido» de `CAT-inicio` · `ORD-mis-pedidos` · notificación. |
| **Se sale hacia** | El negocio acepta → `TRK-seguimiento` en «Preparando», con la tarjeta de pago (CUS-PAY-014). El plazo vence o el negocio rechaza → cancelado (CUS-TRK-015). «Ver resumen del pedido» → detalle. «Cancelar pedido» → confirmación y cancelado. «Ayuda con este pedido» → WhatsApp de soporte. Volver → `CAT-inicio`. |
| **Requisitos** | CUS-TRK-019 ★, CUS-TRK-005 ★ (reloj de aceptación), CUS-TRK-006 ★ (cancelar), CUS-TRK-002 ★ (paso 1 de 4), CUS-SUP-006, CUS-CHK-011 |
| **Endpoints** | `GET /customer/orders/{id}` (sondeo cada 8 s, mientras la pantalla es visible) · `POST /customer/orders/{id}/cancel` · `GET /config` (⚙ `timers.acceptance`) |
| **Estado** | Android: ⬜ (hoy el estado `pending_acceptance` se pinta dentro del detalle del pedido) · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Barra superior:** volver · «Pedido #TDV-K7M3PQ2A» (la maqueta no lleva el prefijo; decisión 15) · «Actualizar estado».
2. **Ilustración:** el negocio recibe el pedido (etiqueta accesible «Ilustración: el negocio recibe tu pedido»).
3. **Progreso en cuatro etapas** (CUS-TRK-002), con la primera activa: «Paso 1 de 4: Recibido, Preparando, En camino, Entregado».
4. **Estado:** «Esperando al negocio» y «Responde en hasta» «[⚙ `timers.acceptance`] min», con cuenta atrás (CUS-TRK-005).
5. **Resumen corto:** «La Florencia» · «2 productos · Total S/ [TOTAL]» · «Ver resumen del pedido».
6. **Acciones de texto:** «Cancelar pedido» y «Ayuda con este pedido» (con ícono; abre el WhatsApp de soporte, CUS-SUP-006).

El pago **no** se muestra aquí: aparece dentro del seguimiento cuando el negocio acepta (CUS-PAY-014).

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Esperando | Lo anterior, con la cuenta atrás | CUS-TRK-019 |
| Quedan menos de un tercio del plazo | La cuenta atrás en rojo (tope de 3 min), como en CUS-TRK-005 | CUS-TRK-005 |
| Plazo vencido sin respuesta | «Confirmando…» hasta 60 s de desfase del cron; después el pedido se cancela y se explica el motivo | CUS-TRK-005, CUS-TRK-015 |
| Cancelar | «¿Cancelar tu pedido?» · «Sí, cancelar pedido» / «No, mantener pedido»; permitido mientras el servidor lo permita | CUS-TRK-006 |
| Negocio acepta | Pasa a `TRK-seguimiento` «Preparando» y aparece la tarjeta de pago | CUS-TRK-020, CUS-PAY-014 |
| Cliente sin historial (`validando`) | «Te llamaremos para confirmar tu pedido» y el número verificado; sin cuenta atrás (CUS-TRK-005) | CUS-CHK-027 |
| Sin conexión | Se conserva lo último mostrado y se sigue sondeando | CUS-TRK-014 |
| Pedido de otra cuenta | «No puedes abrir este pedido» · «Mis pedidos» / «Entrar con otra cuenta» | CUS-TRK-023 |

## Criterios de aceptación propios de la pantalla

```
CA-TRK-P5 · Todo pedido confirmado espera al negocio                    (CUS-TRK-019)
  Dado un pedido recién creado, en efectivo o en Yape o Plin
  Cuando termina de crearse
  Entonces se ve «Esperando que el negocio acepte» con «Responde en hasta [⚙ timers.acceptance] min»
  Y no se ve ningún dato de pago ni número de cuenta

CA-TRK-P6 · El pago aparece solo después de aceptar                       (CUS-TRK-020, CUS-PAY-014)
  Dado esta pantalla abierta
  Cuando el negocio acepta
  Entonces el seguimiento pasa a «Preparando» y muestra la tarjeta «Paga a [NEGOCIO]»
```

## Movimiento

La ilustración entra con fundido de 200 ms; el reloj corre en vivo. Con «reducir movimiento»: sin animaciones.

## Pendiente (va a `decisiones-abiertas.md`)

- Plazo y consecuencias de vencer sin respuesta: el de aceptación es ⚙ `timers.acceptance`; la junta B pide definir desde cuándo corre el del prepago (punto V).
