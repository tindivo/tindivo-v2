/**
 * Genera las salidas de diseño de Tindivo (CSS, Kotlin, Swift) desde `tokens.json`, la única fuente.
 * Es una función pura de los tokens: mismo JSON, mismos bytes. Sin dependencias.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export interface ColorToken {
  value: string
  discrepancy?: string
}
export interface NumberToken {
  value: number
  discrepancy?: string
}
export interface TypeToken {
  size: number
  line: number
  weight: 400 | 500 | 600 | 700
  tracking: number
}
export interface Tokens {
  version: number
  source: string
  font: { family: string }
  color: Record<string, ColorToken>
  radius: Record<string, NumberToken>
  spacing: Record<string, NumberToken>
  type: Record<string, TypeToken>
}

export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

const NAME = /^[a-z][a-zA-Z0-9]*$/
const HEX = /^#[0-9A-F]{6}$/
const WEIGHTS = [400, 500, 600, 700]

function fail(path: string, why: string): never {
  throw new Error(`tokens.json: ${path} ${why}`)
}

function group<T>(
  raw: unknown,
  name: string,
  check: (path: string, v: Record<string, unknown>) => void,
): Record<string, T> {
  if (typeof raw !== 'object' || raw === null) fail(name, 'debe ser un objeto')
  for (const [key, v] of Object.entries(raw)) {
    const path = `${name}.${key}`
    if (!NAME.test(key)) fail(path, 'el nombre debe ser camelCase')
    if (typeof v !== 'object' || v === null) fail(path, 'debe ser un objeto')
    check(path, v as Record<string, unknown>)
  }
  return raw as Record<string, T>
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Valida la forma de `tokens.json`; lanza con la ruta del token que falla. */
export function parseTokens(raw: unknown): Tokens {
  const r = raw as Record<string, unknown>
  if (r?.version !== 1) fail('version', 'debe ser 1')
  const font = r.font as { family?: unknown } | undefined
  if (typeof font?.family !== 'string' || font.family === '') fail('font.family', 'falta')
  const color = group<ColorToken>(r.color, 'color', (p, v) => {
    if (typeof v.value !== 'string' || !HEX.test(v.value)) fail(p, 'debe ser #RRGGBB en mayúsculas')
  })
  const num = (p: string, v: Record<string, unknown>) => {
    if (!isNum(v.value) || v.value < 0) fail(p, 'debe ser un número >= 0')
  }
  const radius = group<NumberToken>(r.radius, 'radius', num)
  const spacing = group<NumberToken>(r.spacing, 'spacing', num)
  const type = group<TypeToken>(r.type, 'type', (p, v) => {
    if (!isNum(v.size) || !isNum(v.line) || !isNum(v.tracking)) {
      fail(p, 'size, line y tracking son números')
    }
    if (!WEIGHTS.includes(v.weight as number)) {
      fail(p, 'el peso debe ser 400, 500, 600 o 700 (la fuente variable)')
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
  }
}

export function loadTokens(): Tokens {
  return parseTokens(JSON.parse(readFileSync(`${PACKAGE_ROOT}tokens.json`, 'utf8')))
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const HEADER = [
  'GENERADO por packages/design-tokens/src/cli.ts desde packages/design-tokens/tokens.json.',
  'No se edita a mano: se cambia tokens.json y se corre `pnpm tokens:build`.',
]

function css(t: Tokens): string {
  const l = [
    `/* ${HEADER[0]}`,
    `   ${HEADER[1]} */`,
    '',
    ':root {',
    `  --tindivo-font-family: '${t.font.family}';`,
  ]
  for (const [k, v] of Object.entries(t.color)) {
    l.push(`  --tindivo-color-${kebab(k)}: ${v.value.toLowerCase()};`)
  }
  for (const [k, v] of Object.entries(t.radius))
    l.push(`  --tindivo-radius-${kebab(k)}: ${v.value}px;`)
  for (const [k, v] of Object.entries(t.spacing)) {
    l.push(`  --tindivo-spacing-${kebab(k)}: ${v.value}px;`)
  }
  for (const [k, v] of Object.entries(t.type)) {
    const p = `--tindivo-type-${kebab(k)}`
    l.push(`  ${p}-size: ${v.size}px;`, `  ${p}-line: ${v.line}px;`)
    l.push(`  ${p}-weight: ${v.weight};`, `  ${p}-tracking: ${v.tracking}px;`)
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
    '    val tracking: TextUnit,',
    ')',
    '',
    'object TindivoTokens {',
    `    const val FONT_FAMILY = "${t.font.family}"`,
    '',
    '    object Colors {',
  ]
  for (const [k, v] of Object.entries(t.color)) {
    l.push(`        val ${k}: Color = Color(0xFF${v.value.slice(1)})`)
  }
  l.push('    }', '', '    object Radius {')
  for (const [k, v] of Object.entries(t.radius)) l.push(`        val ${k}: Dp = ${v.value}.dp`)
  l.push('    }', '', '    object Spacing {')
  for (const [k, v] of Object.entries(t.spacing)) l.push(`        val ${k}: Dp = ${v.value}.dp`)
  l.push('    }', '', '    object Typography {')
  for (const [k, v] of Object.entries(t.type)) {
    const w = `FontWeight.${KT_WEIGHT[v.weight]}`
    l.push(
      `        val ${k} = TypeToken(size = ${v.size}.sp, line = ${v.line}.sp, weight = ${w}, tracking = ${v.tracking}.sp)`,
    )
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
    '/// Un estilo de texto: la familia (Geist) la pone quien lo usa.',
    'public struct TypeToken: Sendable {',
    '    public let size: CGFloat',
    '    public let line: CGFloat',
    '    public let weight: Font.Weight',
    '    public let tracking: CGFloat',
    '}',
    '',
    'extension Color {',
    '    fileprivate init(hex: UInt32) {',
    '        self.init(',
    '            .sRGB,',
    '            red: Double((hex >> 16) & 0xFF) / 255,',
    '            green: Double((hex >> 8) & 0xFF) / 255,',
    '            blue: Double(hex & 0xFF) / 255,',
    '            opacity: 1',
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
    l.push(`        public static let ${k} = Color(hex: 0x${v.value.slice(1)})`)
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
    l.push(
      `        public static let ${k} = TypeToken(size: ${v.size}, line: ${v.line}, weight: .${SW_WEIGHT[v.weight]}, tracking: ${v.tracking})`,
    )
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
