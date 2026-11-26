# Componentes de la app cliente Android — propuesta

Estado: **propuesta**, no es canon. Base: inventario del código al 14-nov-2026 (`apps/android/core/designsystem` y
`apps/android/customer`). Lo visual fino (sombras, fotos, layout del inicio) espera las capturas de referencia.

## Lo que ya está bien y se conserva

- Tokens de color iguales a la web: naranja `#F97316` con texto blanco en botones; `#C2410C` (`TindivoColors.brandText`)
  para texto y enlaces naranjas sobre claro; tinta `#1A1614`; superficie `#FAF6F1`; tarjeta blanca con borde `#EAE7E2`.
- Geist con su escala, `TindivoSpacing` (4/8/12/16/24/32, toque 48, botón principal 52) y formas 8/12/16/20/28.
- `TindivoPrimaryButton`, `TindivoSecondaryButton`, `TindivoTextButton`, `TindivoCard`, `EmptyState`/`ErrorState`/
  `LoadingState`: existen y son buenos, pero solo los usan Entregas y Store.

## Problema medido

- ~98 botones Material sueltos (48 dp, colores por defecto, sin estado «cargando») frente a los `Tindivo*` (52 dp).
  Los botones de texto sueltos usan `#F97316` sobre claro: no llegan a 4.5:1.
- 5 barras inferiores fijas, cada una con su padding y su sombra; dos olvidaron la barra del sistema (PR #172).
- 7 barras superiores y 5 hojas inferiores armadas a mano; 15 `Card` sueltas; 332 `.dp` literales.
- Chip, avatar de letra y foto sin respaldo repetidos en varias pantallas; Coil sin `placeholder`/`error`.
- Sin logo vectorial (solo un webp) y 6 íconos dibujados; la web usa Material Symbols Rounded.

## Fase A — unificar (no necesita capturas)

Cada componente vive en `:core:designsystem`, con `@Preview` y estados (KT-12). Orden por impacto:

| # | Componente | Sale de | Regla que hace cumplir |
|---|---|---|---|
| 1 | `TindivoBottomBar` (barra de acción fija) | CartBar, CheckoutBottomBar, StoreBuyBar, SaveBar, SubmitBar | Deja siempre el espacio de la barra del sistema; un solo padding, borde superior y elevación |
| 2 | Botones `Tindivo*` en todas las pantallas | ~98 botones sueltos | 52 dp el principal, 48 el resto; texto naranja siempre `#C2410C`; estado cargando |
| 3 | `TindivoTopBar` | MenuTopBar, CheckoutTopBar, CourierTopBar, StoreTopBar y 3 más | Volver con nombre accesible; título que no se parte (el «Restaurante / s» del inicio) |
| 4 | `TindivoSheet` + `SheetHeader` | 5 `ModalBottomSheet` y el `SheetHeader` privado del checkout | Título, cerrar y pie con acción iguales en todas |
| 5 | `CostSummary` (resumen de costos) | `AmountRow` del checkout, `OrderTotals` | Subtotal, envío y total alineados; precios con cifras tabulares |
| 6 | `BagLine` (fila de la bolsa) | `CartLineRow`, `BagLine` del checkout | Cantidad con botones de 48 dp; quitar con confirmación |
| 7 | `StatusChip` | `Chip` del inicio, `StoreBadgeChip`, chips de direcciones | Abierto/cerrado/estado del pedido con color y texto, no solo color |
| 8 | `TindivoTextField` | ~19 campos sueltos | Etiqueta, ayuda, error y teclado correcto |
| 9 | `BusinessImage`/`DishImage` | avatares de letra y respaldo del plato | Un solo respaldo para URL nula y para error de carga |
| 10 | Tokens que faltan | `.dp` literales | Elevación, tamaños de ícono y de avatar |

Cada paso es un PR chico que no cambia comportamiento; Maestro corre antes y después con la barra de tareas visible.

## Fase B — estilo (con las capturas de referencia)

- Tarjeta de negocio y fila de plato con foto real, horario y tiempo/envío estimado.
- Sombras o plano: Android hoy es plano con borde; la web tiene escala de sombras.
- Íconos: dibujar el subconjunto de Material Symbols Rounded que usa la web (bolsa, ubicación, estrella, WhatsApp,
  check, editar, borrar, flecha), sin meter la librería entera.
- Logo vectorial desde el manual de marca (página 7), nunca escrito con la fuente.

## Decisiones para Jesús

1. Radio de tarjeta: Android usa 20 y la web 24. Propuesta: 24 en ambos.
2. Cifras de precios: la web usa JetBrains Mono. Propuesta en Android: Geist con cifras tabulares, sin otra fuente.
