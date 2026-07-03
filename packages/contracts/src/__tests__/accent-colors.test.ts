import { describe, expect, it } from 'vitest'
import {
  ACCENT_COLOR_RE,
  AccentColorSchema,
  BUSINESS_ACCENT_PALETTE,
  DEFAULT_ACCENT_COLOR,
  isPaletteAccentColor,
} from '../accent-colors'

describe('AccentColorSchema', () => {
  it('acepta hex canónico (minúsculas sin #)', () => {
    expect(AccentColorSchema.parse('f97316')).toBe('f97316')
  })

  it.each([
    ['#F97316', 'f97316'],
    ['F97316', 'f97316'],
    [' f97316 ', 'f97316'],
    ['#e11d48', 'e11d48'],
  ])('normaliza %s → %s', (input, expected) => {
    expect(AccentColorSchema.parse(input)).toBe(expected)
  })

  it.each(['fff', 'f97316f', 'gggggg', '', '#'])('rechaza %j', (input) => {
    expect(AccentColorSchema.safeParse(input).success).toBe(false)
  })
})

describe('BUSINESS_ACCENT_PALETTE', () => {
  it('tiene exactamente 12 colores (Docs/06 §2)', () => {
    expect(BUSINESS_ACCENT_PALETTE).toHaveLength(12)
  })

  it('hex únicos, canónicos y con nombre', () => {
    const hexes = BUSINESS_ACCENT_PALETTE.map((c) => c.hex)
    expect(new Set(hexes).size).toBe(hexes.length)
    for (const { name, hex } of BUSINESS_ACCENT_PALETTE) {
      expect(hex).toMatch(ACCENT_COLOR_RE)
      expect(name.length).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_ACCENT_COLOR / isPaletteAccentColor', () => {
  it('el default de la DB pertenece a la paleta', () => {
    expect(DEFAULT_ACCENT_COLOR).toBe('f97316')
    expect(isPaletteAccentColor(DEFAULT_ACCENT_COLOR)).toBe(true)
  })

  it('un color legacy fuera de paleta (La Florencia) no pertenece', () => {
    expect(isPaletteAccentColor('e11d48')).toBe(false)
  })
})
