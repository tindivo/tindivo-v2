/**
 * Genera las salidas de diseño de Tindivo (CSS, Kotlin, Swift) desde `tokens.json`, que a su vez refleja
 * `Docs/negocio/sistema-de-diseno.md`. Es una función pura de los tokens: mismo JSON, mismos bytes. Sin dependencias.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface ColorToken {
  value: string
  /** 0 a 1; si falta, opaco. */
  alpha?: number
}
export interface NumberToken {
  value: number
}
export interface TypeToken {
  size: number
  /** Si falta, el canon no fija interlínea. */
  line?: number
  weight: 400 | 500 | 600 | 700
}
export interface ShadowLayer {
  x: number
  y: number
  blur: number
  color: string
  alpha: number
}
export interface ElevationToken {
  layers: ShadowLayer[]
}
export interface Tokens {
  version: number
  source: string
  font: { family: string }
  color: Record<string, ColorToken>
  radius: Record<string, NumberToken>
  spacing: Record<string, NumberToken>
  type: Record<string, TypeToken>
  elevation: Record<string, ElevationToken>
}

export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const NAME = /^[a-z][a-zA-Z0-9]*$/
const HEX = /^#[0-9A-F]{6}$/
const WEIGHTS = [400, 500, 600, 700]

function fail(path: string, why: string): never {
  throw new Error(`tokens.json: ${path} ${why}`)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isAlpha = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1

function group<T>(
  raw: unknown,
  name: string,
  seen: Set<string>,
  check: (path: string, v: Record<string, unknown>) => void,
): Record<string, T> {
  if (typeof raw !== 'object' || raw === null) fail(name, 'debe ser un objeto')
  for (const [key, v] of Object.entries(raw)) {
    const path = `${name}.${key}`
    if (!NAME.test(key)) fail(path, 'el nombre debe ser camelCase')
    if (seen.has(key)) fail(path, 'el nombre ya existe en otro grupo (los nombres son únicos)')
    seen.add(key)
    if (typeof v !== 'object' || v === null) fail(path, 'debe ser un objeto')
    check(path, v as Record<string, unknown>)
  }
  return raw as Record<string, T>
}

/** Valida la forma de `tokens.json`; lanza con la ruta del token que falla. */
export function parseTokens(raw: unknown): Tokens {
  const r = raw as Record<string, unknown>
  if (r?.version !== 1) fail('version', 'debe ser 1')
  const font = r.font as { family?: unknown } | undefined
  if (typeof font?.family !== 'string' || font.family === '') fail('font.family', 'falta')
  const seen = new Set<string>()
  const color = group<ColorToken>(r.color, 'color', seen, (p, v) => {
    if (typeof v.value !== 'string' || !HEX.test(v.value)) fail(p, 'debe ser #RRGGBB en mayúsculas')
    if (v.alpha !== undefined && !isAlpha(v.alpha)) fail(p, 'el alfa va de 0 a 1')
  })
  const num = (p: string, v: Record<string, unknown>) => {
    if (!isNum(v.value) || v.value < 0) fail(p, 'debe ser un número >= 0')
  }
  const radius = group<NumberToken>(r.radius, 'radius', seen, num)
  const spacing = group<NumberToken>(r.spacing, 'spacing', seen, num)
  const type = group<TypeToken>(r.type, 'type', seen, (p, v) => {
    if (!isNum(v.size)) fail(p, 'size debe ser un número')
    if (v.line !== undefined && !isNum(v.line)) fail(p, 'line debe ser un número')
    if (!WEIGHTS.includes(v.weight as number)) {
      fail(p, 'el peso debe ser 400, 500, 600 o 700 (la fuente variable)')
    }
  })
  const elevation = group<ElevationToken>(r.elevation, 'elevation', seen, (p, v) => {
    if (!Array.isArray(v.layers) || v.layers.length === 0) fail(p, 'necesita al menos una capa')
    for (const layer of v.layers as Record<string, unknown>[]) {
      const ok = [layer.x, layer.y, layer.blur].every(isNum) && isAlpha(layer.alpha)
      if (!ok || typeof layer.color !== 'string' || !HEX.test(layer.color)) {
        fail(p, 'cada capa lleva x, y, blur, color #RRGGBB y alpha de 0 a 1')
      }
    }
  })
  return {
    version: 1,
    source: String(r.source ?? ''),
    font: { family: font.family },
    color,
    radius,
    spacing,
    type,
    elevation,
  }
}

export function loadTokens(): Tokens {
  return parseTokens(JSON.parse(readFileSync(`${PACKAGE_ROOT}tokens.json`, 'utf8')))
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
const alphaByte = (a: number) =>
  Math.round(a * 255)
    .toString(16)
    .toUpperCase()
    .padStart(2, '0')

const HEADER = [
  'GENERADO por packages/design-tokens/src/cli.ts desde packages/design-tokens/tokens.json',
  '(que refleja Docs/negocio/sistema-de-diseno.md). No se edita a mano: se cambia el JSON y se corre `pnpm tokens:build`.',
]

function cssColor(hex: string, alpha?: number): string {
  if (alpha === undefined) return hex.toLowerCase()
  return `rgba(${rgb(hex).join(', ')}, ${alpha})`
}

function css(t: Tokens): string {
  const l = [
    `/* ${HEADER[0]}`,
    `   ${HEADER[1]} */`,
    '',
    ':root {',
    `  --tindivo-font-family: '${t.font.family}';`,
  ]
  for (const [k, v] of Object.entries(t.color)) {
    l.push(`  --tindivo-${kebab(k)}: ${cssColor(v.value, v.alpha)};`)
  }
  for (const [k, v] of Object.entries(t.radius)) l.push(`  --tindivo-${kebab(k)}: ${v.value}px;`)
  for (const [k, v] of Object.entries(t.spacing)) l.push(`  --tindivo-${kebab(k)}: ${v.value}px;`)
  for (const [k, v] of Object.entries(t.type)) {
    const p = `--tindivo-${kebab(k)}`
    l.push(`  ${p}-size: ${v.size}px;`)
    l.push(`  ${p}-line: ${v.line === undefined ? 'normal' : `${v.line}px`};`)
    l.push(`  ${p}-weight: ${v.weight};`)
  }
  for (const [k, v] of Object.entries(t.elevation)) {
    const layers = v.layers.map(
      (s) => `${s.x}${s.x ? 'px' : ''} ${s.y}px ${s.blur}px ${cssColor(s.color, s.alpha)}`,
    )
    l.push(`  --tindivo-${kebab(k)}: ${layers.join(', ')};`)
  }
  l.push('}', '')
  return l.join('\n')
}

const KT_WEIGHT: Record<number, string> = {
  400: 'Normal',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
}

function kotlin(t: Tokens): string {
  const l = [
    `// ${HEADER[0]}`,
    `// ${HEADER[1]}`,
    '',
    'package com.tindivo.core.designsystem.tokens',
    '',
    'import androidx.compose.ui.graphics.Color',
    'import androidx.compose.ui.text.font.FontWeight',
    'import androidx.compose.ui.unit.Dp',
    'import androidx.compose.ui.unit.TextUnit',
    'import androidx.compose.ui.unit.dp',
    'import androidx.compose.ui.unit.sp',
    '',
    '/** Un estilo de texto: la familia (Geist) la pone quien lo usa. */',
    'data class TypeToken(',
    '    val size: TextUnit,',
    '    val line: TextUnit,',
    '    val weight: FontWeight,',
    ')',
    '',
    '/** Una capa de sombra; una elevación es una lista de capas. */',
    'data class ShadowLayer(',
    '    val x: Dp,',
    '    val y: Dp,',
    '    val blur: Dp,',
    '    val color: Color,',
    ')',
    '',
    'object TindivoTokens {',
    `    const val FONT_FAMILY = "${t.font.family}"`,
    '',
    '    object Colors {',
  ]
  for (const [k, v] of Object.entries(t.color)) {
    const a = v.alpha === undefined ? 'FF' : alphaByte(v.alpha)
    l.push(`        val ${k}: Color = Color(0x${a}${v.value.slice(1)})`)
  }
  l.push('    }', '', '    object Radius {')
  for (const [k, v] of Object.entries(t.radius)) l.push(`        val ${k}: Dp = ${v.value}.dp`)
  l.push('    }', '', '    object Spacing {')
  for (const [k, v] of Object.entries(t.spacing)) l.push(`        val ${k}: Dp = ${v.value}.dp`)
  l.push('    }', '', '    object Typography {')
  for (const [k, v] of Object.entries(t.type)) {
    const line = v.line === undefined ? 'TextUnit.Unspecified' : `${v.line}.sp`
    l.push(
      `        val ${k} = TypeToken(size = ${v.size}.sp, line = ${line}, weight = FontWeight.${KT_WEIGHT[v.weight]})`,
    )
  }
  l.push('    }', '', '    object Elevation {')
  for (const [k, v] of Object.entries(t.elevation)) {
    const layers = v.layers.map(
      (s) =>
        `ShadowLayer(x = ${s.x}.dp, y = ${s.y}.dp, blur = ${s.blur}.dp, color = Color(0x${alphaByte(s.alpha)}${s.color.slice(1)}))`,
    )
    l.push(`        val ${k} = listOf(${layers.join(', ')})`)
  }
  l.push('    }', '}', '')
  return l.join('\n')
}

const SW_WEIGHT: Record<number, string> = {
  400: 'regular',
  500: 'medium',
  600: 'semibold',
  700: 'bold',
}

function swift(t: Tokens): string {
  const l = [
    `// ${HEADER[0]}`,
    `// ${HEADER[1]}`,
    '',
    'import SwiftUI',
    '',
    '/// Un estilo de texto: la familia (Geist) la pone quien lo usa. `line` es nil si el canon no la fija.',
    'public struct TypeToken: Sendable {',
    '    public let size: CGFloat',
    '    public let line: CGFloat?',
    '    public let weight: Font.Weight',
    '}',
    '',
    '/// Una capa de sombra; una elevación es un arreglo de capas.',
    'public struct ShadowLayer: Sendable {',
    '    public let x: CGFloat',
    '    public let y: CGFloat',
    '    public let blur: CGFloat',
    '    public let color: Color',
    '}',
    '',
    'extension Color {',
    '    fileprivate init(hex: UInt32, opacity: Double = 1) {',
    '        self.init(',
    '            .sRGB,',
    '            red: Double((hex >> 16) & 0xFF) / 255,',
    '            green: Double((hex >> 8) & 0xFF) / 255,',
    '            blue: Double(hex & 0xFF) / 255,',
    '            opacity: opacity',
    '        )',
    '    }',
    '}',
    '',
    'public enum TindivoTokens {',
    `    public static let fontFamily = "${t.font.family}"`,
    '',
    '    public enum Colors {',
  ]
  for (const [k, v] of Object.entries(t.color)) {
    const o = v.alpha === undefined ? '' : `, opacity: ${v.alpha}`
    l.push(`        public static let ${k} = Color(hex: 0x${v.value.slice(1)}${o})`)
  }
  l.push('    }', '', '    public enum Radius {')
  for (const [k, v] of Object.entries(t.radius)) {
    l.push(`        public static let ${k}: CGFloat = ${v.value}`)
  }
  l.push('    }', '', '    public enum Spacing {')
  for (const [k, v] of Object.entries(t.spacing)) {
    l.push(`        public static let ${k}: CGFloat = ${v.value}`)
  }
  l.push('    }', '', '    public enum Typography {')
  for (const [k, v] of Object.entries(t.type)) {
    const line = v.line === undefined ? 'nil' : String(v.line)
    l.push(
      `        public static let ${k} = TypeToken(size: ${v.size}, line: ${line}, weight: .${SW_WEIGHT[v.weight]})`,
    )
  }
  l.push('    }', '', '    public enum Elevation {')
  for (const [k, v] of Object.entries(t.elevation)) {
    const layers = v.layers.map(
      (s) =>
        `ShadowLayer(x: ${s.x}, y: ${s.y}, blur: ${s.blur}, color: Color(hex: 0x${s.color.slice(1)}, opacity: ${s.alpha}))`,
    )
    l.push(`        public static let ${k}: [ShadowLayer] = [${layers.join(', ')}]`)
  }
  l.push('    }', '}', '')
  return l.join('\n')
}

/** Ruta de cada salida (relativa al paquete) y la función que la produce. */
export const OUTPUTS: Record<string, (t: Tokens) => string> = {
  'generated/css/tokens.css': css,
  'generated/kotlin/TindivoTokens.kt': kotlin,
  'generated/swift/TindivoTokens.swift': swift,
}

export function render(t: Tokens): Record<string, string> {
  return Object.fromEntries(Object.entries(OUTPUTS).map(([path, fn]) => [path, fn(t)]))
}
