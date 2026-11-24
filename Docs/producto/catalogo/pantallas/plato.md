---
canvas: [Plato, Plato-sinfoto, Plato-listo]
requisitos: [CUS-CAT-007, CUS-CAT-008, CUS-CAT-009, CUS-CAT-010, CUS-CAT-011, CUS-CAT-033, CUS-CAT-034, CUS-CRT-001, CUS-CRT-002, CUS-CRT-011]
operaciones: []
textos: []
tokens: []
codigo:
  web: [apps/customer/features/catalog/components/product-modal.tsx, apps/customer/features/catalog/components/modifier-group.tsx, apps/customer/features/catalog/hooks/use-product-options.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/DishPage.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/DishContent.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/DishBottomBar.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/DishSheetGroups.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/DishSheetState.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/business/DishWindow.kt]
  ios: []
---

# Plato

| | |
|---|---|
| **Tarea de la persona** | Elegir las opciones del plato, dejar una nota y agregarlo a la bolsa con el total claro. |
| **Se llega desde** | `catalogo/negocio` (tocar una fila o «Elegir»), incluido un resultado de la búsqueda dentro de la carta. |
| **Se sale hacia** | «Agregar» → `catalogo/negocio` con la bolsa actualizada. Volver → `catalogo/negocio` sin cambios. Con la bolsa de otro negocio: diálogo y luego lo anterior. |

## Contenido, de arriba abajo

1. **Foto** grande, parte de la página, que colapsa al hacer scroll; sobre ella, volver (el botón compartir no entra: DA-17). Sin foto, el isotipo
   de Tindivo sobre `#FFF7ED`.
2. **Barra compacta** (invisible en reposo): aparece al colapsar la foto, blanca con sombra: volver · nombre.
3. **Nombre, descripción y precio** («S/ 46.00»).
4. **Progreso:** «1 de 2 listas» (grupos obligatorios resueltos).
5. **Grupos de opciones**, uno bajo otro: título y ayuda; estado «Obligatorio · elige 1» → «Listo» con check, u «Opcional ·
   hasta 2»; opciones con radio (una) o casilla (varias), con su descripción y su recargo «+ S/ 3.00». Elegida, la
   tarjeta pasa de blanco a `#FFF7ED`. El grupo de tamaño muestra el precio completo de cada tamaño y el texto «El precio
   es el del tamaño»; los extras muestran su recargo (CUS-CAT-034). Todos los campos llevan el mismo borde (CUS-CAT-033).
6. **«Nota para el negocio» (opcional)**, campo de una línea, hasta `CART_MAX_NOTE_LENGTH` caracteres (CUS-CAT-009).
7. **Barra inferior fija:** selector de cantidad y botón de 56 dp. El botón **nunca se apaga**. Falta una elección
   obligatoria: el botón dice qué falta («Elige tu guarnición 2»), y al tocarlo la página baja a ese grupo y lo resalta
   (solo los grupos obligatorios cuentan, CUS-CAT-033). Todo resuelto: «Agregar · S/ [TOTAL]», con (precio base +
   recargos) × cantidad. Decisión de Jesús, 2026-11-23: aprobó la auditoría de UX de Fable, cuya regla §4 dice «El primario
   no se deshabilita en gris: dice lo que falta y lleva ahí» (`tindivo-auditorias/2026-11-23-auditoria-ux-fable/auditoria.md`,
   §4 y «Decisión de Jesús»); sustituye al botón gris del canvas.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Faltan elecciones obligatorias | El botón (no apagado) dice «Elige tu [grupo]»; tocarlo desplaza hasta el primer grupo faltante y lo resalta con borde de error y «Falta elegir aquí» | CUS-CAT-033, CA-CAT-P7 |
| Todo elegido | Botón naranja «Agregar · S/ [TOTAL]»; el total cuenta hacia el nuevo monto | CUS-CAT-009, CA-CAT-P8 |
| Plato sin foto | Isotipo sobre `#FFF7ED`, igual que en la carta | CUS-CAT-007 |
| Plato agotado | Aviso «No disponible» y botón deshabilitado | CUS-CAT-010 |
| Fuera de franja horaria | El plato aparece apagado con la hora a la que vuelve | CUS-CAT-011 |
| Máximo de opciones del grupo | Las demás opciones quedan deshabilitadas hasta quitar una | CUS-CAT-008 |
| Cantidad al máximo | «Una más» deshabilitado | CUS-CAT-009, CUS-CRT-011 |
| Bolsa de otro negocio | «¿Empezar una bolsa nueva?» · «Mantener» / «Vaciar y empezar» | CUS-CRT-001 |
| Bolsa llena | «Tu bolsa ya tiene [N] platos distintos: es el máximo por pedido» | CUS-CRT-011 |
| Tope por plato | «Ya tienes [N] de este plato: es el máximo por pedido» | CUS-CRT-011 |
| No se pudo guardar | «No se pudo guardar tu bolsa. Inténtalo de nuevo.» | CUS-CRT-002 |
| Agregado | «Agregado a tu bolsa» (aviso de región viva: TalkBack lo lee) | CUS-CRT-002 |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-CAT-P7 | Dado «Pollo entero» con «Guarnición 1» resuelta y «Guarnición 2» obligatoria sin elegir, entonces el botón inferior sigue activo y dice «Elige tu guarnición 2», y al tocarlo la pantalla se desplaza a ese grupo y lo resalta (decisión de Jesús, 2026-11-23: el primario no se deshabilita en gris). | CUS-CAT-033, CUS-CAT-008 |
| CA-CAT-P8 | Dado el estado anterior, cuando se elige «Ensalada fresca» y una opción con «+ S/ 3.00», entonces el botón pasa a «Agregar · S/ 49.00», y «1 de 2 listas» pasa a «2 de 2 listas». | CUS-CAT-008, CUS-CAT-009 |
| CA-CAT-P9 | Dado base S/ 46.00, una opción de + S/ 3.00 y cantidad 2, entonces el botón dice «Agregar · S/ 98.00» y el servidor recalcula el mismo importe al pedir. | CUS-CAT-009, CUS-CAT-034 |

## Movimiento

Al hacer scroll la foto sube y se achica (parallax 0,5×); al llegar al nombre aparece la barra compacta. Elegir una opción:
el radio se rellena con rebote de 150 ms y «Obligatorio» cambia a «Listo» con un check que se dibuja. Al completar lo
obligatorio el botón pasa de gris a naranja con un pulso de escala 1,03 y el total cuenta hacia el nuevo monto. Agregar:
la foto vuela a la pastilla de bolsa. Con «reducir movimiento»: sin parallax ni vuelo, solo cambios de color.

## Pendiente

- «Compartir» no tiene destino ni requisito (DA-17 de `Docs/trabajo/decisiones-abiertas.md`): el botón no se dibuja hasta que se defina.
- La etiqueta de la nota («Nota para el negocio» en el canvas; «Nota (opcional)» y un ejemplo con «tocar timbre» en el código):
  el ejemplo habla del motorizado, no del negocio.
- Las opciones sin recargo dicen «Incluido» en el código; el canvas no dibuja nada.
