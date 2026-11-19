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

  it('CSS: variables --tindivo-<nombre del canon>, sin pisar theme.css', () => {
    const css = render(tokens)['generated/css/tokens.css']
    expect(css).toContain('--tindivo-primary: #ee6417;')
    expect(css).toContain('--tindivo-primary-pressed: #cf4a0c;')
    expect(css).toContain('--tindivo-scrim: rgba(46, 50, 54, 0.48);')
    expect(css).toContain('--tindivo-radius-sheet: 28px;')
    expect(css).toContain('--tindivo-radius-pill: 999px;')
    expect(css).toContain('--tindivo-cta-height: 56px;')
    expect(css).toContain('--tindivo-title-screen-size: 26px;')
    expect(css).toContain('--tindivo-title-screen-line: 32px;')
    expect(css).toContain('--tindivo-chip-line: normal;')
    expect(css).toContain(
      '--tindivo-elevation1: 0 1px 2px rgba(46, 50, 54, 0.06), 0 4px 12px rgba(46, 50, 54, 0.06);',
    )
    expect(css).not.toMatch(/--color-/)
  })

  it('Kotlin: Compose con Color, dp y sp', () => {
    const kt = render(tokens)['generated/kotlin/TindivoTokens.kt']
    expect(kt).toContain('package com.tindivo.core.designsystem.tokens')
    expect(kt).toContain('val primary: Color = Color(0xFFEE6417)')
    expect(kt).toContain('val scrim: Color = Color(0x7A2E3236)')
    expect(kt).toContain('val radiusSheet: Dp = 28.dp')
    expect(kt).toContain(
      'val titleScreen = TypeToken(size = 26.sp, line = 32.sp, weight = FontWeight.Bold)',
    )
    expect(kt).toContain('val chip = TypeToken(size = 14.sp, line = TextUnit.Unspecified')
    expect(kt).toContain(
      'val elevation3 = listOf(ShadowLayer(x = 0.dp, y = 6.dp, blur = 16.dp, color = Color(0x59EE6417)))',
    )
  })

  it('Swift: SwiftUI con tipos public', () => {
    const sw = render(tokens)['generated/swift/TindivoTokens.swift']
    expect(sw).toContain('import SwiftUI')
    expect(sw).toContain('public static let primary = Color(hex: 0xEE6417)')
    expect(sw).toContain('public static let scrim = Color(hex: 0x2E3236, opacity: 0.48)')
    expect(sw).toContain('public static let radiusSheet: CGFloat = 28')
    expect(sw).toContain(
      'public static let titleScreen = TypeToken(size: 26, line: 32, weight: .bold)',
    )
    expect(sw).toContain(
      'public static let chip = TypeToken(size: 14, line: nil, weight: .semibold)',
    )
    expect(sw).toContain(
      'ShadowLayer(x: 0, y: 6, blur: 16, color: Color(hex: 0xEE6417, opacity: 0.35))',
    )
  })

  it('todas las salidas dicen que están generadas y de dónde', () => {
    for (const out of Object.values(render(tokens))) {
      expect(out).toContain('GENERADO')
      expect(out).toContain('packages/design-tokens/tokens.json')
      expect(out).not.toContain('\r')
    }
  })
})

describe('valores resueltos por el implementador, pendientes de Jesús', () => {
  it('body, secondaryHeight y chip llevan "pending" con su motivo', () => {
    const pending = [
      ...Object.entries(tokens.type),
      ...Object.entries(tokens.spacing),
      ...Object.entries(tokens.color),
      ...Object.entries(tokens.radius),
    ]
      .filter(([, v]) => 'pending' in v && v.pending)
      .map(([k]) => k)
    expect(pending.sort()).toEqual(['body', 'chip', 'secondaryHeight'])
  })
})

describe('parseTokens (rechaza lo malformado)', () => {
  const clone = () => structuredClone(JSON.parse(readFileSync(`${ROOT}tokens.json`, 'utf8')))

  it('un hex que no es #RRGGBB', () => {
    const bad = clone()
    bad.color.brand.value = '#F97'
    expect(() => parseTokens(bad)).toThrow(/color\.brand/)
  })

  it('un nombre repetido entre grupos', () => {
    const bad = clone()
    bad.spacing.primary = { value: 1 }
    expect(() => parseTokens(bad)).toThrow(/primary/)
  })

  it('un alfa fuera de 0 a 1', () => {
    const bad = clone()
    bad.color.scrim.alpha = 2
    expect(() => parseTokens(bad)).toThrow(/color.scrim/)
  })

  it('tolera "pending" (texto) y lo rechaza si no es texto o está vacío', () => {
    const ok = clone()
    ok.type.body.pending = 'motivo'
    expect(parseTokens(ok).type.body.pending).toBe('motivo')
    for (const bad of [5, '']) {
      const t = clone()
      t.spacing.secondaryHeight.pending = bad
      expect(() => parseTokens(t)).toThrow(/spacing.secondaryHeight/)
    }
  })

  it('un peso fuera de 400-700', () => {
    const bad = clone()
    bad.type.body.weight = 300
    expect(() => parseTokens(bad)).toThrow(/type.body/)
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
