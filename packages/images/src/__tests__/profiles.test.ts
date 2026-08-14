import { describe, expect, it } from 'vitest'
import { fitWithin, PROFILES } from '../profiles'

describe('fitWithin', () => {
  it('reduce el lado mayor al máximo conservando la proporción', () => {
    expect(fitWithin(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 })
  })

  it('usa el alto cuando la imagen es vertical', () => {
    expect(fitWithin(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 })
  })

  it('no amplía una imagen que ya cabe', () => {
    expect(fitWithin(320, 240, 1200)).toEqual({ width: 320, height: 240 })
  })

  it('deja intacta la imagen que mide justo el máximo', () => {
    expect(fitWithin(1200, 1200, 1200)).toEqual({ width: 1200, height: 1200 })
  })

  it('nunca devuelve un lado de 0 px en proporciones extremas', () => {
    const { width, height } = fitWithin(8000, 3, 1200)
    expect(width).toBe(1200)
    expect(height).toBeGreaterThanOrEqual(1)
  })
})

describe('PROFILES', () => {
  it('guarda el QR sin pérdida', () => {
    // Un QR con artefactos de compresión es un pedido que no se paga.
    expect(PROFILES.qr.lossless).toBe(true)
    expect(PROFILES.qr.quality).toBe(1)
  })

  it('comprime con pérdida el resto de imágenes', () => {
    for (const profile of ['logo', 'banner', 'product', 'proof'] as const) {
      expect(PROFILES[profile].lossless).toBe(false)
      expect(PROFILES[profile].quality).toBeLessThan(1)
    }
  })

  it('el comprobante va con más calidad que una foto de plato', () => {
    // La cajera LEE el comprobante (nombre, monto, hora) para validar el pago;
    // la foto del plato solo se mira.
    expect(PROFILES.proof.quality).toBeGreaterThan(PROFILES.product.quality)
    expect(PROFILES.proof.maxEdge).toBeGreaterThanOrEqual(PROFILES.product.maxEdge)
  })
})
