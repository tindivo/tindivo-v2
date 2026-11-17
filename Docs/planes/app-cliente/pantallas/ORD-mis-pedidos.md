# ORD · Mis pedidos

> Maquetas: tableros `Pedidos` (con pedido en curso e historial) y `Pedidos-vacio`. Es la pestaña «Pedidos» de la barra inferior.

| | |
|---|---|
| **Tarea de la persona** | Ver lo que tiene en curso, revisar los anteriores y volver a pedir. |
| **Se llega desde** | Barra inferior → «Pedidos». Pastilla de pedido de `CAT-inicio`. Aviso de «No sabemos si tu pedido anterior llegó» en `CHK-confirmar-pedido`. |
| **Se sale hacia** | Tarjeta en curso o «Ver seguimiento» → `TRK-seguimiento`. Una fila del historial → hoja de detalle (productos, motivo si se canceló, «Calificar»). «Volver a pedir» → `CAT-negocio` (o repone la bolsa, ver Pendiente). Estado vacío «Hacer un pedido» → `CAT-inicio`. Una entrega → su seguimiento de Entregas (`ENT-pedir-entrega`). |
| **Requisitos** | CUS-ORD-001…006 · CUS-CAT-019 · CUS-CRT-012 · CUS-REV-001, 002 · (requisito nuevo: filtros «Todos», «Restaurantes» y «Entregas») · (requisito nuevo: hoja de detalle de un pedido anterior) |
| **Endpoints** | `GET /customer/orders` (página, la más reciente primero, con `nextCursor`) · `GET /customer/orders/{id}` (detalle) · `GET /customer/courier-orders` (entregas) · `POST /customer/orders/{id}/reorder` (existe en el servidor; la app aún no lo usa) · `GET /customer/reviews/pending` · `POST /customer/orders/{id}/review` |
| **Estado** | Android: 🟡 «Historial de pedidos» con tarjetas, paginación y «Volver a pedir» que solo abre el negocio; sin filtros ni pedido en curso destacado; las entregas viven en otra lista · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Título:** «Mis pedidos» (en la barra y como título de página).
2. **Filtros** (chips): «Todos» · «Restaurantes» · «Entregas». Cambiar de filtro hace un fundido cruzado de la lista (150 ms).
3. **Pedido en curso** (tarjeta compacta, una sola acción): negocio «La Florencia» · «Hoy 7:02 p. m. · S/ [TOTAL]» · estado «En camino»
   · «llega en [PLAZO]» · «Ver seguimiento».
4. **«Anteriores»:** una fila por pedido, sin botones salvo uno:
   - «Cevichería El Muelle» · «Sáb 14 nov · S/ [TOTAL]» · «Entregado» · **«Volver a pedir»** (solo en el último entregado).
   - «Entrega · Mercado» · «Jue 12 nov · S/ [TARIFA]» · «Entregado» (Tindivo Entregas).
   - «La Florencia» · «Lun 9 nov · S/ [TOTAL]» · «Cancelado».
5. **Hoja de detalle** (al tocar una fila): productos, motivo si se canceló y «Calificar» si aún no se calificó.
6. **Barra inferior fija:** «Inicio» · «Entregas» · «Pedidos» (activa) · «Cuenta».

### Variante vacía (`Pedidos-vacio`)

Ilustración, «Sin pedidos todavía» y el botón «Hacer un pedido». La maqueta `Estados` define otra versión del mismo vacío
(«Aún no tienes pedidos» · «Cuando pidas algo, lo verás aquí.» · «Ver negocios»): ver Pendiente.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | «Cargando» (esqueletos de tarjetas) | CUS-ORD-001 |
| Vacío | «Sin pedidos todavía» · «Hacer un pedido» | CUS-ORD-001 |
| Error | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» o «Algo salió mal. Inténtalo de nuevo.» + «Reintentar» | CUS-ORD-001 |
| Paginando | Indicador al final; «Ver más pedidos» | CUS-ORD-006 |
| Falla la página siguiente | Se conserva la lista y aparece «Algo salió mal. Inténtalo de nuevo.» | CUS-ORD-006 |
| Sin sesión | Se sale de la pantalla (el código cierra la sesión local ante un 401) | CUS-AUT-012 |
| En curso | Tarjeta arriba con estado «En camino» y «Ver seguimiento»; el ícono y el punto laten (1,8 s) | CUS-ORD-001, CUS-CAT-019 |
| Entregado | Fila con «Entregado»; «Volver a pedir» en el último | CUS-ORD-003 |
| Cancelado | Fila con «Cancelado»; en la hoja, el motivo; «¿Problema con este pedido?» → WhatsApp con el código | CUS-ORD-004 |
| Caso de pago | Si se canceló por `proof_rejected_final`: «Ver caso de pago» | CUS-ORD-003, CUS-PAY-009 |
| Fecha | Relativa hasta 30 días («hace 5 min», «ayer», «hace N días») y calendario de Lima después; la maqueta muestra «Sáb 14 nov» | CUS-ORD-001 |
| Importe ilegible | La lista falla cerrada con error genérico; no se muestra un total inventado | CUS-ORD-001 |
| Estado sin etiqueta | Todos los estados salen de la misma proyección que el seguimiento; `awaiting_payment` y `ready_for_pickup` ya no muestran texto interno | CUS-ORD-002 |

## Criterios de aceptación propios de la pantalla

```
CA-ORD-P1 · El pedido en curso va arriba y solo uno lleva acción
  Dado un pedido en `En camino` y varios entregados
  Entonces la tarjeta en curso aparece sobre «Anteriores» con «Ver seguimiento»
  Y las filas de «Anteriores» no llevan botones, salvo «Volver a pedir» en el último entregado

CA-ORD-P2 · El filtro cambia la lista sin recargarla
  Dado la lista «Todos» con pedidos y entregas
  Cuando la persona toca «Entregas»
  Entonces solo se ven las entregas, con un fundido de 150 ms
  Y volver a «Todos» no repite la petición

CA-ORD-P3 · Al entregarse, el pedido pasa de «En curso» a «Anteriores»
  Dado un pedido en curso que cambia a `delivered`
  Entonces la tarjeta en curso muestra un check animado y el pedido aparece arriba de «Anteriores»
```

## Movimiento

Al abrir, la tarjeta en curso entra con fundido + subida de 8 px (200 ms, `cubic-bezier(.2,.8,.2,1)`). La etapa activa y el punto de
«En camino» laten suave (1,8 s). Tocar una fila o botón: escala 0,97 y sombra baja. La fila abre el detalle en una hoja
inferior. Cambiar de filtro: fundido cruzado (150 ms). Vacío: la ilustración entra con fundido + escala 0,96 a 1 (250 ms); los
puntos decorativos flotan 4 px muy lento (3 s). Con «reducir movimiento»: estático.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** título «Mis pedidos» (maqueta) frente a «Historial de pedidos» (código). El código nombra al vacío «Aún no tienes pedidos» · «Cuando hagas tu primera compra aparecerá aquí para que la revises cuando quieras.» · «Explorar restaurantes».
- **Maqueta ↔ código:** el vacío tiene **tres textos**: `Pedidos-vacio` («Sin pedidos todavía» / «Hacer un pedido»), `Estados` («Aún no tienes pedidos» / «Cuando pidas algo, lo verás aquí.» / «Ver negocios») y el código (tercero). Hay que elegir uno.
- **Maqueta ↔ código:** el código no tiene filtros ni tarjeta en curso; mezcla en una sola lista. Las entregas del código están en una pantalla aparte («Mis entregas»); la maqueta las junta.
- **Maqueta ↔ código:** «Volver a pedir» solo abre el negocio (no repone la bolsa), aunque el servidor tiene `POST /customer/orders/{id}/reorder`. ¿Se conecta?
- **Maqueta ↔ código:** CUS-ORD-001 dice «últimos 40 sin paginación»; el código ya pagina con `nextCursor` y «Ver más pedidos».
- ¿«Calificar» en la hoja de detalle y la pregunta posterior a la entrega son la misma ventana (`REV`)? La maqueta no lo aclara.
