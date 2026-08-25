import { describe, expect, it } from 'vitest'
import { getLineError, getReferenceError, isLineOk, isReferenceOk } from '@/lib/address-validation'

describe('Address validation (isLineOk & getLineError)', () => {
  it('rechaza null, undefined o texto vacío', () => {
    expect(isLineOk(null)).toBe(false)
    expect(getLineError(null)).toBe('La dirección es obligatoria')
    expect(isLineOk('')).toBe(false)
    expect(isLineOk('   ')).toBe(false)
    expect(getLineError('   ')).toBe('Mínimo 5 caracteres')
  })

  it('rechaza direcciones con menos de 5 caracteres', () => {
    expect(isLineOk('Jr')).toBe(false)
    expect(isLineOk('Casa')).toBe(false)
    expect(getLineError('Jr')).toBe('Mínimo 5 caracteres')
  })

  it('rechaza direcciones compuestas solo por números', () => {
    expect(isLineOk('12345')).toBe(false)
    expect(getLineError('12345')).toBe('Ingresa una dirección real, no solo números')
  })

  it('rechaza caracteres repetidos (spam)', () => {
    expect(isLineOk('aaaaaa')).toBe(false)
    expect(getLineError('aaaaaa')).toBe('Evita repetir letras')
  })

  it('rechaza patrones repetitivos', () => {
    expect(isLineOk('callecalle')).toBe(false)
    expect(getLineError('callecalle')).toBe('Evita repetir patrones o palabras')
  })

  it('acepta direcciones reales válidas de San Jacinto', () => {
    expect(isLineOk('Jr. Sucre 412')).toBe(true)
    expect(getLineError('Jr. Sucre 412')).toBeNull()
    expect(isLineOk('Av. Los Incas s/n')).toBe(true)
    expect(isLineOk('Mz B Lote 14')).toBe(true)
    expect(isLineOk('Calle Comercio 123')).toBe(true)
  })
})

describe('Reference validation (isReferenceOk & getReferenceError)', () => {
  it('rechaza referencias con menos de 5 caracteres', () => {
    expect(isReferenceOk('')).toBe(false)
    expect(isReferenceOk('Hola')).toBe(false)
    expect(getReferenceError('Hola')).toBe('Mínimo 5 caracteres')
  })

  it('rechaza referencias solo con números', () => {
    expect(isReferenceOk('987654')).toBe(false)
    expect(getReferenceError('987654')).toBe('Agrega una descripción, no solo números')
  })

  it('rechaza patrones repetitivos en referencia', () => {
    expect(isReferenceOk('lalala')).toBe(false)
    expect(getReferenceError('lalala')).toBe('Evita repetir patrones o palabras')
  })

  it('acepta referencias descriptivas válidas', () => {
    expect(isReferenceOk('Frente a la bodega Don Lucho')).toBe(true)
    expect(getReferenceError('Frente a la bodega Don Lucho')).toBeNull()
    expect(isReferenceOk('Casa de reja negra, portón azul')).toBe(true)
    expect(isReferenceOk('Al costado de la botica San Martín')).toBe(true)
  })
})
