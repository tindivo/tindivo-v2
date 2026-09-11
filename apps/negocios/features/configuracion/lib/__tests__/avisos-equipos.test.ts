import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { desde, dia, PLATAFORMA } from '../avisos-equipos'

const AHORA = Date.parse('2026-09-09T20:00:00-05:00')

describe('desde · «¿este aparato sigue en uso?»', () => {
  it('nunca notificado no inventa una fecha', () => {
    // `null` es «sin avisos todavía», que la lista pinta distinto de «hace 40
    // días». Un aparato recién dado de alta no es un aparato abandonado.
    expect(desde(null, AHORA)).toBeNull()
  })

  it('una fecha ilegible se trata como ausente, no como el año 1970', () => {
    expect(desde('no es una fecha', AHORA)).toBeNull()
  })

  it('lo recién llegado se lee «hace un momento» y no «hace 0 min»', () => {
    expect(desde(new Date(AHORA - 30_000).toISOString(), AHORA)).toBe('hace un momento')
  })

  it('sube de minutos a horas y de horas a días', () => {
    expect(desde(new Date(AHORA - 20 * 60_000).toISOString(), AHORA)).toBe('hace 20 min')
    expect(desde(new Date(AHORA - 5 * 3_600_000).toISOString(), AHORA)).toBe('hace 5 h')
    expect(desde(new Date(AHORA - 3 * 86_400_000).toISOString(), AHORA)).toBe('hace 3 días')
  })

  it('un día se dice en singular', () => {
    expect(desde(new Date(AHORA - 26 * 3_600_000).toISOString(), AHORA)).toBe('hace 1 día')
  })

  it('EL CASO QUE JUSTIFICA LA LISTA: un equipo olvidado se ve olvidado', () => {
    // La purga por 404/410 no lo toca —sigue aceptando entregas— así que la
    // única señal de que nadie lo mira es esta.
    expect(desde(new Date(AHORA - 40 * 86_400_000).toISOString(), AHORA)).toBe('hace 40 días')
  })
})

describe('dia · desde cuándo está dado de alta', () => {
  it('se lee en la zona de Lima, que es donde está el local', () => {
    // Las 23:00 del 8 en Lima son las 04:00 del 9 en UTC. Sin la zona, el alta
    // de una noche de trabajo aparecería fechada al día siguiente.
    expect(dia('2026-08-13T04:00:00Z')).toContain('12')
  })

  it('una fecha ilegible no rompe la fila', () => {
    expect(dia('vacío')).toBe('—')
  })
})

describe('PLATAFORMA · los iconos salen del subset cerrado', () => {
  /**
   * `negocios` auto-hospeda Material Symbols recortada: un `name` que no esté en
   * `icons.txt` no rompe TypeScript ni el linter, se lee como texto cortado a un
   * garabato. El test general de iconos solo mira `name="..."` e `icon="..."`
   * literales en JSX, y estos llegan por una variable — así que se comprueban
   * aquí o no se comprueban en ningún sitio.
   */
  const inventario = new Set(
    readFileSync(resolve(__dirname, '../../../../public/fonts/icons.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  )

  it('todos los iconos de la tabla existen en la fuente', () => {
    const faltan = Object.values(PLATAFORMA)
      .map((p) => p.icon)
      .filter((icon) => !inventario.has(icon))
    expect(faltan).toEqual([])
  })

  it('las cuatro plataformas tienen nombre para una persona', () => {
    for (const [clave, meta] of Object.entries(PLATAFORMA)) {
      expect(meta.label.length, clave).toBeGreaterThan(0)
    }
  })
})
