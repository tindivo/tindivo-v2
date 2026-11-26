# ADR · Elegir dirección

> Maqueta: hoja `Direccion-elegir`, «¿Dónde entregamos?», sobre el checkout atenuado.

| | |
|---|---|
| **Tarea de la persona** | Escoger a cuál de sus direcciones guardadas se entrega este pedido, o crear una nueva. |
| **Se llega desde** | `CHK-confirmar-pedido` → «Cambiar» en la tarjeta de entrega, o «Agrega tu dirección» (CUS-CHK-005). `CAT-inicio` → «Entregar en». `ENT-pedir-entrega` (elegir recojo/entrega). |
| **Se sale hacia** | Tocar una fila → la hoja se cierra a los 200 ms y el checkout queda con esa dirección. El lápiz de una fila → `ADR-mapa` con la dirección cargada. «Nueva dirección» → `ADR-mapa` vacío. |
| **Requisitos** | CUS-ADR-001, 009, 010, 012 ★, 015 · CUS-CHK-005, CUS-CHK-013 · (requisito nuevo: la elección de dirección y el cálculo del envío ocurren dentro del checkout en una hoja) |
| **Endpoints** | `GET /customer/addresses` · `POST /customer/checkout/quote` (envío y total del punto elegido; el envío se recalcula al cambiar de dirección) · `PATCH /customer/addresses/{id}` (hacer predeterminada) |
| **Estado** | Android: 🟡 lista «Mis direcciones» en pantalla completa y selector del checkout con «Elige tu dirección» / «Agregar nueva»; no es la hoja v3 · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Título:** «¿Dónde entregamos?»
2. **Una fila por dirección guardada**, con botón de selección (radio) y lápiz de editar:
   - «Casa» · insignia «Principal» · «Jr. Lima 214» · «Puerta verde, frente a la plaza».
   - «Trabajo» · «Jr. Sucre 412» · «Frente a la bodega de don Carlos».
   La seleccionada se resalta (borde y fondo naranja suave).
3. **«Nueva dirección»:** fila al final (abre `ADR-mapa`).

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando | «Cargando» | CUS-ADR-010 |
| Sin direcciones | «Añade tu primera dirección» · «Guárdala una vez y úsala siempre para recibir tus pedidos de forma rápida.» + «Añadir» (código) | CUS-ADR-010 |
| Error | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» / «Algo salió mal. Inténtalo de nuevo.» + «Reintentar» | CUS-ADR-010 |
| Dirección sin calle | «Falta calle» y se pide corregirla antes de usarla | CUS-ADR-001 |
| Dirección sin punto en el mapa | «Sin ubicación» · «Sin punto en el mapa. Márcalo para que el motorizado no se pierda.» | CUS-ADR-003 |
| Dirección sin confirmar | «El punto del mapa no está confirmado» | CUS-ADR-011 |
| Dirección fuera de zona | No se puede elegir; se avisa y se ofrece corregirla | CUS-ADR-003 |
| Una sola predeterminada | Solo una fila lleva «Principal»; al borrarla se promueve la primera restante | CUS-ADR-009 |
| Selección hecha | Fila resaltada y la hoja se cierra a los 200 ms con el checkout ya actualizado | CUS-CHK-005 |
| Envío recalculado | Esqueleto en «Envío» y «Total» del checkout hasta que `quote` responde | CUS-ADR-012 |

## Criterios de aceptación propios de la pantalla

```
CA-ADR-P1 · Elegir cierra y actualiza
  Dado la hoja con «Casa» y «Trabajo»
  Cuando la persona toca «Trabajo»
  Entonces la fila se resalta, la hoja se cierra a los 200 ms
  Y el checkout muestra «Jr. Sucre 412» y recalcula el envío

CA-ADR-P2 · Solo una dirección es principal
  Dado dos direcciones guardadas
  Entonces exactamente una lleva la insignia «Principal»

CA-ADR-P3 · El lápiz edita sin elegir
  Dado la hoja abierta
  Cuando la persona toca el lápiz de «Casa»
  Entonces se abre el mapa con «Casa» cargada y la selección actual no cambia
```

## Movimiento

La hoja sube 250 ms con la curva estándar y el fondo se atenúa. Tocar una fila la resalta (borde y fondo naranja suave), marca
el radio y la hoja se cierra a los 200 ms. El lápiz abre la hoja del mapa con la dirección cargada. Con «reducir movimiento»:
sin animaciones.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** el código tiene la lista completa en pantalla propia («Mis direcciones», con «Hacer predeterminada», «Editar», «Añadir otra dirección») además del selector del checkout; la maqueta solo dibuja la hoja de elección con lápiz. ¿Hacer predeterminada se hace desde aquí?
- **Maqueta ↔ código:** el código usa «Elige tu dirección» y «Agregar nueva»; la maqueta, «¿Dónde entregamos?» y «Nueva dirección».
- Eliminar una dirección (confirmación «¿Eliminar esta dirección?») no aparece en la maqueta de la hoja.
- Si la bolsa es de recojo, esta hoja no se abre (CUS-ADR-014).
