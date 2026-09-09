import { describe, expect, it } from 'vitest'
import { construirSaludo, elegirFrase } from '../saludo'
import saludos from '../saludos.json'

const at = (hora: number) => new Date(2026, 8, 9, hora, 0, 0)

describe('elegirFrase · no repetir la de ayer', () => {
  it('nunca devuelve la frase anterior', () => {
    const anterior = saludos.frases[0] as string
    // Se barre el rango entero del azar: con cualquier valor tiene que esquivarla.
    for (let i = 0; i < 100; i++) {
      expect(elegirFrase(anterior, i / 100)).not.toBe(anterior)
    }
  })

  it('siempre devuelve una frase del repertorio', () => {
    for (let i = 0; i < 100; i++) {
      expect(saludos.frases).toContain(elegirFrase(null, i / 100))
    }
  })

  it('con azar en el borde no se sale del array', () => {
    // `Math.random()` nunca devuelve 1, pero un 1 por redondeo no puede dar
    // `undefined`: el saludo se lee en voz alta y diría "undefined".
    expect(elegirFrase(null, 1)).toBeTruthy()
    expect(elegirFrase(null, 0)).toBeTruthy()
  })

  it('si la anterior no está en el repertorio, elige igual', () => {
    expect(elegirFrase('una frase que ya no existe', 0.5)).toBeTruthy()
  })
})

describe('construirSaludo · saluda según la hora', () => {
  it('de mañana, de tarde y de noche', () => {
    const base = { negocio: 'La Florencia', anterior: null, azar: 0.3 }
    expect(construirSaludo({ ...base, ahora: at(11) }).cabecera).toBe('Buenos días, La Florencia')
    expect(construirSaludo({ ...base, ahora: at(13) }).cabecera).toBe('Buenas tardes, La Florencia')
    expect(construirSaludo({ ...base, ahora: at(19) }).cabecera).toBe('Buenas noches, La Florencia')
  })

  it('lo que se dice en voz alta lleva las dos partes', () => {
    const s = construirSaludo({ negocio: 'La Florencia', anterior: null, ahora: at(19), azar: 0 })
    expect(s.completo).toBe(`${s.cabecera}. ${s.frase}`)
  })
})

describe('el repertorio', () => {
  it('tiene frases de sobra para no cansar', () => {
    expect(saludos.frases.length).toBeGreaterThanOrEqual(20)
  })

  it('todas caben en una frase hablada', () => {
    // La voz va a ~1.1 de velocidad; por encima de 70 caracteres la cajera ya
    // está mirando la pantalla en vez de escuchando.
    for (const f of saludos.frases) expect(f.length).toBeLessThanOrEqual(70)
  })

  it('ninguna se repite', () => {
    expect(new Set(saludos.frases).size).toBe(saludos.frases.length)
  })
})
