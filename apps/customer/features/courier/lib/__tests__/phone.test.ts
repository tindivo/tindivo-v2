import { describe, expect, it } from 'vitest'
import { formatPePhone, normalizePePhoneInput } from '../phone'

describe('normalizePePhoneInput', () => {
  it('deja pasar hasta 9 dígitos y corta el resto', () => {
    expect(normalizePePhoneInput('987654321')).toBe('987654321')
    expect(normalizePePhoneInput('9876543210')).toBe('987654321')
  })

  it('quita lo que no es dígito', () => {
    expect(normalizePePhoneInput('987 654-321')).toBe('987654321')
    expect(normalizePePhoneInput('abc9x8')).toBe('98')
  })

  it('quita el prefijo 51 solo cuando sobra (pegado), no mientras se teclea', () => {
    expect(normalizePePhoneInput('+51 987 654 321')).toBe('987654321')
    expect(normalizePePhoneInput('51')).toBe('51')
    expect(normalizePePhoneInput('519')).toBe('519')
  })

  it('vacío sigue vacío', () => {
    expect(normalizePePhoneInput('')).toBe('')
  })
})

describe('formatPePhone', () => {
  it('agrupa de a tres, como se dicta un celular', () => {
    expect(formatPePhone('911111111')).toBe('911 111 111')
  })

  it('quita el prefijo del país', () => {
    expect(formatPePhone('+51 987654321')).toBe('987 654 321')
  })
})
