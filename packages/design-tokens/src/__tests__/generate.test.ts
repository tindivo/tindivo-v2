import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTokens, OUTPUTS, parseTokens, render } from '../generate.ts'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const tokens = loadTokens()

describe('render', () => {
  it('es determinista: dos corridas dan exactamente los mismos bytes', () => {
    expect(render(tokens)).toEqual(render(loadTokens()))
  })

  it('produce las tres salidas: CSS, Kotlin y Swift', () => {
    expect(Object.keys(render(tokens)).sort()).toEqual(Object.keys(OUTPUTS).sort())
    expect(Object.keys(OUTPUTS)).toEqual([
      'generated/css/tokens.css',
      'generated/kotlin/TindivoTokens.kt',
      'generated/swift/TindivoTokens.swift',
    ])
  })

  it('CSS: variables con prefijo --tindivo- (no pisan theme.css)', () => {
    const css = render(tokens)['generated/css/tokens.css']
    expect(css).toContain('--tindivo-color-brand: #f97316;')
    expect(css).toContain('--tindivo-color-brand-dark: #c2410c;')
    expect(css).toContain('--tindivo-radius-extra-large: 28px;')
    expect(css).toContain('--tindivo-spacing-primary-button-height: 52px;')
    expect(css).toContain('--tindivo-type-title-large-size: 20px;')
    expect(css).toContain('--tindivo-type-display-large-tracking: -0.5px;')
    expect(css).not.toMatch(/--color-/)
  })

  it('Kotlin: Compose con Color, dp y sp', () => {
    const kt = render(tokens)['generated/kotlin/TindivoTokens.kt']
    expect(kt).toContain('package com.tindivo.core.designsystem.tokens')
    expect(kt).toContain('val brand: Color = Color(0xFFF97316)')
    expect(kt).toContain('val extraLarge: Dp = 28.dp')
    expect(kt).toContain('val bodyLarge = TypeToken(size = 16.sp, line = 24.sp')
  })

  it('Swift: SwiftUI con tipos public', () => {
    const sw = render(tokens)['generated/swift/TindivoTokens.swift']
    expect(sw).toContain('import SwiftUI')
    expect(sw).toContain('public static let brand = Color(hex: 0xF97316)')
    expect(sw).toContain('public static let extraLarge: CGFloat = 28')
    expect(sw).toContain('public static let bodyLarge = TypeToken(size: 16, line: 24')
    expect(sw).toContain('weight: .semibold')
  })

  it('todas las salidas dicen que están generadas y de dónde', () => {
    for (const out of Object.values(render(tokens))) {
      expect(out).toContain('GENERADO')
      expect(out).toContain('packages/design-tokens/tokens.json')
      expect(out).not.toContain('\r')
    }
  })
})

describe('parseTokens (rechaza lo malformado)', () => {
  const clone = () => structuredClone(JSON.parse(readFileSync(`${ROOT}tokens.json`, 'utf8')))

  it('un hex que no es #RRGGBB', () => {
    const bad = clone()
    bad.color.brand.value = '#F97'
    expect(() => parseTokens(bad)).toThrow(/color\.brand/)
  })

  it('un peso fuera de 400-700', () => {
    const bad = clone()
    bad.type.bodyLarge.weight = 300
    expect(() => parseTokens(bad)).toThrow(/type\.bodyLarge/)
  })

  it('un nombre que no es camelCase', () => {
    const bad = clone()
    bad.spacing['bad-name'] = { value: 1 }
    expect(() => parseTokens(bad)).toThrow(/bad-name/)
  })
})

describe('las salidas versionadas están al día (lo mismo que `pnpm tokens:check`)', () => {
  for (const [path, content] of Object.entries(render(tokens))) {
    it(path, () => {
      const onDisk = readFileSync(ROOT + path, 'utf8').replace(/\r\n/g, '\n')
      expect(onDisk).toBe(content)
    })
  }
})
