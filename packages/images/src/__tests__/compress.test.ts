import { describe, expect, it } from 'vitest'
import { isUniform, scaleSteps } from '../compress'

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

describe('scaleSteps', () => {
  it('resuelve en una pasada lo que cabe en el doble del destino', () => {
    // La captura de pantalla típica: 1080×2400 a un lado máximo de 1600.
    expect(scaleSteps({ width: 1080, height: 2400 }, { width: 720, height: 1600 })).toEqual([
      { width: 720, height: 1600 },
    ])
  })

  it('baja de mitad en mitad cuando la reducción es grande', () => {
    expect(scaleSteps({ width: 4000, height: 3000 }, { width: 1200, height: 900 })).toEqual([
      { width: 2000, height: 1500 },
      { width: 1200, height: 900 },
    ])
  })

  it('nunca pide un canvas del tamaño del original', () => {
    // El defecto de la versión anterior: copiaba la imagen a un canvas de su
    // propio tamaño antes de empezar a encoger, y ese búfer de más era justo
    // lo que faltaba en el celular donde el dibujo salía en blanco.
    const source = { width: 8000, height: 6000 }
    const steps = scaleSteps(source, { width: 1000, height: 750 })
    expect(steps[0]).not.toEqual(source)
    for (const step of steps) {
      expect(step.width).toBeLessThan(source.width)
      expect(step.height).toBeLessThan(source.height)
    }
  })

  it('termina siempre en el destino exacto', () => {
    for (const source of [
      { width: 8000, height: 6000 },
      { width: 1080, height: 2400 },
      { width: 640, height: 480 },
    ]) {
      const target = { width: 300, height: 200 }
      expect(scaleSteps(source, target).at(-1)).toEqual(target)
    }
  })

  it('devuelve un paso aunque no haya nada que reducir', () => {
    // Sigue haciendo falta un canvas: es de donde sale el `toBlob`.
    expect(scaleSteps({ width: 500, height: 400 }, { width: 500, height: 400 })).toEqual([
      { width: 500, height: 400 },
    ])
  })
})
