import { describe, expect, it } from 'vitest'
import { isUniform } from '../compress'

/** Construye `n` píxeles RGBA a partir de una función por índice. */
function pixels(n: number, at: (i: number) => [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = at(i)
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return data
}

describe('isUniform', () => {
  it('marca el canvas que nunca se pintó (todo transparente)', () => {
    // El fallo real de producción: WebP de 2.666 bytes, invisible sobre el
    // fondo claro de la vista previa.
    expect(isUniform(pixels(576, () => [0, 0, 0, 0]))).toBe(true)
  })

  it('marca el blanco liso que deja el fallback sin canal alfa', () => {
    expect(isUniform(pixels(576, () => [255, 255, 255, 255]))).toBe(true)
  })

  it('marca el negro liso', () => {
    expect(isUniform(pixels(576, () => [0, 0, 0, 255]))).toBe(true)
  })

  it('tolera el temblor de un JPEG sobre un fondo plano', () => {
    expect(isUniform(pixels(576, (i) => [250 + (i % 3), 250, 250, 255]))).toBe(true)
  })

  it('deja pasar una imagen con contenido', () => {
    // Mitad clara, mitad oscura: cualquier comprobante real tiene al menos esto.
    expect(
      isUniform(pixels(576, (i) => (i < 288 ? [255, 255, 255, 255] : [20, 20, 30, 255]))),
    ).toBe(false)
  })

  it('deja pasar una imagen casi lisa con un detalle', () => {
    expect(
      isUniform(pixels(576, (i) => (i === 400 ? [10, 10, 10, 255] : [255, 255, 255, 255]))),
    ).toBe(false)
  })

  it('no confunde transparencia parcial con vacío', () => {
    expect(isUniform(pixels(576, (i) => (i < 500 ? [0, 0, 0, 0] : [30, 90, 200, 255])))).toBe(false)
  })

  it('trata el buffer vacío como liso', () => {
    expect(isUniform(new Uint8ClampedArray(0))).toBe(true)
  })
})
