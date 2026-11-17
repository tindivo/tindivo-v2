# CAT · Plato

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - Solo los grupos obligatorios bloquean el botón; todos los campos llevan el mismo borde (CUS-CAT-033).
> - El tamaño se muestra con su precio completo (`price_display = 'total'`, migración `0156`; «El precio es el del tamaño») y los extras suman con `delta` («+ S/ 2.00») (CUS-CAT-034). Maqueta `Plato`: Personal S/ 13.00 · Mediano S/ 26.00 · Grande S/ 35.00; el botón dice «Elige el tamaño» hasta resolverlo.

> Maquetas: tableros `Plato` (faltan elecciones), `Plato-sinfoto` (respaldo sin foto) y `Plato-listo` (todo elegido).

| | |
|---|---|
| **Tarea de la persona** | Elegir las opciones del plato, dejar una nota y agregarlo a la bolsa con el total claro. |
| **Se llega desde** | `CAT-negocio` (tocar una fila o «Elegir»). Resultado de búsqueda dentro de la carta. |
| **Se sale hacia** | «Agregar» → vuelve a `CAT-negocio` con la bolsa actualizada (la miniatura vuela a «Ver bolsa»). Volver → `CAT-negocio` sin cambios. Si la bolsa es de otro negocio: diálogo y luego lo anterior. |
| **Requisitos** | CUS-CAT-007, CUS-CAT-008 ★, CUS-CAT-009 ★, CUS-CAT-010, CUS-CAT-011, CUS-CRT-001, CUS-CRT-002, CUS-CRT-011 · (requisito nuevo: pantalla completa con foto que colapsa, en lugar de hoja) · (requisito nuevo: compartir el plato) |
| **Endpoints** | Ninguno propio: el plato y sus opciones vienen de `GET /public/businesses/{idOrSlug}`. Agregar es local (bolsa en el dispositivo); el servidor recalcula y revalida al pedir. |
| **Estado** | Android: 🟡 hoja modal con opciones, nota, cantidad y «Agregar · S/»; sin foto que colapse ni compartir · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Foto** grande, parte de la página: colapsa al hacer scroll. Sobre ella, botones fijos de volver y compartir. Sin foto:
   isotipo de Tindivo sobre `#FFF7ED` (`Plato-sinfoto`).
2. **Barra compacta** (invisible en reposo): aparece al colapsar la foto, blanca con sombra `e2`: volver · «Pollo entero» ·
   compartir. El nombre grande se desvanece.
3. **Nombre, descripción y precio:** «Pollo entero» · «Para 4 personas, con cremas de la casa. Elige tus 2 guarniciones.» ·
   «S/ 46.00».
4. **Progreso:** «1 de 2 listas» (cuenta los grupos obligatorios resueltos; con todo resuelto dice «2 de 2 listas»).
5. **Grupos de opciones**, uno bajo otro:
   - Título del grupo y su ayuda: «Guarnición 1» · «Acompaña tu pollo».
   - Estado del grupo: «Obligatorio · elige 1» → al resolverlo, «Listo» con check. Un grupo opcional dice «Opcional · hasta 2».
   - Opciones: radio (elige una) o casilla (varias). Cada una con su nombre, su descripción de una línea si la tiene
     («Con un toque de ají amarillo») y su recargo «+ S/ 3.00». Elegida: la tarjeta pasa de blanco a `#FFF7ED`.
   - Ejemplos de la maqueta: «Papas fritas» · «Papas nativas»; «Ensalada fresca» · «Arroz chaufa»; «Cremas de la casa»
     («Suma sabor si quieres», «Opcional · hasta 2»): «Ají de la casa» · «Mayonesa» · «Salsa de rocoto».
6. **«Nota para el negocio»** «(opcional)», campo de una línea; máximo 140 caracteres (CUS-CAT-009).
7. **Barra inferior fija:** selector de cantidad (1) y botón.
   - Falta una elección obligatoria: botón gris con el nombre del grupo pendiente, «Elige la guarnición 2».
   - Todo resuelto: «Agregar» · «S/ 49.00» (precio base + recargos) × cantidad, botón naranja con sombra.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Faltan elecciones obligatorias | Botón gris «Elige la [grupo]»; tocarlo desplaza hasta el primer grupo faltante y lo sacude | CUS-CAT-008 |
| Todo elegido | Botón naranja «Agregar · S/ [TOTAL]»; el total cuenta hacia el nuevo monto | CUS-CAT-009 |
| Plato sin foto | Isotipo sobre `#FFF7ED`, igual que en la carta | PATRONES-V2 §5 |
| Plato agotado | Aviso «No disponible» y botón deshabilitado | CUS-CAT-010 |
| Fuera de franja horaria | El plato aparece apagado con la hora a la que vuelve | CUS-CAT-011 |
| Máximo de opciones del grupo | Las demás opciones quedan deshabilitadas hasta quitar una | CUS-CAT-008 |
| Cantidad al máximo (50) | «Una más» deshabilitado | CUS-CAT-009, CUS-CRT-011 |
| Bolsa de otro negocio | «¿Empezar una bolsa nueva?» · «Mantener» / «Vaciar y empezar» | CUS-CRT-001 |
| Bolsa llena | «Tu bolsa ya tiene [N] platos distintos: es el máximo por pedido» | CUS-CRT-011 |
| Tope por plato | «Ya tienes [N] de este plato: es el máximo por pedido» | CUS-CRT-011 |
| No se pudo guardar | «No se pudo guardar tu bolsa. Inténtalo de nuevo.» | CUS-CRT-004 |
| Añadido | «Añadido a tu bolsa» | CUS-CRT-002 |

## Criterios de aceptación propios de la pantalla

```
CA-CAT-P7 · El botón dice qué falta
  Dado «Pollo entero» con «Guarnición 1» resuelta y «Guarnición 2» obligatoria sin elegir
  Entonces el botón inferior está gris y dice «Elige la guarnición 2»
  Y al tocarlo la pantalla se desplaza al grupo «Guarnición 2» y este se sacude suave

CA-CAT-P8 · Completar lo obligatorio habilita y recalcula
  Dado el estado anterior
  Cuando la persona elige «Ensalada fresca» y una opción con «+ S/ 3.00»
  Entonces el botón pasa a naranja y dice «Agregar · S/ 49.00»
  Y «1 de 2 listas» pasa a «2 de 2 listas»

CA-CAT-P9 · El precio de la línea es (base + opciones) × cantidad
  Dado base S/ 46.00, una opción de + S/ 3.00 y cantidad 2
  Entonces el botón dice «Agregar · S/ 98.00»
  Y el servidor recalcula el mismo importe al pedir (CUS-CAT-009)
```

## Movimiento

Al hacer scroll la foto sube y se achica (parallax 0,5×); al llegar al nombre aparece la barra compacta (`e2`). Elegir una
opción: el radio se rellena con rebote de 150 ms y la tarjeta pasa de blanco a `#FFF7ED`; «Obligatorio» cambia a «Listo»
con un check que se dibuja. Al completar lo obligatorio el botón pasa de gris a naranja con un pulso de escala 1,03 y
aparece la sombra naranja; el total cuenta hacia el nuevo monto. Agregar: la foto vuela a la pastilla de bolsa y su
contador rebota. Con «reducir movimiento»: sin parallax ni vuelo, solo cambios de color.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta es una pantalla completa con foto que colapsa; el código es una **hoja modal** que se abre a pantalla completa (`skipPartiallyExpanded`) y la foto es una cabecera fija. No se elige: ¿hoja o pantalla?
- **Maqueta ↔ código:** etiqueta de la nota, «Nota para el negocio (opcional)» en la maqueta; «Nota (opcional)» con ejemplo «Ej. sin cebolla, bien cocido, tocar timbre 2 veces…» y contador en el código. El ejemplo del código habla de «tocar timbre», que es para el motorizado, no para el negocio.
- **Maqueta ↔ código:** el progreso «1 de 2 listas» no existe en el código (usa «Obligatorio»/«Listo» por grupo y un contador `1/2` en cada grupo con tope).
- «Compartir» no tiene destino definido ni requisito.
- El código muestra «Incluido» en las opciones sin recargo; la maqueta no dibuja nada.
