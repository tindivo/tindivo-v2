import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseAndroidPalette } from '../android-colors.ts'
import { loadTokens } from '../generate.ts'

/**
 * El canon (Docs/negocio/sistema-de-diseno.md, decisión de Jesús 2026-11-18) manda; Android todavía no lo cumple.
 * Este test compara cada token del canon con su equivalente en apps/android/core/designsystem y exige que la lista de
 * diferencias sea EXACTAMENTE `KNOWN_DIFFS`: si Android se acerca al canon hay que borrar la fila; si se aleja o
 * aparece un token sin clasificar, el test falla. Android se ajusta en sus PRs de diseño, no aquí.
 */

const DS = fileURLToPath(
  new URL(
    '../../../../apps/android/core/designsystem/src/main/kotlin/com/tindivo/core/designsystem/',
    import.meta.url,
  ),
)
const read = (file: string) => readFileSync(DS + file, 'utf8')
const tokens = loadTokens()

const NONE = 'no existe'
const WEIGHTS: Record<string, number> = { Normal: 400, Medium: 500, SemiBold: 600, Bold: 700 }

// token del canon -> nombre en Android (o null si Android no lo tiene)
const COLOR_MAP: Record<string, string | null> = {
  primary: 'Brand',
  primaryPressed: 'BrandPressed',
  onPrimary: 'White',
  primaryText: 'BrandDark',
  brand: 'BrandMark',
  primaryContainer: 'BrandSoft',
  onPrimaryContainer: 'BrandDeep',
  secondary: 'Ink',
  onSecondary: 'White',
  ink: 'Ink',
  inkSecondary: 'InkMuted',
  inkTertiary: 'InkTertiary',
  background: 'Surface',
  surface: 'Card',
  surfaceSunken: 'SurfaceLow',
  outline: 'Outline',
  outlineVariant: 'Border',
  success: 'Success',
  successContainer: 'SuccessSoft',
  warning: 'Warning',
  warningContainer: 'WarningSoft',
  error: 'Danger',
  errorContainer: 'DangerSoft',
  info: null,
  infoContainer: null,
  focus: null,
  disabled: null,
  onDisabled: null,
  scrim: 'Ink',
  gradientCtaStart: 'BrandMark',
  gradientCtaMid: 'CtaMid',
  gradientCtaEnd: 'CtaEnd',
}
const RADIUS_MAP: Record<string, string | null> = {
  radiusCard: 'large',
  radiusSheet: 'extraLarge',
  radiusField: 'medium',
  radiusPill: null,
  radiusThumb: null,
}
const SPACING_MAP: Record<string, string | null> = {
  touchTarget: 'touchTarget',
  touchGap: 'tight',
  spaceScreen: 'screen',
  spaceGroup: 'section',
  spaceInner: 'item',
  grid: null,
  ctaHeight: 'primaryButtonHeight',
  secondaryHeight: null,
  chipHeight: null,
  bottomBarInset: null,
}
const TYPE_MAP: Record<string, string | null> = {
  titleScreen: 'headlineSmall',
  titleSection: 'titleMedium',
  body: 'bodyLarge',
  bodySecondary: 'bodySmall',
  cta: 'labelLarge',
  chip: 'labelMedium',
}

function androidValues() {
  const colors = read('TindivoColors.kt')
  const theme = read('TindivoTheme.kt')
  const type = read('TindivoType.kt')
  const palette: Record<string, string> = {
    White: '#FFFFFF',
    ...parseAndroidPalette(colors.replace('inversePrimary =', 'val inversePrimary =')),
  }
  const shapes: Record<string, string> = {}
  for (const m of theme.matchAll(/(\w+) = RoundedCornerShape\((\d+)\.dp\)/g)) {
    shapes[m[1] as string] = String(m[2])
  }
  const spacing: Record<string, string> = {}
  for (const m of theme.matchAll(/val (\w+): Dp = (\d+)\.dp/g))
    spacing[m[1] as string] = String(m[2])
  const styles: Record<string, string> = {}
  const re = /(\w+) = style\(size = (\d+), line = (\d+), weight = FontWeight\.(\w+)/g
  for (const m of type.matchAll(re)) {
    styles[m[1] as string] = `${m[2]}/${m[3]} ${WEIGHTS[m[4] as string]}`
  }
  return { palette, shapes, spacing, styles }
}

const A = androidValues()
const diffs: string[] = []
const mapped = {
  palette: new Set<string>(),
  shapes: new Set<string>(),
  spacing: new Set<string>(),
  styles: new Set<string>(),
}

function compare(
  group: string,
  token: string,
  canon: string,
  map: Record<string, string | null>,
  source: Record<string, string>,
  seen: Set<string>,
) {
  expect(Object.hasOwn(map, token), `${group}.${token} no está clasificado en el test`).toBe(true)
  const name = map[token]
  if (name == null) {
    diffs.push(`${token} · ${canon} · ${NONE}`)
    return
  }
  seen.add(name)
  const android = source[name]
  expect(android, `Android no tiene ${name}`).toBeDefined()
  if (android !== canon) diffs.push(`${token} · ${canon} · ${android}`)
}

// El alfa del scrim (48 %) no se compara: Android usa el alfa por defecto de Material.
for (const [k, v] of Object.entries(tokens.color)) {
  compare('color', k, v.value, COLOR_MAP, A.palette, mapped.palette)
}
for (const [k, v] of Object.entries(tokens.radius)) {
  compare('radius', k, String(v.value), RADIUS_MAP, A.shapes, mapped.shapes)
}
for (const [k, v] of Object.entries(tokens.spacing)) {
  compare('spacing', k, String(v.value), SPACING_MAP, A.spacing, mapped.spacing)
}
for (const [k, v] of Object.entries(tokens.type)) {
  const canon = `${v.size}/${v.line ?? '-'} ${v.weight}`
  compare('type', k, canon, TYPE_MAP, A.styles, mapped.styles)
}
for (const k of Object.keys(tokens.elevation)) {
  diffs.push(`${k} · sombra del canon · ${NONE}`)
}

// Lo que Android tiene y el canon no nombra.
const androidOnly = [
  ...Object.keys(A.palette)
    .filter((n) => !mapped.palette.has(n))
    .map((n) => `color ${n}`),
  ...Object.keys(A.shapes)
    .filter((n) => !mapped.shapes.has(n))
    .map((n) => `radio ${n}`),
  ...Object.keys(A.spacing)
    .filter((n) => !mapped.spacing.has(n))
    .map((n) => `espaciado ${n}`),
  ...Object.keys(A.styles)
    .filter((n) => !mapped.styles.has(n))
    .map((n) => `texto ${n}`),
]

// DIFERENCIAS CONOCIDAS: token · canon · Android hoy. Se borra una fila cuando Android se alinea.
const KNOWN_DIFFS: string[] = [
  'primary · #EE6417 · #F97316',
  'success · #166534 · #15803D',
  'warning · #92400E · #B45309',
  'error · #991B1B · #DC2626',
  'info · #075985 · no existe',
  'infoContainer · #E0F2FE · no existe',
  'focus · #075985 · no existe',
  'disabled · #E0E4E8 · no existe',
  'onDisabled · #50565D · no existe',
  'radiusPill · 999 · no existe',
  'radiusThumb · 14 · no existe',
  'grid · 8 · no existe',
  'secondaryHeight · 48 · no existe',
  'chipHeight · 40 · no existe',
  'bottomBarInset · 24 · no existe',
  'titleScreen · 26/32 700 · 22/28 700',
  'titleSection · 18/24 700 · 17/24 600',
  'body · 15/22 400 · 16/24 400',
  'bodySecondary · 13/18 400 · 12/16 400',
  'cta · 18/24 700 · 15/20 700',
  'chip · 14/- 600 · 12/16 600',
  'elevation1 · sombra del canon · no existe',
  'elevation2 · sombra del canon · no existe',
  'elevation3 · sombra del canon · no existe',
]
const KNOWN_ANDROID_ONLY: string[] = [
  'color SurfaceMid',
  'color SuccessDeep',
  'color WarningDeep',
  'color DangerDeep',
  'color inversePrimary',
  'radio extraSmall',
  'radio small',
  'espaciado hairline',
  'espaciado hero',
  'texto displayLarge',
  'texto displayMedium',
  'texto displaySmall',
  'texto headlineLarge',
  'texto headlineMedium',
  'texto titleLarge',
  'texto titleSmall',
  'texto bodyMedium',
  'texto labelSmall',
]

describe('Android hoy frente al canon (diferencias conocidas, que no pueden crecer a escondidas)', () => {
  it('las diferencias son exactamente la lista conocida', () => {
    expect(diffs).toEqual(KNOWN_DIFFS)
  })

  it('lo que Android tiene y el canon no nombra es exactamente la lista conocida', () => {
    expect(androidOnly).toEqual(KNOWN_ANDROID_ONLY)
  })

  it('todo token del canon quedó clasificado (el test no se salta ninguno)', () => {
    expect(Object.keys(tokens.color)).toEqual(Object.keys(COLOR_MAP))
    expect(Object.keys(tokens.radius)).toEqual(Object.keys(RADIUS_MAP))
    expect(Object.keys(tokens.spacing)).toEqual(Object.keys(SPACING_MAP))
    expect(Object.keys(TYPE_MAP).every((k) => k in tokens.type)).toBe(true)
  })
})
