import { describe, expect, it } from 'vitest'
import {
  SERVICE_DAY_START_HOUR,
  serviceDate,
  serviceDateRange,
  serviceDayStart,
} from '../service-date'

/**
 * Los instantes se escriben en UTC a propósito. Lima es UTC−5, así que
 * `2026-08-21T04:59:00Z` es la 23:59 del 20 en Lima: si alguien "arregla" la
 * función restando horas al sitio equivocado, estos casos lo cazan.
 */
const at = (iso: string) => new Date(iso)

describe('serviceDate', () => {
  it('de tarde y de noche, la jornada es el día de Lima', () => {
    // 18:00 Lima del 20 = 23:00 UTC del 20
    expect(serviceDate(at('2026-08-20T23:00:00Z'))).toBe('2026-08-20')
    // 23:59 Lima del 20 = 04:59 UTC del 21
    expect(serviceDate(at('2026-08-21T04:59:00Z'))).toBe('2026-08-20')
  })

  it('pasada la medianoche la jornada NO cambia: la madrugada es de la noche anterior', () => {
    // 00:30 Lima del 21 = 05:30 UTC del 21. La cajera sigue trabajando.
    expect(serviceDate(at('2026-08-21T05:30:00Z'))).toBe('2026-08-20')
    // 04:59 Lima del 21 = 09:59 UTC del 21, el último minuto de la jornada.
    expect(serviceDate(at('2026-08-21T09:59:00Z'))).toBe('2026-08-20')
  })

  it('a las 05:00 de Lima empieza la jornada siguiente', () => {
    // 05:00 Lima del 21 = 10:00 UTC del 21.
    expect(serviceDate(at('2026-08-21T10:00:00Z'))).toBe('2026-08-21')
  })

  it('el corte cruza el cambio de mes sin restarle uno al string', () => {
    // 00:30 Lima del 1 de septiembre = 05:30 UTC del 1. Jornada: 31 de agosto.
    expect(serviceDate(at('2026-09-01T05:30:00Z'))).toBe('2026-08-31')
  })

  it('y el cambio de año', () => {
    // 00:30 Lima del 1 de enero de 2027 = 05:30 UTC del 1.
    expect(serviceDate(at('2027-01-01T05:30:00Z'))).toBe('2026-12-31')
  })
})

describe('serviceDayStart', () => {
  it('devuelve las 05:00 de Lima de la jornada en curso', () => {
    expect(serviceDayStart(at('2026-08-20T23:00:00Z'))).toBe('2026-08-20T05:00:00-05:00')
    // Mismo turno, ya pasada la medianoche: MISMO inicio de ventana.
    expect(serviceDayStart(at('2026-08-21T05:30:00Z'))).toBe('2026-08-20T05:00:00-05:00')
  })

  it('el instante que produce es anterior al de la consulta, siempre', () => {
    for (const iso of [
      '2026-08-20T23:00:00Z',
      '2026-08-21T04:59:00Z',
      '2026-08-21T05:30:00Z',
      '2026-08-21T09:59:00Z',
      '2026-08-21T10:00:00Z',
    ]) {
      expect(Date.parse(serviceDayStart(at(iso)))).toBeLessThanOrEqual(Date.parse(iso))
    }
  })

  it('la ventana nunca abarca más de 24 horas', () => {
    // Justo antes del corte es cuando la jornada es más larga.
    const justoAntes = at('2026-08-21T09:59:00Z')
    const horas = (justoAntes.getTime() - Date.parse(serviceDayStart(justoAntes))) / 3_600_000
    expect(horas).toBeLessThan(24)
  })

  it('la hora del corte es la que declara la constante', () => {
    // Si alguien mueve el corte sin tocar la 0154, esto no lo caza — pero deja
    // dicho que las dos mitades tienen que moverse juntas.
    expect(SERVICE_DAY_START_HOUR).toBe(5)
  })
})

describe('serviceDateRange', () => {
  // 23:30 Lima del 11-oct = 04:30 UTC del 12-oct: la fecha UTC ya es "mañana".
  const noche = at('2026-10-11T23:30:00-05:00')

  it('7 días: to es la jornada de Lima (11) y from 6 días antes, no corrida por UTC', () => {
    expect(serviceDateRange(7, noche)).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('14 y 30 días incluyen el día de hoy en la cuenta', () => {
    expect(serviceDateRange(14, noche)).toEqual({ from: '2026-09-28', to: '2026-10-11' })
    expect(serviceDateRange(30, noche)).toEqual({ from: '2026-09-12', to: '2026-10-11' })
  })

  it('de madrugada usa la jornada anterior', () => {
    // 02:00 Lima del 12 = 07:00 UTC del 12; la jornada sigue siendo la del 11
    expect(serviceDateRange(7, at('2026-10-12T07:00:00Z')).to).toBe('2026-10-11')
  })

  it('cruza mes y año restando sobre la cadena', () => {
    expect(serviceDateRange(7, at('2027-01-03T12:00:00-05:00'))).toEqual({
      from: '2026-12-28',
      to: '2027-01-03',
    })
    expect(serviceDateRange(2, at('2028-03-01T12:00:00-05:00')).from).toBe('2028-02-29')
  })
})
