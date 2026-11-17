# STO · Tindivo Store (catálogo y pieza)

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - **Store sale después del lanzamiento:** esta pantalla no entra en la primera versión de Android ni de iOS (`requisitos/STO.md`).

> **Diseño v3 pendiente.** Esta spec recoge **solo lo que hace hoy el código Android** (`feature/store`). No es un diseño
> nuevo. La maqueta `Store` existe en el canvas pero es de la versión anterior y **no manda** hasta que se rediseñe.
> Tindivo Store es solo un catálogo: se pide y se coordina por WhatsApp.

| | |
|---|---|
| **Tarea de la persona** | Mirar las piezas de segunda mano y pedir una por WhatsApp. |
| **Se llega desde** | Tarjeta «Tindivo Store» de `CAT-inicio`. Enlace a una pieza (`/store/{slug}`). |
| **Se sale hacia** | Una pieza → detalle. «Lo quiero — pedir por WhatsApp» → WhatsApp. «Ver restaurantes de Tindivo» → `CAT-inicio`. «Escribir por WhatsApp» (vacío) → WhatsApp. |
| **Requisitos** | STO (requisitos de `requisitos/STO.md`; sin IDs citables aún) · (requisito nuevo: ninguno propuesto en esta spec) |
| **Endpoints** | `GET /public/store` (grilla, vendidos recientes, categorías y ajustes; filtros en `null` no se aplican) · `GET /public/store/{slug}` (pieza, relacionados y ajustes; 404 si no existe o no es pública) · `POST /public/store/events` (eventos del embudo, 204) |
| **Estado** | Android: 🟡 funciona con el diseño anterior; rediseño v3 ⬜ · iOS: ⬜ |

## Contenido, de arriba abajo (lo que hace hoy el código)

### Catálogo
1. Barra: volver, «Tindivo Store», búsqueda («Busca casaca, 38, perfume…», «Borrar búsqueda») y «Filtros» (con indicador si hay filtros activos).
2. Subtítulo: «Piezas únicas de segunda mano. Las pides por WhatsApp y pagas al recibir.»
3. **Categorías** (chips): «Todo» y las del servidor, cada una con su cantidad.
4. **Grilla de piezas:** foto, nombre, estado («Como nuevo», «Buen estado»…), precio «S/ 45.00»; distintivos «-[N]%», «Remate», «Nuevo», «Estado [N]/10», «Reservado», «Vendido».
5. **«Vendidos recientemente»:** «Así de rápido se van las oportunidades.»
6. **Hoja de filtros:** «Condición» (Todo, Nuevo, Segunda), «Ordenar por» (Recientes, Menor precio, Mayor precio), «Limpiar» y «Ver artículos».

### Pieza
Galería (con contador «[n]/[N]» y visor ampliable), nombre, «Pieza única», «Acepta ofertas», precio y descuento, condición («Nuevo con etiqueta», «Nuevo sin uso», «Usado»), público («Dama», «Caballero», «Niños», «Unisex»), «Talla [x]», «Estado [N]/10 · [Impecable | Muy buen estado | Buen estado, con uso | Con detalles visibles (ver fotos)]», «Te lo llevamos en San Jacinto desde [tarifa]» y «[mín]–[máx] según distancia · Pagas al recibir: efectivo o Yape», «También te puede gustar», «Ref. [código]». Botón **«Lo quiero — pedir por WhatsApp»** con «Revísalo antes de pagar · Si no es como en las fotos, no pagas nada».

## Estados

| Estado | Qué se ve |
|---|---|
| Cargando | «Cargando la tienda» / «Cargando la pieza» |
| Error | «No pudimos cargar la tienda» · «Revisa tu conexión e inténtalo otra vez.» + «Reintentar»; «No pudimos cargar esta pieza» |
| Recarga que falla | «No pudimos actualizar la lista.» (se conserva la lista) |
| Sin resultados | «No lo tenemos aún. Escríbenos y te avisamos si llega» · «Buscaste «[texto]»» + «Escribir por WhatsApp» y «Mientras tanto» |
| Sin piezas | «Por ahora no hay piezas publicadas.» |
| Pieza reservada | «Otra persona lo pidió.» · «Si no se concreta, vuelve a estar disponible.» + «Avísame si se libera» |
| Pieza vendida | «Ya encontró dueño.» · «Mira artículos parecidos.» + «Ver parecidos» |
| Pieza inexistente | «Esta pieza ya no está disponible» · «Puede que ya se haya vendido o que la hayamos retirado. Mira otras piezas en la tienda.» + «Volver a la tienda» |
| WhatsApp no disponible | «Por ahora no podemos recibir mensajes por WhatsApp desde la app. Inténtalo más tarde.» / «No encontramos una app para abrir WhatsApp en este teléfono.» |

## Criterios de aceptación propios de la pantalla

```
CA-STO-P1 · Una pieza reservada o vendida no se pide
  Dado una pieza con estado «Reservado» o «Vendido»
  Entonces el botón «Lo quiero — pedir por WhatsApp» no está disponible
  Y se ofrece «Avísame si se libera» o «Ver parecidos»

CA-STO-P2 · El pedido sale por WhatsApp, no por la app
  Dado una pieza disponible
  Cuando la persona toca «Lo quiero — pedir por WhatsApp»
  Entonces se abre WhatsApp con el mensaje de la pieza y la app no crea ningún pedido ni cobra
```

## Movimiento

Sin especificar: este diseño es de la v1. No inventar hasta el rediseño v3.

## Pendiente (va a `decisiones-abiertas.md`)

- **Diseño v3 pendiente** del área. La maqueta `Store` (filtros «Todo», «Ropa», «Hogar», «Electro» y fotos «[FOTO]») es de la v1 y difiere del código (que filtra por categorías del servidor y tiene búsqueda y hoja de filtros).
- **Documento ↔ código:** las decisiones de Jesús (2026-11-16, segunda vuelta) dicen que las publicaciones salen solo a nombre de Tindivo, que Tindivo actúa como intermediario y puede reembolsar, con 24 h para reclamar; el texto actual dice «Revísalo antes de pagar · Si no es como en las fotos, no pagas nada» y «pagas al recibir». Falta reconciliarlos.
- «Avísame si se libera» no tiene destino en el código documentado: no se sabe si crea un aviso.
