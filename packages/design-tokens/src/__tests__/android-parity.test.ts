import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadTokens } from '../generate.ts'

const DS = fileURLToPath(
  new URL(
    '../../../../apps/android/core/designsystem/src/main/kotlin/com/tindivo/core/designsystem/',
    import.meta.url,
  ),
)
const read = (file: string) => readFileSync(DS + file, 'utf8')
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const tokens = loadTokens()

const WEIGHTS: Record<string, number> = { Normal: 400, Medium: 500, SemiBold: 600, Bold: 700 }

describe('los tokens coinciden con apps/android/core/designsystem de hoy', () => {
  it('colores: los mismos nombres y los mismos hex que Palette', () => {
    const src = read('TindivoColors.kt')
    const android: Record<string, string> = {}
    for (const m of src.matchAll(/val (\w+) = Color\(color = 0xFF([0-9A-F]{6})\)/g)) {
      android[lower(m[1] as string)] = `#${m[2]}`
    }
    const inverse = /inversePrimary = Color\(color = 0xFF([0-9A-F]{6})\)/.exec(src)
    android.brandInverse = `#${inverse?.[1]}`
    const json = Object.fromEntries(Object.entries(tokens.color).map(([k, v]) => [k, v.value]))
    expect(Object.keys(android).length).toBeGreaterThan(20)
    expect(json).toEqual(android)
  })

  it('tipografía: tamaño, interlineado, peso y tracking de cada estilo', () => {
    const src = read('TindivoType.kt')
    const android: Record<string, unknown> = {}
    const re =
      /(\w+) = style\(size = (\d+), line = (\d+), weight = FontWeight\.(\w+)(?:, tracking = (-?[\d.]+))?\)/g
    for (const m of src.matchAll(re)) {
      android[m[1] as string] = {
        size: Number(m[2]),
        line: Number(m[3]),
        weight: WEIGHTS[m[4] as string],
        tracking: m[5] ? Number(m[5]) : 0,
      }
    }
    expect(Object.keys(android)).toHaveLength(15)
    expect(tokens.type).toEqual(android)
    expect(/FontFamily\(/.test(src) && tokens.font.family).toBe('Geist')
  })

  it('radios: los de TindivoShapes', () => {
    const src = read('TindivoTheme.kt')
    const android: Record<string, number> = {}
    for (const m of src.matchAll(/(\w+) = RoundedCornerShape\((\d+)\.dp\)/g)) {
      android[m[1] as string] = Number(m[2])
    }
    const json = Object.fromEntries(Object.entries(tokens.radius).map(([k, v]) => [k, v.value]))
    expect(Object.keys(android)).toHaveLength(5)
    expect(json).toEqual(android)
  })

  it('espaciados: los de TindivoSpacing', () => {
    const src = read('TindivoTheme.kt')
    const android: Record<string, number> = {}
    for (const m of src.matchAll(/val (\w+): Dp = (\d+)\.dp/g)) {
      android[m[1] as string] = Number(m[2])
    }
    const json = Object.fromEntries(Object.entries(tokens.spacing).map(([k, v]) => [k, v.value]))
    expect(Object.keys(android)).toHaveLength(8)
    expect(json).toEqual(android)
  })
})
