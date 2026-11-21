# Sistema de diseño de las apps nativas: tokens y componentes

> Verificado: 2026-11-17 · entorno: develop@0d0f7486 (código de `apps/android/core/designsystem` y `packages/ui/src/theme.css`; contrastes recalculados con la fórmula WCAG 2.x)
> Reglas y principios (minimalismo, Yape o Plin con logos, marca): `Docs/negocio/diseno.md`. Nombres de token estables:
> el mismo nombre en Compose y en SwiftUI.

> **Migrado a `Docs/negocio/sistema-de-diseno.md` (canon, 2026-11-19):** nombres estables (§1), color (§2), forma y elevación (§3),
> tipografía (§4) y táctil/espaciado (§5). Lo que sigue (§6 en adelante) sigue siendo trabajo, sin aprobar.

## 6. Imágenes e ilustraciones

- **Fotos grandes con radio.** Nunca el texto «[FOTO]».
- **Cuando no hay foto:** el isotipo de Tindivo (sin recuadro de fondo, transparente) centrado sobre `primaryContainer`.
  El isotipo vectorial está en `apps/api/lib/pdf/brand-assets.ts`; se usa como vector o PNG transparente.
- **Ilustración en lugar de texto** cuando explica mejor (onboarding, estados vacíos, cómo pagar). El estilo es **arcilla
  isométrica con los colores de la marca**; las piezas viven en `img/gen` del canvas de diseño (fuera del repo, **sin
  verificar** su estado actual). Una ilustración nueva sigue ese estilo y la paleta de §2.
- Imágenes de servicio reutilizables de la web: `apps/customer/public/services/` (`bolsa-restaurantes.webp`,
  `moto-tindivo.webp`) y `banners/*.webp`. Métodos de pago: `apps/customer/public/pay/{yape,plin,cash}.svg`.
- Toda imagen con significado lleva descripción accesible.

## 7. Componentes

| Componente | Especificación |
|---|---|
| **CTA primario** | Píldora de `ctaHeight` 56, relleno `primary` (o `gradientCta`), texto `cta` blanco, `elevation3`; con monto, este va a la derecha con `tnum`. Deshabilitado: `disabled` + `onDisabled`, sin sombra |
| **Secundario** | Píldora 48–52, `surface`, borde `outline` 1 px, texto `ink` |
| **Texto** | Sin fondo, texto `primaryText`; el destructivo, `error`. Área táctil de 48 de alto |
| **Ícono con fondo** | Círculo o cuadrado de 40–44, `primaryContainer` con ícono `primary` (o color de estado con su contenedor) |
| **Chip** | 40 de alto mínimo en un área de 48. Seleccionado: **fondo `secondary` + texto blanco**, o `primaryContainer` + texto `onPrimaryContainer` + borde `primary` (nunca `primary` con blanco: el texto del chip es pequeño). No seleccionado: borde `outline` |
| **Estado de pedido** | Pastilla con el par `info`/`success`/`warning`/`error` y su palabra. El tramo pendiente de la línea de progreso usa `outline` (no `outlineVariant`) |
| **Esqueleto de carga** | `outlineVariant` sobre `surface` con brillo animado |
| **Aviso (snackbar)** | Fondo `secondary`; la acción en blanco subrayada o sobre `primaryContainer` |
| **Tarjeta** | `surface`, `radiusCard`, `elevation1`, sin borde |
| **Hoja inferior** | `radiusSheet`, asa, título, cerrar de 48, cuerpo que desplaza, pie con CTA; máx. 90 % de alto |
| **Campo de texto** | `radiusField`, borde `outline`, etiqueta enlazada, ayuda, error; texto del campo de 16 |

Una pantalla **no arma a mano** un botón, barra, hoja, chip o tarjeta que ya exista en el design system.

## 8. Movimiento

Duraciones de 150 a 250 ms, curva `cubic-bezier(.2,.8,.2,1)`.

| Momento | Movimiento |
|---|---|
| Tocar | Escala 0,97 y sombra más baja |
| Agregar a la bolsa | La miniatura vuela a la pastilla de bolsa y el contador rebota |
| Confirmar pedido | Check animado y confeti sutil de marca |
| Progreso del pedido | La etapa activa late suave |

Se respeta «reducir movimiento» / «quitar animaciones» del sistema.

## 9. Lo que ya existe en Android y dónde difiere (trabajo pendiente)

Fuente: `apps/android/core/designsystem/src/main/kotlin/com/tindivo/core/designsystem/` en develop@0d0f7486. **Esta
diferencia es deuda del código con lo aprobado**: no se ajusta el documento al código.

### 9.1 Color

| Token | Valor aprobado (§2) | Valor hoy en Android | ¿Difiere? |
|---|---|---|---|
| `primary` | `#EE6417` | `Palette.Brand #F97316` (`colorScheme.primary`) | **Sí** (blanco encima: 2,80 vs 3,25) |
| `primaryPressed` | `#CF4A0C` | no existe | **Falta** |
| `onPrimary` | `#FFFFFF` | `White` | No |
| `primaryText` | `#C2410C` | `TindivoColors.brandText = #C2410C` | No (otro nombre) |
| `brand` | `#FA7020` | no existe (`Brand` es `#F97316`) | **Falta** |
| `primaryContainer` / `onPrimaryContainer` | `#FFF7ED` / `#9A3412` | `#FFF7ED` / `#9A3412` | No |
| `secondary` / `ink` | `#2E3236` | `Ink #1A1614` (tinta cálida) | **Sí** |
| `inkSecondary` | `#50565D` | `InkMuted #57534E` | **Sí** |
| `inkTertiary` | `#636B73` | `InkSubtle #A8A29E` (2,34 sobre crema: no sirve para texto) | **Sí** |
| `background` | `#F7F8FA` | `Surface #FAF6F1` (crema) | **Sí** |
| `surface` | `#FFFFFF` | `Card #FFFFFF` como `surfaceContainerLowest`; `colorScheme.surface` es crema | **Sí** (cambia el rol) |
| `surfaceSunken` | `#EFF1F4` | `SurfaceLow #F0EBE3` / `SurfaceMid #F5F1EB` | **Sí** |
| `outline` | `#7A828C` | `InkSubtle #A8A29E` | **Sí** (no llega a 3:1) |
| `outlineVariant` | `#E0E4E8` | `Border #EAE7E2` | **Sí** |
| `success` | `#166534` | `Success #15803D` (`SuccessDeep #166534` existe aparte) | **Sí** |
| `warning` | `#92400E` | `Warning #B45309` (`WarningDeep #92400E` existe aparte) | **Sí** |
| `error` | `#991B1B` | `Danger #DC2626` (`DangerDeep #991B1B` aparte; `#DC2626` sobre `#FEE2E2` da 3,95) | **Sí** |
| `info`, `focus` | `#075985` | no existen | **Faltan** |
| `disabled` / `onDisabled` | `#E0E4E8` / `#50565D` | por defecto de Material 3 | **Falta** |
| `scrim` | `#2E3236` al 48 % | `Palette.Ink #1A1614` (alfa por defecto de Material) | **Sí** |
| `gradientCta` | `#FA7020 → #EE6417 → #E8590C` | no existe | **Falta** |
| `successContainer`, `warningContainer`, `errorContainer` | `#DCFCE7`, `#FEF3C7`, `#FEE2E2` | iguales | No |

### 9.2 Forma, elevación, tipografía, táctil

| Token | Aprobado | Hoy en Android | ¿Difiere? |
|---|---|---|---|
| `radiusCard` | 20 | `shapes.large` 20 | No |
| `radiusSheet` | 28 | `shapes.extraLarge` 28 | No |
| `radiusField` | 16 | `shapes.medium` 16 | No |
| `radiusPill` | 999 | no hay token (el botón de Material es píldora) | Falta el nombre |
| `radiusThumb` | 14 | no existe | **Falta** |
| `elevation1`/`2`/`3` | sombras de §4 | tarjetas **planas con borde 1 dp**; barras con `shadowElevation = 8.dp` literal | **Sí** (la tarjeta aprobada es sin borde y con sombra) |
| `titleScreen` 26/32 700 | | `headlineSmall` 22/28 Bold; `headlineMedium` 24/30 | **Sí** |
| `titleSection` 18/24 700 | | `titleMedium` 17/24 SemiBold | **Sí** |
| `body` 15/22 | | `bodyLarge` 16/24; `bodyMedium` 14/20 | **Sí** |
| `bodySecondary` 13/18 | | `bodySmall` 12/16 (no hay 13) | **Sí** |
| `cta` 18/24 700 | | `labelLarge` 15/20 Bold | **Sí** |
| `chip` 14 600 | | `labelMedium` 12/16 SemiBold | **Sí** |
| tamaño mínimo 12 | | `labelSmall` 11/16 | **Sí** (baja del mínimo) |
| cifras tabulares `tnum` | | no hay `tnum` | **Falta** |
| `touchTarget` 48 | | `TindivoSpacing.touchTarget` 48 | No |
| `ctaHeight` 56 | | `primaryButtonHeight` 52 | **Sí** |
| `spaceScreen`/`spaceGroup`/`spaceInner`/`touchGap` | 16 / 24 / 12 / 8 | `screen` 16, `section` 24, `item` 12, `tight` 8 (más `hairline` 4, `hero` 32) | No (otros nombres) |
| Botón secundario: borde | `outline` | `colorScheme.outline` (que hoy es `#A8A29E`) | Sí, por el valor de `outline` |

### 9.3 Componentes

| Aprobado (§7) | En `:core:designsystem` hoy |
|---|---|
| CTA, secundario, texto | `TindivoPrimaryButton` (con `loading`), `TindivoSecondaryButton`, `TindivoTextButton`; sin gradiente ni sombra naranja |
| Tarjeta | `TindivoCard` plana con borde |
| Estados de pantalla | `LoadingState`, `EmptyState`, `ErrorState`; `StatusRow` |
| Íconos | `TindivoIcons`: 6 vectores (`ArrowBack`, `Search`, `Close`, `GridView`, `ErrorOutline`, `Inbox`) |
| Barra de CTA inferior | **No existe** como componente: `CheckoutBottomBar`, `CartBar` y `StoreDetailScreen` arman cada uno su `Surface(shadowElevation = 8.dp)`. El PR #173 propone `TindivoBottomBar`; **no está en develop** |
| Barra superior, hoja, campo de texto, chip de estado, pastilla de cantidad, resumen de costos, línea de bolsa, imagen con respaldo, selector segmentado, aviso, esqueleto, barra de pestañas | **No existen** como componentes del design system (cada pantalla usa Material directamente) |
| Movimiento (§8) | **(sin verificar)** que exista alguno: no se barrió |

## 10. Cómo se resolvieron los choques entre fuentes

La rama `docs/sistema-de-diseno-v1` (`Docs/trabajo/diseno/sistema-de-diseno-v1.md`, propuesta del 16-nov que **no
manda**) se escribió antes de `PATRONES-V2`. Donde chocan, gana `PATRONES-V2` (posterior y aprobado por Jesús):

| Tema | Propuesta v1 | Aprobado (este documento) |
|---|---|---|
| Naranja de botones | Mantener `#F97316` con excepción documentada (2,80:1) | `#EE6417` con texto blanco solo grande (3,25:1) |
| Tinta y fondo | Tinta cálida `#1A1614`, crema `#FAF6F1` | Tinta `#2E3236`, fondo frío `#F7F8FA`, superficie blanca |
| Éxito / aviso / error | `#15803D` / `#B45309` y texto `#92400E` / `#DC2626` | `#166534` / `#92400E` / `#991B1B` |
| Tarjeta | Plana con borde (D8 «A»), radio por componente (D7 «C») | `elevation1` sin borde, radio 20 |
| Escala tipográfica | Sin 13; mínimo 11 sp; CTA 15 | Con 13; mínimo 12; CTA 18 |
| Alto del botón principal | 52 | 56 |
| Principio rector | «La web manda» (P1) | «No se copia la web»: se mejora para el móvil |
| Fondo intermedio `#ECEAE5` (D6) | `surfaceLow` | No hay: `surfaceSunken #EFF1F4` |
| Ancho máximo en tablet (D9: 640 dp) | Propuesto | **Sin decidir** en PATRONES-V2; no se incorpora hasta que Jesús lo diga |

Coinciden y se conservan: cifras tabulares, objetivo táctil de 48, hoja de 28, íconos de línea redondeada de 24 dp, color
+ palabra, respeto de «quitar animaciones» y `Role` accesible en cada control. Una contradicción adicional: la decisión de
paleta del mismo día (`#CF4A0C` como botón) fue **reemplazada** por `PATRONES-V2` (`#EE6417`); `#CF4A0C` queda como
`primaryPressed`.

