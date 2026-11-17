# CAT · Negocio y carta

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - Sin «i» sobre la foto: fila «Información del negocio ›». Sin contacto en la hoja de información. «Destacados» reutilizable que elige el restaurante, en lugar de «Populares». Contador «− 1 +» fuera de la foto y sin «En bolsa · 1» (CUS-CAT-026 a 029).
> - El requisito `(requisito nuevo: hoja «Información» con … contacto)` de la cabecera pierde el contacto.

> Maquetas: tableros `Negocio`, `Negocio-secciones` (hoja «Todas las secciones») y `Negocio-info` (hoja «Información»).

| | |
|---|---|
| **Tarea de la persona** | Ver la carta de un negocio, saber si puede pedirle y agregar platos a la bolsa. |
| **Se llega desde** | `CAT-inicio` (tarjeta), un enlace `/negocio/{slug}` (CUS-CAT-022), «Volver a pedir» en `ORD-mis-pedidos`, «Agregar más» en `CRT-bolsa`. |
| **Se sale hacia** | Plato → `CAT-plato`. «Ver bolsa» → `CRT-bolsa`. Ícono (i) o fila de estado → hoja «Información». Cuadrícula → hoja «Todas las secciones». Volver → origen. |
| **Requisitos** | CUS-CAT-004, 005, 006, 010, 012, 013, 014, 015, 016, 017, 018, 021, 022 · CUS-CRT-001, CUS-CRT-005 · (requisito nuevo: hoja «Información» con mapa, horarios, cómo lo recibes, cómo pagas y contacto) · (requisito nuevo: hoja «Todas las secciones») |
| **Endpoints** | `GET /public/businesses/{idOrSlug}` (negocio, carta, horario; acepta uuid o slug) · `GET /public/config` (zona de reparto) · (endpoint nuevo: coordenadas del negocio para «Cómo llegar», si la carta no las trae) |
| **Estado** | Android: 🟡 carta con búsqueda, índice de secciones y barra de bolsa; sin portada, sin hoja «Información», sin selector Delivery/Recojo · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Barra superior** (transparente sobre la portada; se vuelve blanca con sombra `e1` tras ~140 px de scroll y entonces
   muestra el nombre y el estado). Volver · «La Florencia» · «Abierto · cierra 10:00 p. m.» · buscar. Sin botón «i» (CUS-CAT-027).
2. **Portada y cabecera del negocio:** foto, nombre, rubro («Pollos a la brasa · Parrillas»), «Abierto · cierra 10:00 p. m.»,
   y, debajo, la fila de 48 dp **«Información del negocio ›»**, que abre la hoja «Información» (reemplaza la línea «Jr. Bolognesi 120 · Info» y el botón «i»).
3. **Dos modos de entrega** (solo los que el negocio acepta; si solo acepta uno, queda fijo, CUS-CAT-017):
   «Delivery» — «[PLAZO] min · [ENVÍO]» y «Recojo» — «En el local».
4. **Selector de secciones** (pegado bajo la barra): «Destacados» · «Pollos» · «Parrillas» · «Combos» · «Guarniciones» ·
   «Bebidas» y un botón de cuadrícula con el total de secciones («6») que abre «Todas las secciones». Tocar una sección
   **lleva** a ella; la visible se resalta sola al hacer scroll.
5. **Secciones de platos.** Cada una: título, «[N] productos» y las filas. «Destacados» es una sección reutilizable (CUS-CAT-028): el restaurante elige los productos y el nombre; carrusel manual de tarjetas con foto, nombre y precio. Una fila: nombre, descripción de una línea, precio «S/ 25.00», foto. Distintivos: «Para compartir». Con unidades en la bolsa, el contador «− 1 +» va **fuera de la foto** y no hay «En bolsa · 1» (CUS-CAT-029). Si el plato tiene opciones obligatorias, el precio dice «Desde
   S/ 46.00» y el botón «Elegir»; si no, tocar la fila agrega o abre el plato.
6. **Pastilla «Ver bolsa»** con contador «2» y «S/ [TOTAL]» (sobre el borde inferior). Solo con la bolsa de este negocio.

### Hoja «Todas las secciones»

Título «Todas las secciones» y «25 productos en La Florencia». Una fila por sección con su cantidad (3, 5, 3, 4, 6); la
actual lleva «Estás aquí» y las demás «Ir a la sección». Se cierra con la X, el scrim o deslizando. Elegir una sección
cierra la hoja y lleva a ella con scroll suave (700 ms, sin resaltado automático durante ese tiempo).

### Hoja «Información»

Cabecera fija (nombre, rubro) y contenido que desplaza: mapa de referencia · dirección «Jr. Bolognesi 120» y «San Jacinto,
Áncash · a una cuadra de la plaza» · «Cómo llegar» (abre la app de mapas) · **«Horarios»** (estado y los siete días, hoy
resaltado y «Cerrado» el día sin turno) · **«Cómo lo recibes»**: «Delivery» («A tu puerta en San Jacinto. Costo: [ENVÍO]»)
y «Recojo en el local» («Lo recoges tú cuando esté listo.») · **«Cómo pagas»**: «Yape», «Plin», «Efectivo» y «Pagas
directo al negocio. Tindivo no retiene tu dinero.» · **sin «Contacto»** (CUS-CAT-026): la hoja no lleva llamar ni WhatsApp ni teléfono.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | «Cargando» (esqueleto de portada y filas) | CUS-CAT-004 |
| Error | «No pudimos cargar el menú» · «Revisa tu señal e inténtalo otra vez.» · «Reintentar» (`Estados`) | CUS-CAT-004 |
| Sin conexión con datos guardados | «Sin conexión. Te mostramos lo último guardado.» | (requisito nuevo: modo sin conexión, T6) |
| Negocio cerrado | «Cerrado ahora.» · «Abre hoy a las 18:00.»; los platos se ven, agregar queda deshabilitado | CUS-CAT-012 |
| Negocio pausado | Pedido deshabilitado con aviso; no afecta al WhatsApp | CUS-CAT-014 |
| Negocio en modo catálogo | «Pedir por WhatsApp» y «Llamar» en lugar de la bolsa | CUS-CAT-015 |
| Plato agotado / fuera de franja | La fila dice «No disponible» (y cuándo vuelve) y no se puede agregar | CUS-CAT-010, CUS-CAT-011 |
| Búsqueda activa | Resultados dentro de la carta; vacío: «No encontramos “[texto]” en [negocio]» y «Prueba con otro nombre, o con un ingrediente…» | CUS-CAT-006 |
| Pedido activo en este negocio | Se enlaza al pedido existente en vez de dejar crear otro | CUS-CAT-018 |
| Bolsa de otro negocio | Al agregar: «¿Empezar una bolsa nueva?» · «Mantener» / «Vaciar y empezar» | CUS-CRT-001 |
| Sin foto del negocio o del plato | Isotipo de Tindivo sobre `#FFF7ED` | PATRONES-V2 §5 |

## Criterios de aceptación propios de la pantalla

```
CA-CAT-P4 · Tocar una sección lleva a ella
  Dado la carta con 6 secciones
  Cuando la persona toca «Combos» en el selector o en la hoja «Todas las secciones»
  Entonces la carta se desplaza a «Combos» y esa sección queda resaltada
  Y durante ~700 ms el resaltado automático por scroll no la cambia

CA-CAT-P5 · La barra superior se compacta al hacer scroll
  Dado la portada visible
  Cuando el scroll supera ~140 px
  Entonces la barra pasa de transparente a blanca con sombra e1 y aparecen el nombre y el estado

CA-CAT-P6 · «Información» muestra el horario con el día de hoy resaltado
  Dado un negocio con turnos por día
  Cuando se abre la hoja «Información»
  Entonces los siete días se listan y hoy lleva «hoy»; el día sin turno dice «Cerrado»
```

## Movimiento

Barra superior y selector: 150–250 ms, `cubic-bezier(.2,.8,.2,1)`. Tocar una sección o elegirla en la hoja desplaza con
scroll suave y apaga el resaltado automático ~700 ms. Cualquier control: escala 0,97. Agregar: la miniatura del plato
vuela a la pastilla «Ver bolsa» y el contador rebota. Las hojas suben 250 ms con el scrim en fundido y se cierran con la
X, el scrim o deslizando. Con «reducir movimiento»: sin animaciones.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** el código no tiene portada, hoja «Información», selector Delivery/Recojo ni la franja «Populares»; sí tiene búsqueda en la carta («Buscar en [negocio]») que la maqueta no dibuja. ¿La búsqueda se mantiene (CUS-CAT-006)?
- **Maqueta ↔ código:** la hoja de secciones del código dice «Ver las [N] secciones de la carta» y cuenta platos; la maqueta añade «Estás aquí / Ir a la sección». No se elige: la maqueta es la propuesta, el código lo que hay.
- Los horarios, el teléfono y «a una cuadra de la plaza» de la maqueta son ejemplos: ¿de dónde sale esa referencia (campo nuevo del negocio)?
- «Para compartir»: ¿lo asigna el negocio o se calcula? («Más pedido» se retira si no hay métrica que lo respalde.)
- «Cómo pagas» lista Yape, Plin y Efectivo por nombre, pero la decisión del 2026-11-16 pide no usar marcas en la opción de pago (`CHK-confirmar-pedido`): ¿se mantienen los nombres en esta hoja?
