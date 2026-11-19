import { describe, expect, it } from 'vitest'
import { courierReferenceError } from '../reference'

describe('referencia de un punto de Entregas (regla del formulario, D-31)', () => {
  it('CA-ADR-01 · pide al menos 15 caracteres tras recortar', () => {
    expect(courierReferenceError('Frente al pozo')).toBe(
      'La referencia debe tener al menos 15 caracteres',
    )
    expect(courierReferenceError('  Frente al pozo  ')).not.toBeNull()
    expect(courierReferenceError('Frente al pozo.')).toBeNull()
  })

  it('CA-ADR-02 · rechaza el texto basura aunque sea largo', () => {
    expect(courierReferenceError('lala lala lala lala')).not.toBeNull()
    expect(courierReferenceError('123456789012345678')).not.toBeNull()
  })

  it('vacío es un error', () => {
    expect(courierReferenceError('')).not.toBeNull()
  })
})
