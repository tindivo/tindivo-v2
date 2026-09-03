import { describe, expect, it } from 'vitest'
import {
  type AddressValue,
  canSaveAddress,
  getLineError,
  getMissingLabel,
  getReferenceError,
  isLineOk,
  isReferenceOk,
} from '@/lib/address-validation'

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

/**
 * LA REGRESIÓN QUE PAGÓ ESTA SUITE.
 *
 * En producción se guardaron direcciones apuntando al centro del pueblo: el
 * formulario escribía el centro de cobertura como coordenada al montar y
 * `canSave` solo miraba calle y referencia, así que alguien con prisa llenaba
 * los dos textos y guardaba la plaza como su casa. Es el mismo defecto que la
 * migración 0147 documenta del v1 y que el app del motorizado ya había cerrado.
 *
 * La regla que lo impide vive ahora en un único sitio, y esto es lo que la ata.
 */
describe('Se puede guardar una dirección (canSaveAddress & getMissingLabel)', () => {
  const completa: AddressValue = {
    label: 'Casa',
    line: 'Jr. Sucre 412',
    reference: 'Frente a la bodega de don Carlos, casa de reja negra',
    coords: { lat: -8.7431, lng: -78.3512 },
    accuracyM: 8,
  }

  it('NO deja guardar sin coordenadas, por muy bien llenado que esté el resto', () => {
    const sinPunto: AddressValue = { ...completa, coords: null, accuracyM: null }
    expect(canSaveAddress(sinPunto, true)).toBe(false)
    expect(getMissingLabel(sinPunto, true)).toBe('Falta marcar tu ubicación')
  })

  it('pide la ubicación ANTES que los textos: es lo que nadie sabía que faltaba', () => {
    const vacia: AddressValue = {
      label: 'Casa',
      line: '',
      reference: '',
      coords: null,
      accuracyM: null,
    }
    expect(getMissingLabel(vacia, true)).toBe('Falta marcar tu ubicación')
  })

  it('un punto ajustado a mano (sin precisión de GPS) vale igual', () => {
    const aMano: AddressValue = { ...completa, accuracyM: null }
    expect(canSaveAddress(aMano, true)).toBe(true)
    expect(getMissingLabel(aMano, true)).toBeNull()
  })

  it('fuera de la zona no se guarda, aunque haya punto', () => {
    expect(canSaveAddress(completa, false)).toBe(false)
    expect(getMissingLabel(completa, false)).toBe('Fuera de la zona de reparto')
  })

  it('nombra el texto que falta cuando la ubicación ya está puesta', () => {
    expect(getMissingLabel({ ...completa, line: 'Jr' }, true)).toBe('Falta tu dirección')
    expect(getMissingLabel({ ...completa, reference: 'casa' }, true)).toBe('Falta la referencia')
  })

  it('con todo en orden no falta nada', () => {
    expect(canSaveAddress(completa, true)).toBe(true)
    expect(getMissingLabel(completa, true)).toBeNull()
  })
})
