# Sistema de diseño: tokens de las apps nativas

> Verificado: 2026-11-19 · entorno: `develop@25a6d537` (contrastes recalculados con la fórmula WCAG 2.x el 2026-11-17; `packages/design-tokens/tokens.json` se escribe a mano a partir de este documento y un test compara sus valores con las tablas de §2 a §5)
> Fuente: decisión de Jesús, 2026-11-18 (manda el sistema de diseño del 16-nov; iOS y Android salen de aquí, no de los valores previos de Android)
> La marca y los principios: `Docs/negocio/diseno.md`. Este documento es la fuente de los **tokens**; los componentes, el movimiento y las imágenes siguen en `Docs/trabajo/app-cliente/de-arquitectura/sistema-de-diseno.md` (§6 en adelante) hasta que se promuevan.

Cómo se usa: `packages/design-tokens/tokens.json` (escrito a mano, con los mismos nombres que aquí; un test lo compara con las tablas) produce CSS, Kotlin y Swift con
`pnpm tokens:build`. Android hoy no los consume y difiere en lo que lista `packages/design-tokens/src/__tests__/android-parity.test.ts`;
se ajusta en sus PRs de diseño.

> Android, 2026-11-21 (decisión de Jesús): la app Android ya usa los valores de esta tabla (fondo `#F7F8FA`, tinta `#2E3236`, `inkSecondary`, `inkTertiary`, `outline`, `outlineVariant`, `surfaceSunken`, `primaryPressed`, tarjeta con `elevation1` sin borde, `ctaHeight` 56) con una sola excepción: **`primary` se queda en `#F97316`** en Android. Éxito, aviso y error no cambian.

## 1. Nombres estables de los tokens

Cada token tiene **un nombre lógico en camelCase, igual en Compose y en SwiftUI**. Solo cambia dónde se accede a él:

| Plataforma | Cómo se escribe `primary` |
|---|---|
| Compose | `MaterialTheme.colorScheme.primary` o `TindivoColors.<nombre>` para los que Material no tiene |
| SwiftUI | `Color.tindivo.primary` (paquete `TindivoDesign`) |

Un token se renombra en las dos plataformas y en este documento **a la vez**. Un valor suelto (un `Color(` o un `.dp`
literal) en una pantalla indica que falta un token aquí.

## 2. Color

### 2.1 Tabla de tokens y contraste

Contrastes **medidos** (WCAG 2.x, luminancia relativa) el 2026-11-17.

| Token | Valor | Uso | Contraste |
|---|---|---|---|
| `primary` | `#EE6417` | Relleno del CTA, FAB, íconos activos, chip seleccionado, progreso | blanco encima 3,25 · sobre `background` 3,05 |
| `primaryPressed` | `#CF4A0C` | CTA presionado | blanco encima 4,53 |
| `onPrimary` | `#FFFFFF` | Texto sobre `primary`: **solo ≥ 18 px en negrita (700) o ≥ 24 px** | 3,25 (cumple WCAG de texto grande, 3:1) |
| `primaryText` | `#C2410C` | Texto naranja pequeño: enlaces, «Cambiar», precio destacado | 5,18 sobre blanco · 4,87 sobre `background` |
| `brand` | `#FA7020` | Solo logo, ilustraciones y degradados decorativos; nunca única señal ni fondo de texto | blanco encima 2,84 (no pasa): sin texto |
| `primaryContainer` | `#FFF7ED` | Fondo suave de íconos y banners | — |
| `onPrimaryContainer` | `#9A3412` | Texto sobre `primaryContainer` | 6,88 |
| `secondary` | `#2E3236` | Botón carbón, chip seleccionado, snackbar | 12,92 con `onSecondary` |
| `onSecondary` | `#FFFFFF` | Texto sobre `secondary` | — |
| `ink` | `#2E3236` | Texto principal | 12,16 sobre `background` · 12,92 sobre `surface` |
| `inkSecondary` | `#50565D` | Texto secundario, apoyo | 6,98 / 7,42 |
| `inkTertiary` | `#636B73` | Placeholder y metadatos | 5,41 sobre `surface` · 4,78 sobre `surfaceSunken` |
| `background` | `#F7F8FA` | Fondo de página (frío) | — |
| `surface` | `#FFFFFF` | Tarjeta, hoja, barras | — |
| `surfaceSunken` | `#EFF1F4` | Buscador, grupos, campos hundidos | — |
| `outline` | `#7A828C` | Borde de **controles** (campo, chip no seleccionado, botón secundario), 1 px | 3,66 sobre `background` · 3,89 sobre `surface` |
| `outlineVariant` | `#E0E4E8` | Divisor y separación dentro de una superficie; **decorativo**, nunca única señal | — |
| `success` / `successContainer` | `#166534` / `#DCFCE7` | Entregado, verificado | 6,49 |
| `warning` / `warningContainer` | `#92400E` / `#FEF3C7` | Pago pendiente, espera | 6,37 |
| `error` / `errorContainer` | `#991B1B` / `#FEE2E2` | Error, cancelado, destructivo | 6,80 |
| `info` / `infoContainer` | `#075985` / `#E0F2FE` | Informativo | 6,59 |
| `focus` | `#075985` | Anillo de foco de 2 dp con separación blanca de 2 dp | 7,56 sobre blanco |
| `disabled` / `onDisabled` | `#E0E4E8` / `#50565D` | Control deshabilitado (sin sombra) | 5,81 |
| `scrim` | `#2E3236` al 48 % | Fondo detrás de hojas y diálogos | — |
| `gradientCta` | `#FA7020` → `#EE6417` → `#E8590C` | CTA grandes y tarjetas de servicio; el texto blanco ≥ 18 px bold va sobre la mitad oscura | blanco sobre `#E8590C` 3,58 |

### 2.2 Reglas de color

1. **Texto:** ningún texto bajo 4,5:1, **salvo** el blanco de ≥ 18 px en negrita (o ≥ 24 px) sobre `primary` (regla de
   texto grande, decidida por Jesús: el naranja del logo pasa a `#EE6417` para llegar a 3:1).
2. `brand` es identidad, no fondo de texto. Los degradados con `brand` llevan el texto en la zona oscura o sobre una
   pastilla `secondary`.
3. Los controles se delimitan con `outline` (≥ 3:1); `outlineVariant` solo decora.
4. El tinte de elevación de Material 3 queda **transparente** (`surfaceTint`): la elevación la dan las sombras de §3.
5. Un test de contraste en CI bloquea el cambio de tono de `primary`, `primaryPressed` y `primaryText`: está a décimas del
   umbral. **(Pendiente de crear: no existe hoy.)**
6. Los **avatares de negocio sin logo** usan el respaldo del isotipo sobre `primaryContainer`, no un color inventado.
7. Solo tema claro: no hay modo oscuro definido.
8. **Un solo naranja.** Restaurantes, Entregas y Store usan `primary`; ningún servicio lleva azul (ni la moto). `info` es
   solo para avisos informativos, nunca color de un servicio. Confirmada completa por la junta con la delegación de Jesús (2026-11-21); las apps nativas nacen así.
   Nota: la web del cliente, congelada y por apagarse (D-27), conserva azules en `apps/customer/features/courier/` (degradados y acentos, en `components/` y `map/`); no se retoca, y las apps nativas nacen sin azul.

## 3. Forma y elevación

| Token | Valor | Uso |
|---|---|---|
| `radiusCard` | 20 | Tarjeta |
| `radiusSheet` | 28 | Hoja inferior y modal (solo las esquinas de arriba en hoja) |
| `radiusField` | 16 | Campo de texto |
| `radiusPill` | 999 | Chip y botón (píldora) |
| `radiusThumb` | 14 | Miniatura de plato y de bolsa |
| `elevation1` | `0 1px 2px rgba(46,50,54,.06), 0 4px 12px rgba(46,50,54,.06)` | Tarjetas sobre `background`, **sin borde** |
| `elevation2` | `0 2px 6px rgba(46,50,54,.08), 0 10px 24px rgba(46,50,54,.10)` | Tarjeta destacada y barra inferior fija |
| `elevation3` | `0 6px 16px rgba(238,100,23,.35)` | CTA primario (sombra naranja suave) |

- La tarjeta sobre `background` lleva `elevation1` y **no** lleva borde; el borde `outlineVariant` solo separa dentro de
  una superficie.
- Los valores de sombra están dados en CSS; cada plataforma los traduce a su API (en Compose, `shadow` con
  `ambientColor`/`spotColor`; en SwiftUI, `shadow(color:radius:x:y:)`) conservando color y radio.

## 4. Tipografía

**Geist** en toda la app (400/500/600/700). Los precios y cantidades usan **cifras tabulares** (`tnum`).

| Token | Tamaño / interlínea | Peso | Uso |
|---|---|---|---|
| `titleScreen` | 26 / 32 | 700 | Título de pantalla |
| `titleSection` | 18 / 24 | 700 | Título de sección |
| `body` | 15 / 22 | 400–500 | Cuerpo |
| `bodySecondary` | 13 / 18 | 400, color `inkSecondary` | Apoyo y metadatos |
| `cta` | 18 / 24 | 700 | Texto del CTA |
| `chip` | 14 | 600 | Etiqueta de chip |
| `price` | el del contexto | + `tnum` | Importes |

Mínimo **12 px**, y 12 solo para metadatos. Máximo **3 niveles tipográficos por tarjeta** (título 16–18/700, detalle
15/500, secundario 13/`inkSecondary`). Nada de rótulos en MAYÚSCULAS con espaciado. Ningún contenedor de texto con
altura fija: el tamaño de letra del sistema (Dynamic Type, `fontScale`) debe poder crecer.

## 5. Táctil, espaciado y elementos fijos

| Token | Valor | Uso |
|---|---|---|
| `touchTarget` | 48 × 48 dp | Mínimo de todo lo que se toca (el dibujo puede ser menor). En iOS, 44 pt es el mínimo del sistema (CLI-13); se usa **48** igual |
| `touchGap` | 8 | Separación mínima entre objetivos táctiles |
| `spaceScreen` | 16 | Margen lateral |
| `spaceGroup` / `spaceInner` | 24 / 12 | Entre grupos / dentro de un grupo |
| `grid` | 8 | Cuadrícula base |
| `ctaHeight` | 56 | Alto del CTA primario |
| `secondaryHeight` | 48–52 | Alto del botón secundario |
| `chipHeight` | 40 mínimo, dentro de un área táctil de 48 | Chip |
| `bottomBarInset` | 24 | Aire inferior de la barra de CTA para la barra de gestos |

- **Toda pantalla desplaza.** La maqueta es de 390 × 844, pero se diseña como si el contenido siguiera; el contenido deja
  un hueco inferior igual a la altura de lo fijo + 16.
- **Lo que es fijo, y nada más:**
  1. Barra superior de pantallas internas (volver, título, acciones); en Negocio se compacta al hacer scroll.
  2. Selector de secciones del menú (Negocio), pegado bajo la barra superior; tocar una sección **lleva** a ella y la
     visible se resalta sola.
  3. Barra de acción inferior (CTA) en Plato, Bolsa, Confirmar pedido y Comprobante.
  4. Barra de navegación inferior (Inicio, Entregas, Pedidos, Cuenta), **solo** en las 4 pestañas raíz.
  5. Pastilla de bolsa activa (Inicio y Negocio) y pastilla de pedido en curso (Inicio), sobre la barra inferior.
- Barra de CTA inferior: `surface`, `elevation2`, relleno 12/16, respeta la barra de gestos.
- Nada queda bajo la barra del sistema ni tapado por el teclado (3 botones, gestos, tablets).

## Pendientes de confirmar por Jesús

El canon da un rango o no da un dato; `tokens.json` toma un valor y lo marca con `"pending"` hasta que Jesús lo confirme:

- `body`: el canon dice peso 400–500; el JSON toma 400.
- `secondaryHeight`: el canon dice 48–52; el JSON toma 48.
- `chip`: el canon no fija interlineado (solo 14 / 600); el JSON no lo trae.
