# Sistema de diseño Tindivo v1 — app Android del cliente (propuesta)

Estado: **propuesta de trabajo, no es canon** (`Docs/trabajo/` no manda). Autor: Claude (Sonnet 5.5), 16-nov-2026.
Decide Jesús. Marcas: **[med]** medido (código o cálculo) · **[prop]** propuesto · **[mejora]** cambio sobre la web, a
decidir · **[dep]** depende de datos que la API quizá no da · **NO_CONSTA** no verificado.

Fuentes leídas: inventario Android/web del 16-nov (scratchpad de la sesión), `Docs/mobile-ux/{reglas,componentes,
propuestas,revisores,evidencia}.md` (insumo sin rastrear), `apps/android/core/designsystem/*.kt`, el delta del PR #173
(`TindivoBottomBar`, `fillWidth`, `destructive`), `packages/ui/src/{theme,components}.css`, `apps/customer/app/globals.css`
y componentes web citados. Manual de marca (PDF, texto extraído con `pdftotext`): leído el texto; las figuras (logo,
trama, iconos) **no se vieron** (NO_LEÍDO lo visual). Los ratios WCAG son cálculo propio con la fórmula WCAG 2.x
(script `node`, 16-nov), no copiados del manual.

---

## 1. Principios

| # | Principio | Cómo se comprueba |
|---|---|---|
| P1 | **La web manda**: cada pantalla igual a la web en textos, orden de bloques y color; lo distinto se marca **[mejora]**. | Captura web y app lado a lado en el PR. |
| P2 | **Un componente, una vez**: ninguna pantalla arma a mano botón, barra, hoja, chip o tarjeta que exista en `:core:designsystem`. | `grep` en CI: sin `Button(`, `Card(`, `ModalBottomSheet(` de Material fuera del módulo. |
| P3 | **Cero `.dp`/`sp`/`Color(` literales** en pantallas; todo sale de un token con nombre por función. | Lint o `grep` de `\d+\.dp` en `apps/android/customer`. |
| P4 | **El color nunca va solo**: estado = color + palabra (y ícono si ayuda). | Cada `StatusChip`/aviso se entiende en captura en escala de grises. |
| P5 | **Texto legible**: 4,5:1 texto normal, 3:1 texto grande (≥ 18 sp, o ≥ 14 sp en negrita) e íconos que informan. | Test unitario de contraste sobre los pares de §2 (F0). |
| P6 | **Se toca con el pulgar**: todo objetivo táctil ≥ 48 × 48 dp, aunque el dibujo sea menor. | Test de Compose `assertTouchWidth/HeightIsAtLeast(48.dp)`; TalkBack. |
| P7 | **Nada queda bajo la barra del sistema** ni tapado por el teclado (3 botones, gestos, barra de tareas de tablet). | Maestro en la SM-T733 con barra visible (`reglas.md`, «Barras del sistema»). |
| P8 | **Una imagen ausente nunca deja un ícono gris**: respaldo de color con inicial, como la web. | `@Preview` con foto, sin foto y con error de carga. |

---

## 2. Fundamentos (tokens)

Web = `packages/ui/src/theme.css` (línea). Android hoy = `apps/android/core/designsystem/src/main/kotlin/com/tindivo/
core/designsystem/*.kt` (línea).

### 2.1 Color

| Token (rol) | Valor web | Android hoy | Propuesto | Motivo |
|---|---|---|---|---|
| brand | `#f97316` (theme.css:12) | `Palette.Brand #F97316` (TindivoColors.kt:15) | igual | Naranja de marca decidido por Jesús (el manual dice `#FA7020`, p. 14; descartado). |
| brandText (texto/enlace naranja) | `--color-brand-dark #c2410c` (:13) | `brandText = BrandDark #C2410C` (:92) | igual | 5,18:1 sobre blanco y 4,81:1 sobre `#FAF6F1` **[med]**. Nunca `#F97316` como texto (2,61:1 sobre crema). |
| brandSoft | `#fff7ed` (:15) | `#FFF7ED` (:18) | igual | Fondo de chips de opción; `#C2410C` sobre él = 4,88:1. |
| brandLight / gradient-to | `#fed7aa` (:14), `#fb923c` (:23) | NO_EXISTE | añadir solo con la tarjeta de servicio | La web usa `#FB8A3C→#F97316→#C2410C` (restaurants-service-card.tsx:51). |
| ink / inkMuted / inkSubtle | `#1a1614` `#57534e` `#a8a29e` (:26-28) | idénticos (:20-22) | igual; **inkSubtle solo decorativo** | `#A8A29E` sobre crema = 2,34:1 **[med]**: no sirve para texto que informa. |
| surface / surfaceLow / card / border | `#faf6f1` `#f0ebe3` `#fff` `#eae7e2` (:31-35) | idénticos (:24-28) | igual | Paridad. `border` sobre crema 1,15:1: separador, no objeto de interfaz. |
| page | `#eceae5` (:33) | NO_EXISTE (hay `SurfaceMid #F5F1EB`, :26) | **D6** | Dos «fondos intermedios» distintos. |
| onBrand (texto sobre naranja) | `#fff` (components.css:48-52) | `onPrimary = White` (:54) | **D1** | Blanco/`#F97316` = **2,80:1** **[med]**: no llega ni a 3:1. |
| success | `#16a34a` (:38) | `#15803D` (:30) | **D2** | Ver abajo. |
| warning | `#f59e0b` (:40) | `#B45309` (:33) | **D3** | Ver abajo. |
| danger | `#dc2626` (:42) | `#DC2626` (:36) | igual | 4,83:1 sobre blanco; 3,95:1 sobre `DangerSoft`: para texto sobre soft usar `DangerDeep #991B1B` (6,80:1). |
| info, glass | `#0ea5e9` (:44), `rgba(255,255,255,.72/.9)` (:96-98) | NO_EXISTE | no añadir | Sin uso en las pantallas del alcance; Android usa `card` opaco en vez de vidrio. |

**D1 — texto sobre el naranja de marca (botón principal).** Ratios **[med]**:

| Opción | Par | Ratio | Veredicto |
|---|---|---|---|
| A (hoy, decisión de Jesús) | blanco / `#F97316` | 2,80 | No pasa 4,5 ni 3:1. `propuestas.md` §3 M1 ya lo señalaba. |
| B | blanco / `#EA580C` | 3,56 | Pasa texto grande (≥ 18 sp negrita). Mismo matiz, más oscuro. |
| C | blanco / `#C2410C` | 5,18 | Pasa todo, pero el botón deja de verse «naranja Tindivo». |
| D (manual) | carbón `#2E3236` / `#F97316` | 4,61 | Pasa; **descartado por Jesús**. |
| E | blanco / `#D44500` | 4,52 | Pasa; descartado por Jesús. |

Recomendación: **A se mantiene como decisión vigente, anotada como excepción documentada**, con el texto del botón más
grande (hoy `labelLarge` 15 sp Bold, TindivoType.kt:72) y el precio siempre visible. Si Jesús quiere cumplir WCAG sin
tocar la marca, **B en web y Android a la vez** (`propuestas.md` M1: ambas o ninguna).

**D2 — éxito.** A = web `#16A34A`; B = Android `#15803D`. Sobre blanco: 3,30 vs 5,02; sobre `SuccessSoft`: 3,00 vs 4,57;
blanco sobre relleno: 3,30 vs 5,02 **[med]**. Recomendación **B** en texto y relleno (el punto decorativo `#4ADE80` de
restaurants-service-card.tsx:28 no cambia). Si la web no cambia, es **[mejora]**.

**D3 — aviso.** A = web `#F59E0B`; B = Android `#B45309`. Sobre blanco: 2,15 vs 5,02; sobre `WarningSoft`: 1,93 vs 4,51
**[med]**. La web real no usa `#F59E0B` como texto: el banner de cerrado es fondo `warning-soft` con texto `amber-900`
(closed-banner.tsx:26). Recomendación **B para ícono/borde y `WarningDeep #92400E` (6,37:1) para texto**: equivale a lo
que la web ya muestra.

### 2.2 Tipografía

Geist en toda la app (400/500/600/700, manual p. 16-17; Android variable 400-700, TindivoType.kt:11-30). JetBrains Mono
(`--font-mono`, theme.css:49) **no se usa** en la app: en la web aparece en códigos como `#short_id`
(`apps/customer/app/pedidos/page.tsx:253`); los precios usan Geist con `tabular-nums` (menu-item-card.tsx:105,
components.css:168). **D4**: cifras tabulares con Geist (`fontFeatureSettings = "tnum"`), no hay `tnum` hoy en Android.

| Rol | Web (px, theme.css:69-77) | Android hoy (sp/interlínea, TindivoType.kt:60-74) | Propuesto | Motivo |
|---|---|---|---|---|
| display (cifra hero, total) | 28 | displaySmall 28/34 Bold = headlineLarge 28/34 (duplicado) | `display` 28/34 Bold | Un nombre por valor. |
| title | 22 | headlineSmall 22/28 | `title` 22/28 Bold | Paridad. |
| lead (nombre, importe en card) | 17 | titleMedium 17/24 SemiBold | `lead` 17/24 SemiBold | Paridad. |
| body-lg | 15 | titleSmall y labelLarge 15/20 | `bodyLg` 15/20 | Hoy 15 sp tiene dos nombres. |
| body | 14 | bodyMedium 14/20 | igual | Paridad. |
| label | 13 (el más usado, theme.css:72) | NO_EXISTE | **D5** | Web tiene 13, Android no. |
| caption / meta | 12 / 11 | bodySmall y labelMedium 12/16; labelSmall 11/16 | `caption`, `meta` | Duplicado de 12 en Android. |
| micro | 10 (eyebrows en mayúsculas) | NO_EXISTE | **no importar** | 10 sp en `#F97316` (menu-item-card.tsx:85) falla contraste y texto ampliado. **[mejora]**: mínimo 11 sp en `brandText`. |
| campos | 16 (product-modal.tsx:108) | 16 sp (TindivoType.kt:48) | 16 | Igual. |

Texto ampliado: ningún contenedor de texto con altura fija; probar `fontScale` 1,3 y 2,0 (P5).

### 2.3 Forma, espacio, elevación, íconos, tacto

| Token | Web | Android hoy | Propuesto | Motivo |
|---|---|---|---|---|
| radio chico/medio | sm 8, md 12, lg 16 (theme.css:80-82) | 8, 12, 16 (TindivoTheme.kt:15-17) | igual | Paridad. |
| radio tarjeta | **mixto**: plato 20 (menu-item-card.tsx:57), servicio 24 (restaurants-service-card.tsx:51), `.t-card` 22 (components.css:75-79), `xl` 24 | `large` 20 (TindivoTheme.kt:18; TindivoCard.kt:52) | **D7** | La web no es 24 en todo: medido 20/22/24. `componentes.md` propone 24 para todo. |
| radio hoja | 28 arriba (components.css:254) | extraLarge 28 (:19) | igual | Paridad exacta. |
| radio píldora | 999 (components.css:84,142) | sin token | `pill` | Chips, cantidad, botón «+». |
| espaciado | escala Tailwind | hairline 4, tight 8, item 12, screen 16, section 24, hero 32 (:29-34) | igual | `StatusRow.kt` aún usa `8.dp` literal. |
| objetivo táctil | «+» 32 px (menu-item-card.tsx:143), cantidad 32 px (cart-line-item.tsx:85) | touchTarget 48, botón principal 52 (:37,40) | 48 mínimo | **D10 [mejora]** frente a la web. |
| elevación | elev-1..4 (theme.css:88-91); el plato usa elev-1 (menu-item-card.tsx:57) | plano 0 dp + borde 1 dp (TindivoCard.kt:30,52-55); barra fija 8 dp (#173) | **D8** | Sombras de 4-8 % apenas se ven en pantalla; borde + fondo ya separan. |
| ícono | Material Symbols Rounded, 4 ejes (packages/ui/src/primitives/icon.tsx) | 6 vectores a mano (TindivoIcons.kt) | set propio de línea redondeada, 24 dp (20 en chips) | Manual, sección 04 Recursos, p. 18-24 (texto): extremos redondeados, grosor constante. |
| avatar/foto | negocio 72 `rounded-2xl` (business-card.tsx:51); bolsa 48 `rounded-xl` (cart-line-item.tsx:34); plato 92 | literales dispersos | tokens `avatarLg 72`, `avatarMd 48`, `dishThumb 92` | P3. |
| ancho máximo | hoja 768 (components.css:251) | sin límite (la tablet estira a 2 400 px, `propuestas.md`) | **D9** | M3. |
| movimiento | 150/250/400 ms (theme.css:103-105) | NO_EXISTE | 150 ms presión, 250 ms cambios; respeta «quitar animaciones» | Paridad. |

---

## 3. Catálogo de componentes

Estados: N normal · P presionado · D deshabilitado · C cargando · E error. Accesibilidad común: objetivo 48 dp, `role` y
`contentDescription` en español, contraste de §2, color + palabra (P4). Prioridad de lanzamiento: P0 bloquea la paridad
B1, P1 antes del lanzamiento, P2 después.

### 3.1 Existen en `:core:designsystem`

| Componente | Anatomía / variantes / estados | Accesibilidad | Equivalente web | Pri |
|---|---|---|---|---|
| `TindivoPrimaryButton` | 52 dp; ancho completo o `fillWidth=false` (#173); N, P, D, C (spinner, `liveRegion`) | TalkBack lee etiqueta y «en curso» | `.t-btn-primary`, radio 18 (components.css:25-58) | P0 (según D1) |
| `TindivoSecondaryButton` | outlined 1 dp, 52 dp; N, P, D | el borde `Border` es 1,15:1: usar `outline` | `.t-btn-ghost` (components.css:63) | P0 |
| `TindivoTextButton` | texto `brandText`, ≥ 48 dp; `destructive` en rojo (#173) | `error` 4,83:1 | enlaces `text-brand-dark` | P0 |
| `TindivoCard` | blanca, borde 1 dp, radio `large`; estática o clicable | clicable = `Role.Button` | `.t-card` (components.css:75) | P0 |
| `TindivoBottomBar` (#173) | `Surface` + sombra 8 dp + `navigationBarsPadding` + margen 16; texto o contenido libre | P7 por construcción | `.t-sticky-cta` (components.css:223) | P0 |
| `EmptyState`, `ErrorState`, `LoadingState` | ícono 48 dp, título, cuerpo, acción opcional | `LoadingState` anuncia su etiqueta | `cart-empty.tsx` | P0 |
| `StatusRow` | clave-valor, valor en negrita | un nodo «clave: valor» | filas de `order-detail.tsx` | P1 |
| `TindivoTheme`, `TindivoIcons` (6) | tema claro único | descripción obligatoria en íconos | `Icon` (icon.tsx) | P0 |

### 3.2 Faltan

| Componente | Anatomía y variantes | Estados | Accesibilidad | Web (archivo) | Pri |
|---|---|---|---|---|---|
| `TindivoTopBar` | volver 48 dp + título 1 línea con elipsis + acción; variante sobre foto | N, P | «Volver» con nombre; título como encabezado; no se parte («Restaurante / s») | `negocio-shell.tsx`, `home-header.tsx` | P0 |
| `TindivoSheet` + `SheetHeader` | radio 28, asa, título, cerrar 48 dp, cuerpo con scroll, pie con `BottomBar`; máx. 90 % alto y 768 dp ancho | N, C, E (mensaje arriba) | foco al título; atrás del sistema cierra | `.t-modal-sheet` (components.css:249), `section-index-sheet.tsx`, `cart-replace-sheet.tsx` | P0 |
| `TindivoTextField` | etiqueta, campo 16 sp, ayuda, error, teclado; radio 16 | N, foco, D, E | etiqueta enlazada, error leído, `ImeAction` | `.t-field` (components.css:103), `product-modal.tsx:108` | P0 |
| `StatusChip` | píldora 11-12 sp + palabra (+ ícono); abierto, cerrado, aviso, éxito, peligro, neutro, marca | N | P4; `WarningDeep` sobre `WarningSoft` | `business-card.tsx:77-82`, `.t-chip` | P0 |
| `CostSummary` | subtotal, envío, extras, **total** (28 sp) con cifras tabulares a la derecha; línea «falta calcular el envío» | N, C, E | un nodo por fila; total anunciado una vez | `order-detail.tsx`, `cart-sheet-content.tsx` | P0 |
| `BagLine` | miniatura 48 dp (`rounded-xl`) o inicial, nombre, chips de opciones, nota, cantidad, «Eliminar» con ícono | N, P, D (mínimo), E | área 48 dp (dibujo 32); «Quitar X» con nombre; confirmar | `cart-line-item.tsx:34-105` | P0 |
| `QuantityPill` | `−` valor `+` en píldora `ink/6 %`, valor tabular | N, P, D (`−` visible atenuado, M4) | `Role` ajustable: «Cantidad 2» | `.t-qty` (components.css:139), `product-modal.tsx:120-134` | P0 |
| `BusinessImage` / `DishImage` | foto recortada; respaldo = color del negocio + inicial; `placeholder` y `error` de Coil | cargando, ausente, error | decorativa si el nombre está al lado | `business-card.tsx:51`, `menu-item-card.tsx:118` | P0 |
| Tarjeta de plato | nombre 16 Bold, descripción 2 líneas, «Desde S/ X · Personalizable», foto 92 dp a la derecha, «+» circular (área 48); variante compacta (bebidas) | N, P, D (agotado) | tarjeta = botón; «+» como «Agregar X» | `menu-item-card.tsx:57-143`, `menu-compact-row.tsx` | P0 |
| Hoja de plato | foto/respaldo 170 dp, precio, grupos («Obligatorio»→«Listo», «X/Y»), nota con ejemplo, `QuantityPill` + «Agregar · S/ X» o «Completa 1 opción» | N, D→«Completa…», C | grupos como radio/checkbox con estado; error enfoca el grupo | `product-modal.tsx:52`, `modifier-group.tsx` | P0 |
| Cabecera de negocio | foto o degradado, logo 72 dp, «Abierto · cierra 10:00 p. m.» (`StatusChip`), «Llega en 25–35 min», banner ámbar, selector, pestañas | abierto, cerrado, sin foto | estado con palabra; pestañas con `selected` | `business-hero.tsx`, `business-identity.tsx`, `closed-banner.tsx`, `category-tabs.tsx` | P0 (foto panorámica y selector **[dep]**) |
| Tarjeta de negocio | logo 72, nombre `lead`, eslogan, chips; atenuada si cerrado | N, P, cerrado | «Cerrado ahora» en texto, no solo atenuado | `business-card.tsx:38-96` | P0 |
| `Segmented` (Delivery/Recojo) | 2 segmentos 48 dp, seleccionado relleno | N, selec., D | `Role.RadioButton` en grupo | `delivery-mode-switch.tsx` | P1 |
| Tarjeta de servicio | mín. 184 dp, degradado, radio 24, punto verde «X abiertos ahora» | N, P, sin abiertos | punto + palabra; contraste del blanco sobre `#FB8A3C` **NO_MEDIDO** | `restaurants-service-card.tsx:51` | P1 |
| Logo vectorial | `ImageVector` desde los maestros del manual; **nunca con fuente**; isotipo mínimo 32 px, área libre 1x (manual p. 11-12) | n/a | `contentDescription = "Tindivo"` solo si va sin texto | maestros del manual (p. 5-13, 32) | P1 |
| Íconos faltantes | bolsa, ubicación, estrella, WhatsApp, check, editar, borrar, flecha, reloj | n/a | nombres en español | `Icon` (icon.tsx) | P0 |
| `ContentWidth` | contenedor centrado, máx. 640 dp | n/a | n/a | sin equivalente (**[mejora]** M3) | P1 |
| `Banner` (aviso) | fondo `warning-soft`, texto `WarningDeep`, ícono, radio 16, acción opcional | informativo | `liveRegion` tras una acción | `closed-banner.tsx:26`, `cart-validation-banner.tsx` | P1 |
| `Toast` de confirmación | «Agregado» | n/a | anunciado por TalkBack | `added-toast.tsx`, `account-toast.tsx` | P1 |
| Esqueleto de carga | bloques `surfaceLow` | C | oculto a TalkBack | `business-card-skeleton.tsx`, `account-skeleton.tsx` | P2 |
| Estado «sin conexión» | variante de `ErrorState`, reintento, bolsa conservada | E | mensaje + «Reintentar» | NO_CONSTA en la web | P1 |

---

## 4. Pantallas de la app y componentes que usa

Directorios Android bajo `apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/` (existen **[med]**). El
mapa pantalla→componente es **[prop]**. Web en `apps/customer/app/*`.

| Pantalla | Android / web | Componentes |
|---|---|---|
| Inicio | `catalog/home` · `app/page.tsx` | TopBar (logo, dirección), tarjeta de servicio, tarjeta de negocio, `TextField` (buscador), `StatusChip`, `ContentWidth`, esqueleto |
| Negocio / carta | `catalog/business` · `app/negocio` | cabecera de negocio, `Segmented`, pestañas, tarjeta de plato, `Banner` de cerrado, `BottomBar` de bolsa |
| Plato | `catalog/business` (hoja) · `product-modal.tsx` | `Sheet`, hoja de plato, `QuantityPill`, `TextField` (nota), botón principal |
| Bolsa | `cart` · `cart-sheet-content.tsx` | `Sheet` o pantalla, `BagLine`, `CostSummary`, `BottomBar`, `EmptyState` |
| Checkout y hojas | `checkout`, `addresses`, `phone`, `signin` · `app/checkout` | `TopBar`, `TextField`, `Sheet` (dirección, celular, nombre), `CostSummary`, `Segmented`, `Banner`, `BottomBar` con carga |
| Seguimiento | `orders` · `app/pedido` | `TopBar`, `StatusChip` + línea de progreso (**por diseñar**), `StatusRow`, `CostSummary` |
| Comprobante | `orders` (por confirmar) | `CostSummary`, `StatusRow`, `BagLine` solo lectura |
| Mis pedidos | `orders` · `app/pedidos` | tarjeta, `StatusChip`, `EmptyState`, esqueleto |
| Cuenta | `account`, `profile`, `deleteaccount` · `app/cuenta` | `TopBar`, filas de menú, `TextButton` destructivo, `Sheet` de perfil |
| Entregas | `courier` · `app/entregas` | `TopBar`, `TextField`, `CostSummary`, `BottomBar` (ya usa `Tindivo*`) |
| Store | `store` · `app/store` | tarjeta de producto, `BottomBar` de compra (ya usa `Tindivo*`) |
| Actualización obligatoria | `update` · sin equivalente web | variante de `ErrorState` con botón a la tienda |
| Sin conexión | transversal · sin equivalente web | `ErrorState` con reintento |

---

## 5. Plan por fases

PRs chicos por componente o pantalla. Estimaciones **[prop]**, no medidas: S ≈ 1-2 PRs, M ≈ 3-5, L ≈ 6 o más.

| Fase | Contenido | Criterio de aceptación (comprobable) | Tam. |
|---|---|---|---|
| **F0 Fundamentos** | Aprobar D1-D12. Tokens: tipografía con nombres, elevación, `avatar*`, `pill`, `ContentWidth`, `tnum`; quitar literales de `TindivoColors.kt`/`StatusRow.kt`; íconos faltantes; logo vectorial. | (a) test de contraste automático sobre los pares de §2 (los de P5 pasan; D1 documentado); (b) `grep` de `0x[0-9A-F]{8}` fuera de `Palette` = 0; (c) `@Preview` de cada ícono y del logo a 32, 64 y 120 px. | M |
| **F1 Componentes P0** | `TopBar`, `Sheet`+`SheetHeader`, `TextField`, `StatusChip`, `CostSummary`, `BagLine`, `QuantityPill`, `BusinessImage`/`DishImage` (el `BottomBar` ya lo cubre #173). | Cada uno: `@Preview` con N/P/D/C/E, test de Compose de 48 dp, rol y `contentDescription`; Maestro antes/después en la tablet con barra visible sin cambiar el recorrido; piezas armadas a mano del componente migrado = 0. | L |
| **F2 Pantallas B1 (paridad)** | Orden de `propuestas.md` §2: tarjeta de plato, hoja de plato, cabecera de negocio, inicio, bolsa, checkout y hojas, seguimiento/Mis pedidos/cuenta. | Por pantalla: captura web y app lado a lado en `capturas/propuestas/android-<pantalla>-<estado>.png`, mismos textos y orden; Maestro llega a la identificación; respaldo de color probado con foto ausente. Lo **[dep]** solo si el contrato del catálogo ya lo envía. | L |
| **F3 Mejoras M1-M4** | M1 contraste (D1), M2 cuenta en un toque, M3 ancho máximo (D9), M4 «−» visible; más lo **[mejora]** de §2 (D2, D3, D10, mínimo 11 sp). | M1: test ≥ 3:1 (B) o 4,5:1 (C); M2: Maestro + 5 personas llegan al checkout; M3: captura horizontal en SM-T733 con contenido ≤ 640 dp; M4: captura con cantidad 1. Cada una con aprobación escrita de Jesús. | M |
| **F4 Cierre** | CI contra literales y piezas sueltas; pasar lo aprobado al canon (con aprobación). | CI en rojo si reaparece un `Button(` de Material o un literal; documento canon aprobado. | S |

No toca la web, la API, el dinero ni textos legales.

---

## 6. Decisiones para Jesús

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| D1 | Texto sobre el naranja de marca: hoy blanco/`#F97316` = **2,80:1** **[med]**. | A mantener, con excepción documentada · B relleno `#EA580C` (3,56:1) · C `#C2410C` (5,18:1) | **A + excepción**; B solo si quieres cumplir texto grande, y entonces en web y app a la vez. |
| D2 | Verde de éxito. | A web `#16A34A` (3,30:1) · B Android `#15803D` (5,02:1) | **B** en texto y relleno. |
| D3 | Aviso ámbar. | A `#F59E0B` (2,15:1) · B `#B45309` y texto `#92400E` (5,02 / 6,37:1) | **B**; la web ya pone `amber-900` en el texto. |
| D4 | Cifras de precios y cantidades. | A Geist con `tnum` · B JetBrains Mono (hoy en la web solo en `#short_id`) | **A**. |
| D5 | Escala: la web tiene 13 y 10 px que Android no. | A añadir 13/18 · B redondear 13 a 14 · C además no importar 10 px | **B + C**; 13 solo si una pantalla lo exige. |
| D6 | Fondo intermedio: web `#ECEAE5`, Android `#F5F1EB`. | A web · B Android · C solo `surfaceLow` | **C**; decidir tras ver capturas. |
| D7 | Radio de tarjeta: web 20 (plato) / 22 / 24 (servicio), Android 20. | A 20 · B 24 · C por componente (plato 20, servicio 24) | **C**: iguala a la web tal cual está hoy. |
| D8 | Elevación en tarjetas. | A plano con borde · B `elev-1` (1 dp) en plato y negocio | **A**, salvo que las capturas muestren tarjetas «pegadas». |
| D9 | Ancho máximo en tablet. | A 640 dp · B 768 dp (hoja web) · C sin límite | **A** para lectura y 768 para hojas (**[mejora]** M3). |
| D10 | Tamaño táctil: la web usa 32 px en «+», cantidad y papelera. | A área de 48 dp con dibujo de 32 · B copiar 32 | **A** (**[mejora]**, P6). |
| D11 | Orden de trabajo. | A F0→F1→F2→F3 · B F2 primero con piezas locales | **A**: no se rehace cada pantalla dos veces. |
| D12 | Logo vectorial: el PDF no trae los maestros extraíbles. | A Jesús envía los SVG maestros · B se vectoriza desde el webp | **A** (manual p. 32: usar siempre los archivos maestros). |

Pendiente antes de pasar algo al canon: contrastar con `DECISIONS.md` y los ADR que fijen paleta y tipografía (no leídos
en este encargo).
