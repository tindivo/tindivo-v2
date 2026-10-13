import { describe, expect, it } from 'vitest'
import { canSendRealSms, missingPhoneLimitConfig } from '../otp/sms-guard.mjs'

const TWILIO = {
  TWILIO_ACCOUNT_SID: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  TWILIO_AUTH_TOKEN: 'token',
  TWILIO_VERIFY_SERVICE_SID: 'VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
}
const LIMIT = {
  OTP_PHONE_HMAC_SECRET: 'secreto',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'tok',
}

describe('canSendRealSms · lo decide la configuración, no el nombre del entorno', () => {
  it('con las tres variables de Twilio, puede', () => {
    expect(canSendRealSms(TWILIO)).toBe(true)
  })

  it('con las tres variables aunque el entorno sea «preview» o «development», puede', () => {
    expect(canSendRealSms({ ...TWILIO, VERCEL_ENV: 'preview', NODE_ENV: 'development' })).toBe(true)
  })

  it('sin ninguna variable (dev, CI, simulacro), no puede', () => {
    expect(canSendRealSms({})).toBe(false)
    // «production» sin Twilio tampoco puede: no hay con qué mandar
    expect(canSendRealSms({ NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe(false)
  })

  it.each(Object.keys(TWILIO))('si falta %s, no puede (twilioClient sería null)', (k) => {
    expect(canSendRealSms({ ...TWILIO, [k]: undefined })).toBe(false)
  })

  it('un valor vacío o solo espacios cuenta como ausente, igual que el cliente de Twilio', () => {
    expect(canSendRealSms({ ...TWILIO, TWILIO_AUTH_TOKEN: '  \n' })).toBe(false)
    expect(canSendRealSms({ ...TWILIO, TWILIO_AUTH_TOKEN: '' })).toBe(false)
  })
})

describe('missingPhoneLimitConfig · qué le falta al límite por número', () => {
  it('completo: nada falta', () => {
    expect(missingPhoneLimitConfig(LIMIT)).toEqual([])
  })

  it('sin nada: las tres, por nombre', () => {
    expect(missingPhoneLimitConfig({})).toEqual([
      'OTP_PHONE_HMAC_SECRET',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ])
  })

  it.each(Object.keys(LIMIT))('si falta solo %s, dice solo esa', (k) => {
    expect(missingPhoneLimitConfig({ ...LIMIT, [k]: '   ' })).toEqual([k])
  })
})
