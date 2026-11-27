import { describe, expect, it } from 'vitest'
import { parseAndroidPalette } from '../android-colors.ts'

describe('parseAndroidPalette', () => {
  it('lee colores opacos como #RRGGBB', () => {
    expect(parseAndroidPalette('val Brand = Color(color = 0xFFF97316)')).toEqual({
      Brand: '#F97316',
    })
  })

  it('un color con alfa 0x80 no se pierde: queda marcado con su alfa', () => {
    const p = parseAndroidPalette(
      'val Ink = Color(color = 0xFF1A1614)\nval Veil = Color(color = 0x802E3236)',
    )
    expect(p.Veil).toBe('#2E3236 (alfa 80)')
    expect(p.Ink).toBe('#1A1614')
  })

  it('falla con un Color( que no sabe leer, en vez de ignorarlo', () => {
    expect(() => parseAndroidPalette('val Raro = Color(red = 1f, green = 0f, blue = 0f)')).toThrow(
      /Raro/,
    )
  })
})
