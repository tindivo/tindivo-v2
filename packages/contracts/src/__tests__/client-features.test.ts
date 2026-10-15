import { describe, expect, it } from 'vitest'
import { ClientFeaturesSettingsSchema } from '../client-features'

describe('ClientFeaturesSettingsSchema', () => {
  it('acepta el record vacío (estado sembrado)', () => {
    expect(ClientFeaturesSettingsSchema.parse({ features: {} })).toEqual({ features: {} })
  })

  it('acepta una función con y sin mensaje', () => {
    const v = {
      features: {
        pago_yape: { enabled: false, message: 'Pago con Yape en mantenimiento' },
        mapa_vivo: { enabled: true },
      },
    }
    expect(ClientFeaturesSettingsSchema.parse(v)).toEqual(v)
  })

  it.each([
    'Pago',
    '1pago',
    'a',
    'pago-yape',
    'pago yape',
    `a${'b'.repeat(41)}`,
  ])('rechaza la clave inválida %s', (key) => {
    expect(
      ClientFeaturesSettingsSchema.safeParse({ features: { [key]: { enabled: true } } }).success,
    ).toBe(false)
  })

  it('rechaza un mensaje de más de 140 caracteres o vacío', () => {
    const con = (message: string) => ({ features: { f_x: { enabled: false, message } } })
    expect(ClientFeaturesSettingsSchema.safeParse(con('a'.repeat(140))).success).toBe(true)
    expect(ClientFeaturesSettingsSchema.safeParse(con('a'.repeat(141))).success).toBe(false)
    expect(ClientFeaturesSettingsSchema.safeParse(con('')).success).toBe(false)
  })

  it('rechaza enabled que no es booleano y la falta de features', () => {
    expect(
      ClientFeaturesSettingsSchema.safeParse({ features: { f_x: { enabled: 'no' } } }).success,
    ).toBe(false)
    expect(ClientFeaturesSettingsSchema.safeParse({}).success).toBe(false)
  })
})
