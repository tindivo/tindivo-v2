import { describe, expect, it } from 'vitest'
import { toWhatsappDigits } from '../mappers/whatsapp-digits'

describe('toWhatsappDigits (el WhatsApp de soporte de GET /public/config)', () => {
  it('deja solo los dígitos de un número bien escrito', () => {
    expect(toWhatsappDigits('51906550166')).toBe('51906550166')
    expect(toWhatsappDigits('+51987654321')).toBe('51987654321')
    expect(toWhatsappDigits(' +51 906-550 166 ')).toBe('51906550166')
    expect(toWhatsappDigits('(51) 906 550 166')).toBe('51906550166')
  })

  it('lo que no es un número de WhatsApp sale null', () => {
    expect(toWhatsappDigits(undefined)).toBeNull()
    expect(toWhatsappDigits(null)).toBeNull()
    expect(toWhatsappDigits(51906550166)).toBeNull()
    expect(toWhatsappDigits({ phone: '51906550166' })).toBeNull()
    expect(toWhatsappDigits('')).toBeNull()
    expect(toWhatsappDigits('   ')).toBeNull()
    expect(toWhatsappDigits('51906550166abc')).toBeNull()
    expect(toWhatsappDigits('wa.me/51906550166')).toBeNull()
    expect(toWhatsappDigits('51+906550166')).toBeNull()
  })

  it('pocos dígitos o más de los de E.164 salen null', () => {
    expect(toWhatsappDigits('12345678')).toBeNull()
    expect(toWhatsappDigits('123456789')).toBe('123456789')
    expect(toWhatsappDigits('123456789012345')).toBe('123456789012345')
    expect(toWhatsappDigits('1234567890123456')).toBeNull()
  })
})
