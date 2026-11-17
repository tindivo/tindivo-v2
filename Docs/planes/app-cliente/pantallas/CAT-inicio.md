# CAT · Inicio

> Maqueta: canvas «Tindivo app — pantallas», tablero `Main` (capturas en `tindivo-auditorias/2026-11-16-ux-movil/v3/`).
> Es la primera pestaña de la barra inferior y la puerta a los tres servicios.

| | |
|---|---|
| **Tarea de la persona** | Elegir qué pedir hoy: un restaurante, Tindivo Entregas o Tindivo Store; retomar su pedido en curso o su bolsa. |
| **Se llega desde** | Apertura de la app (pestaña raíz). Volver desde Negocio, Bolsa, Seguimiento, Entregas o Store. Tras «Aceptar y continuar» en `AUT-terminos-actualizados`. |
| **Se sale hacia** | Tarjeta de restaurante → `CAT-negocio`. «Entregas» → `ENT-pedir-entrega`. «Store» → `STO-catalogo`. Pastilla de pedido «Ver» → `TRK-seguimiento`. Pastilla «Ver bolsa» → `CRT-bolsa`. Dirección «Entregar en» → hoja `ADR-elegir-direccion`. Barra inferior → `ORD-mis-pedidos`, `ACC-cuenta`. |
| **Requisitos** | CUS-CAT-001, CUS-CAT-002, CUS-CAT-012, CUS-CAT-015, CUS-CAT-019, CUS-CRT-004 (bolsa guardada) · (requisito nuevo: pastilla «Ver bolsa» con contador y total sobre la barra inferior) · (requisito nuevo: encabezado «Entregar en» con la dirección vigente) |
| **Endpoints** | `GET /public/businesses` (lista, `is_open_now`, ETA) · `GET /customer/orders` (pedido en curso, con sesión) · `GET /customer/orders/{id}` (sondeo cada 8 s del pedido en curso) · ningún endpoint nuevo: el «pedido en curso» sale de la misma lista de `ORD` |
| **Estado** | Android: 🟡 existe una portada «Restaurantes» con tarjetas de Entregas y Store, pero sin barra inferior, sin encabezado de dirección y sin pastillas · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Encabezado.** «Entregar en» y debajo la dirección vigente, «Jr. Lima 214, San Jacinto». Tocarla abre `ADR-elegir-direccion` (la maqueta no dice si es tocable: ver Pendiente). Sin sesión o sin dirección, no se muestra.
2. **Saludo:** «¿Qué pedimos hoy?» (título único; sin nombre de la persona).
3. **Dos tarjetas de servicio**, una junto a otra:
   - «Entregas» · «De A a B, ya pagado» · distintivo «ÚNICO» · moto que se desliza al entrar.
   - «Store» · «Piezas únicas».
4. **«Restaurantes»** · «[N] abiertos ahora» (ej. «3 abiertos ahora»). Una tarjeta por negocio:
   - Abierto: nombre, rubro («Pollos a la brasa · Parrillas»), «Abierto» y «25–35 min».
   - Cerrado: la tarjeta se atenúa y dice «Cerrado · abre mañana 12:00 m.» (CUS-CAT-012).
   - Negocio en modo catálogo (`catalog_only`): se ofrece «Pedidos por WhatsApp» en lugar de ETA (CUS-CAT-015; el código ya lo hace, la maqueta no lo dibuja).
5. **Pastilla de pedido en curso** (flotante, sobre la barra inferior): «Tu pedido va en camino» · «La Florencia · llega en 8–12 min» · «Ver». El ícono late suave. Solo si hay un pedido activo (CUS-CAT-019).
6. **Pastilla de bolsa** (flotante, bajo la anterior): contador «2», «Ver bolsa» y «S/ [TOTAL]». Solo si la bolsa tiene productos.
7. **Barra inferior fija:** «Inicio» · «Entregas» · «Pedidos» · «Cuenta». Inicio activa.

Lo fijo es la barra inferior y las dos pastillas; todo lo demás desplaza.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | «Cargando»; la maqueta no define esqueletos (patrón de la app: esqueletos `#E0E4E8`) | CUS-CAT-001 |
| Sin restaurantes | «Aún no hay restaurantes disponibles.» (texto del código; la maqueta `Estados` solo define «Aún no tienes pedidos») | CUS-CAT-001 |
| Error al cargar | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» o «Algo salió mal. Inténtalo de nuevo.» + «Reintentar» | CUS-CAT-001 |
| Recarga que falla | Se conserva la lista anterior y aparece un aviso arriba | CUS-CAT-001 |
| Recargando | Arrastrar para refrescar | CUS-CAT-001 |
| Negocio cerrado | Tarjeta atenuada, logo en gris, «Cerrado · abre mañana 12:00 m.» (el código hoy dice «Cerrado ahora») | CUS-CAT-012 |
| Negocio sin horario (`is_open_now = null`) | Se trata como abierto: sin distintivo de cerrado | CUS-CAT-001 |
| Sin sesión | No hay pastilla de pedido; la bolsa local sí se muestra | CUS-AUT-001 |
| Versión obsoleta (426) | Se sustituye toda la app por «Actualiza la app» | (requisito nuevo: actualización obligatoria) |
| Sistema operativo antiguo | Aviso descartable «Tu Android es antiguo» | (requisito nuevo: aviso de Android antiguo) |

## Criterios de aceptación propios de la pantalla

```
CA-CAT-P1 · Las dos pastillas no tapan la barra inferior ni el contenido
  Dado un pedido en curso y una bolsa con 2 productos
  Cuando la persona abre Inicio
  Entonces ve la pastilla de pedido y la de bolsa sobre la barra inferior
  Y la lista de restaurantes deja un hueco final igual a lo fijo + 16 dp (PATRONES-V2 §4)

CA-CAT-P2 · Un negocio cerrado se ve pero no se descarta
  Dado un negocio con is_open_now = false
  Entonces su tarjeta aparece atenuada con «Cerrado · abre [día] [hora]»
  Y al tocarla se abre CAT-negocio con el pedido deshabilitado (CUS-CAT-012)

CA-CAT-P3 · Una recarga fallida no borra la lista
  Dado Inicio con 3 restaurantes cargados
  Cuando la recarga falla por red
  Entonces los 3 restaurantes siguen visibles y aparece el aviso de error
```

## Movimiento

Tarjeta de servicio: escala 0,97 y sombra baja al tocar (150–250 ms, `cubic-bezier(.2,.8,.2,1)`). La moto de «Entregas»
se desliza 6 px a la derecha al entrar. Las pastillas suben desde abajo. El contador de la bolsa rebota al agregar un
producto. El ícono del pedido en curso late suave. Con «reducir movimiento» todo queda estático.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta tiene barra inferior de 4 pestañas, encabezado «Entregar en» y las dos pastillas; el código Android no tiene ninguna (entra por una portada «Restaurantes» con un ícono de cuenta y las tarjetas de Entregas y Store). Es una pantalla nueva, no un ajuste.
- **Maqueta ↔ código:** la maqueta saluda «¿Qué pedimos hoy?»; CUS-CAT-002 pide saludar por nombre y el código no saluda. No elegir: confirmar con Jesús.
- La **búsqueda** de negocios y platos (CUS-CAT-003) y el **carrusel de promociones** (CUS-CAT-020) no están en la maqueta v3: ¿se quitan o se dibujan?
- ¿«Entregar en» es tocable? La maqueta no dice qué pasa sin dirección ni sin sesión.
- Texto de «cerrado»: maqueta «Cerrado · abre mañana 12:00 m.», código «Cerrado ahora».
