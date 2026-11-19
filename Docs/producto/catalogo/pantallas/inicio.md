---
canvas: [Main]
requisitos: [CUS-CAT-001, CUS-CAT-002, CUS-CAT-003, CUS-CAT-012, CUS-CAT-015, CUS-CAT-020, CUS-CAT-030, CUS-CAT-031, CUS-CAT-032]
operaciones: [listBusinesses]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/catalog/components/home-shell.tsx, apps/customer/features/catalog/components/home-header.tsx, apps/customer/features/catalog/components/business-card.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/home/**]
  ios: []
---

# Inicio

| | |
|---|---|
| **Tarea de la persona** | Elegir qué pedir hoy: un restaurante, Tindivo Entregas o Tindivo Store; retomar su pedido en curso o su bolsa. |
| **Se llega desde** | Apertura de la app (primera pestaña). Volver desde `catalogo/negocio`, la bolsa, el seguimiento, Entregas o Store. |
| **Se sale hacia** | Tarjeta de restaurante → `catalogo/negocio`. «Entregas» → capacidad entregas. «Store» → capacidad Store. Tarjeta del pedido → seguimiento. Bolsa de la barra superior → `bolsa/bolsa`. Chip «Entregar en» → `direcciones/elegir-direccion`. Barra de pestañas → pedidos y cuenta. |

## Contenido, de arriba abajo

1. **Barra superior fija:** logo; chip de dos líneas («Entregar en» pequeño arriba, la dirección debajo); a la derecha, la
   bolsa con su contador, visible siempre, también vacía (CUS-CAT-030). Sin sesión o sin dirección, el chip no se muestra.
2. **Pedido en curso** (si lo hay), como tarjeta al inicio del contenido: «Tu pedido está en camino» · «[NEGOCIO] · llega en
   [A]–[B] min» · «Ver pedido ›». Con varios: «Tienes [N] pedidos en curso · Ver pedidos ›». Punto en la pestaña Pedidos
   mientras haya uno activo (CUS-CAT-031).
3. **Saludo:** «¿Qué pedimos hoy?», título único sin el nombre de la persona (CUS-CAT-002; por confirmar, ver Pendiente).
4. **Dos tarjetas de servicio**, una junto a otra: «Entregas» («De A a B, ya pagado», distintivo «ÚNICO») y «Store»
   («Variedad de productos», CUS-CAT-032; Store sale después del lanzamiento).
5. **«Restaurantes»** · «[N] abiertos ahora». Una tarjeta por negocio: abierto, con nombre, rubro, «Abierto» y plazo;
   cerrado, atenuada y «Cerrado · abre [día] [hora]» (CUS-CAT-012). Un negocio en modo catálogo (`catalog_only`) ofrece
   «Pedidos por WhatsApp» en lugar del plazo (CUS-CAT-015).
6. **Barra de pestañas fija:** «Inicio» · «Entregas» · «Pedidos» · «Cuenta». Nada flota sobre ella: la pastilla «Ver bolsa»
   existe solo dentro del negocio.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | Esqueletos de tarjeta | CUS-CAT-001 |
| Sin restaurantes | «Aún no hay restaurantes disponibles.» | CUS-CAT-001 |
| Error al cargar | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» o «Algo salió mal. Inténtalo de nuevo.» y «Reintentar» | CUS-CAT-001 |
| Recarga que falla | Se conserva la lista anterior y aparece un aviso arriba | CA-CAT-P3 |
| Recargando | Arrastrar para refrescar | CUS-CAT-001 |
| Negocio cerrado | Tarjeta atenuada, logo en gris, «Cerrado · abre [día] [hora]» | CUS-CAT-012, CA-CAT-P2 |
| Negocio sin horario (`is_open_now` nulo) | Se trata como abierto: sin distintivo de cerrado | CUS-CAT-001 |
| Sin sesión | No hay tarjeta de pedido; la bolsa local sí se muestra | CUS-CAT-030 |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-CAT-P1 | Dado un pedido en curso y una bolsa con 2 productos, cuando se abre el Inicio, entonces la bolsa muestra «2» en la barra superior, la tarjeta del pedido está al inicio del contenido y sobre la barra de pestañas no hay ninguna pastilla. | CUS-CAT-030, CUS-CAT-031 |
| CA-CAT-P2 | Dado un negocio con `is_open_now` falso, entonces su tarjeta aparece atenuada con «Cerrado · abre [día] [hora]» y, al tocarla, se abre `catalogo/negocio` con el pedido deshabilitado. | CUS-CAT-012 |
| CA-CAT-P3 | Dado el Inicio con 3 restaurantes cargados, cuando la recarga falla por red, entonces los 3 siguen visibles y aparece el aviso de error. | CUS-CAT-001 |

## Movimiento

Tarjeta de servicio: escala 0,97 y sombra baja al tocar (150–250 ms, `cubic-bezier(.2,.8,.2,1)`); la moto de «Entregas» se
desliza 6 px a la derecha al entrar; el contador de la bolsa rebota al agregar; el ícono del pedido en curso late suave.
Con «reducir movimiento», todo queda estático.

## Pendiente

- El saludo («¿Qué pedimos hoy?» de la maqueta contra «saludar por nombre» de CUS-CAT-002) y la búsqueda y el carrusel de
  la web, que la maqueta no dibuja (CUS-CAT-003, CUS-CAT-020): ver Decisiones para Jesús del PR.
- Texto de cerrado: la maqueta dice «Cerrado · abre mañana 12:00 m.», el código «Cerrado ahora».
