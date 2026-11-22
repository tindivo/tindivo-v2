# @tindivo/design-tokens

Los valores son los del canon `Docs/negocio/sistema-de-diseno.md` (decisión de Jesús, 2026-11-18), **no los de Android**. `tokens.json` se escribe a mano a partir de ese documento, con los mismos nombres, y un test (`canon-parity.test.ts`) compara el JSON con las tablas de §2 a §5. De ahí salen tres archivos versionados en `generated/`. Nadie los edita a mano.

| Plataforma | Salida | Qué contiene |
|---|---|---|
| Web | `generated/css/tokens.css` | Variables `--tindivo-*` en `:root` (no pisan las de `packages/ui/src/theme.css`) |
| Android | `generated/kotlin/TindivoTokens.kt` | `TindivoTokens.{Colors,Radius,Spacing,Typography,Elevation}` con `Color`, `Dp`, `TextUnit` y capas de sombra de Compose |
| iOS | `generated/swift/TindivoTokens.swift` | `TindivoTokens.{Colors,Radius,Spacing,Typography,Elevation}` con `Color`, `CGFloat` y capas de sombra de SwiftUI, todo `public` |

Hoy hay **32 colores** (incluye `scrim` al 48 % y el degradado del CTA como `gradientCtaStart/Mid/End`), **5 radios, 10 espaciados y tamaños táctiles, 6 estilos de texto y 3 elevaciones**, más la familia (Geist). Los nombres son los del canon y únicos entre grupos.

**Valores pendientes de Jesús** (campo `"pending"` en `tokens.json`, listados en el canon): `body` (el canon da 400–500; se tomó 400), `secondaryHeight` (48–52; se tomó 48) y `chip` (el canon no fija interlineado; sale como `normal`, `nil` o `TextUnit.Unspecified`).

**Android hoy no cumple el canon.** `src/__tests__/android-parity.test.ts` compara cada token con `apps/android/core/designsystem` y exige que las diferencias sean exactamente las de su lista `KNOWN_DIFFS` (token · canon · Android hoy), más `KNOWN_ANDROID_ONLY` (lo que Android tiene y el canon no nombra). La lista no puede crecer a escondidas ni quedar vieja: se borra una fila cuando Android se alinea, en su PR de diseño.

## Comandos

```bash
pnpm tokens:build   # regenera generated/ desde tokens.json
pnpm tokens:check   # falla (exit 1) si lo versionado no es lo que saldría del JSON; para CI
pnpm --filter @tindivo/design-tokens test
```

El generador es una función pura (`src/generate.ts`), sin dependencias. Node lo ejecuta directamente (`node src/cli.ts`), lo que exige **Node >= 22.18** (`engines` del paquete; la CI usa 24; el `engines` de la raíz sigue en 20.9 porque lo demás del repo no lo necesita).

El `test` de este paquete lee archivos de fuera de él (`apps/android/core/designsystem/**` y el canon), así que `turbo.json` del paquete los declara como `inputs`: si cambia `TindivoColors.kt`, turbo no da cache hit.

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

Estado: compila (Swift 6, iOS 17, Xcode 27.2; 2026-11-22). `pnpm ios:gen` lo copia a `Packages/TindivoDesign/Sources/TindivoDesign/Generated/`, que no se versiona; un paquete SwiftPM no puede referenciar fuentes de fuera de su carpeta. Si el compilador pide un ajuste, se corrige en `src/generate.ts` y no en el `.swift`; `pnpm tokens:check` debe seguir en verde en CI.

## Qué NO hace todavía

- Android y la web **no consumen** estas salidas: se cablean en otro PR. Android se ajusta al canon en sus PRs de diseño.
- Solo están los tokens del canon (§1 a §5 de `sistema-de-diseno.md`). Los componentes, el movimiento y las imágenes siguen sin
  promover; tampoco están las cifras tabulares (`tnum`), que son una característica de la fuente y no un valor.
- `packages/ui/src/theme.css` (la web, que se apaga) conserva sus propios valores.
