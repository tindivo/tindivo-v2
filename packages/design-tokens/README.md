# @tindivo/design-tokens

Los valores salen de `Docs/negocio/sistema-de-diseno.md` (canon; decisión de Jesús, 2026-11-18); `tokens.json` los lleva a datos con los mismos nombres. De ahí salen tres archivos versionados en `generated/`. Nadie
los edita a mano.

| Plataforma | Salida | Qué contiene |
|---|---|---|
| Web | `generated/css/tokens.css` | Variables `--tindivo-*` en `:root` (no pisan las de `packages/ui/src/theme.css`) |
| Android | `generated/kotlin/TindivoTokens.kt` | `TindivoTokens.{Colors,Radius,Spacing,Typography}` con `Color`, `Dp` y `TextUnit` de Compose |
| iOS | `generated/swift/TindivoTokens.swift` | `TindivoTokens.{Colors,Radius,Spacing,Typography}` con `Color` y `CGFloat` de SwiftUI, todo `public` |

Hoy hay **22 colores, 5 radios, 8 espaciados y 15 estilos de texto**, más la familia (Geist). Los valores son los de
`apps/android/core/designsystem` a 2026-11-18: Android es la app en producción, y un test
(`src/__tests__/android-parity.test.ts`) falla si el JSON y ese módulo se separan.

## Comandos

```bash
pnpm tokens:build   # regenera generated/ desde tokens.json
pnpm tokens:check   # falla (exit 1) si lo versionado no es lo que saldría del JSON; para CI
pnpm --filter @tindivo/design-tokens test
```

El generador es una función pura (`src/generate.ts`), sin dependencias; Node la ejecuta directamente.

## Cómo cambiar un token

1. Cambia el valor en `Docs/negocio/sistema-de-diseno.md` y en `tokens.json` (un cambio de diseño: lo decide Jesús).
2. `pnpm tokens:build` y commitea el JSON junto con `generated/`.
3. Si Android ya tiene ese token, actualiza su fila de `KNOWN_DIFFS`; un token nuevo hay que clasificarlo en el test.

## Cómo la consume iOS

Copia **un solo archivo** al paquete local `TindivoDesign` (estándar `swift.md` SW-2):

```text
packages/design-tokens/generated/swift/TindivoTokens.swift
  → Packages/TindivoDesign/Sources/TindivoDesign/Generated/TindivoTokens.swift
```

Uso: `TindivoTokens.Colors.primary`, `TindivoTokens.Spacing.spaceScreen`, `TindivoTokens.Typography.titleScreen` (`size`, `line`, `weight`), `TindivoTokens.Elevation.elevation1` (capas de sombra) y `TindivoTokens.fontFamily` (la familia la pone quien dibuja). El canon habla de `Color.tindivo.primary`: ese acceso lo añade `TindivoDesign` encima de este archivo. Requiere
SwiftUI (iOS 15 o superior por `Font.Weight`/`Color(.sRGB…)`; el mínimo real lo fija el proyecto).

Estado de esta salida: **generada pero no compilada** (no hay Swift en la máquina de desarrollo). La primera vez que
se enlace en Xcode, si el compilador pide un ajuste, se corrige en `src/generate.ts` y no en el `.swift`. Para no
copiar a mano, el proyecto puede enlazar el archivo por referencia o con un paso de build que lo copie; cualquiera de
las dos sirve mientras `pnpm tokens:check` siga en verde en CI.

## Qué NO hace todavía

- Android y la web **no consumen** estas salidas: se cablean en otro PR. Android se ajusta al canon en sus PRs de diseño.
- Solo están los tokens del canon (§1 a §5 de `sistema-de-diseno.md`). Los componentes, el movimiento y las imágenes siguen sin
  promover; tampoco están las cifras tabulares (`tnum`), que son una característica de la fuente y no un valor.
- `packages/ui/src/theme.css` (la web, que se apaga) conserva sus propios valores.
