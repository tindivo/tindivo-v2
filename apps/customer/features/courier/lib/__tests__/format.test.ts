import { describe, expect, it } from 'vitest'
import { formatCourierPrice, formatDistance, formatReadyIn } from '../format'

describe('formatCourierPrice', () => {
  it('quita los decimales cuando son .00', () => {
    expect(formatCourierPrice(3)).toBe('S/ 3')
  })

  it('conserva los decimales cuando no son cero', () => {
    expect(formatCourierPrice(3.5)).toBe('S/ 3.50')
  })
})

describe('formatDistance', () => {
  it('en metros por debajo de 1 km', () => {
    expect(formatDistance(850)).toBe('850 m')
  })

  it('en km con coma decimal por encima de 1 km', () => {
    expect(formatDistance(1200)).toBe('1,2 km')
  })

  it('vacío sin distancia', () => {
    expect(formatDistance(null)).toBe('')
  })
})

describe('formatReadyIn', () => {
  it('"Ya" para 0 minutos', () => {
    expect(formatReadyIn(0)).toBe('Ya')
  })

  it('minutos para el resto', () => {
    expect(formatReadyIn(20)).toBe('20 min')
  })
})
