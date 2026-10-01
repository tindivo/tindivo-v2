import { describe, expect, it } from 'vitest'
import { formatCourierHours, formatCourierPrice, formatDistance, formatOpensAt } from '../format'

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

describe('formatCourierHours', () => {
  it('un solo «pm» cuando los dos extremos son de noche', () => {
    expect(formatCourierHours({ start: '18:00', end: '23:00' })).toBe('6 a 11 pm')
  })

  it('los dos meridianos cuando cruza el mediodía', () => {
    expect(formatCourierHours({ start: '11:30', end: '15:00' })).toBe('11:30 am a 3 pm')
  })

  it('vacío sin horario', () => {
    expect(formatCourierHours(null)).toBe('')
  })
})

describe('formatOpensAt', () => {
  it('dice la hora de apertura', () => {
    expect(formatOpensAt({ start: '18:00' })).toBe('Abre a las 6 pm')
  })
})
