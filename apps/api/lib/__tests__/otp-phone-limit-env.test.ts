import { afterEach, describe, expect, it, vi } from 'vitest'

const ctor = vi.hoisted(() => vi.fn())
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(cfg: unknown) {
      ctor(cfg)
    }
  },
}))

import { getPhoneLogStore, otpPhoneSecret, resetPhoneLogStore } from '../otp/phone-limit'
import { envValue } from '../otp/sms-guard.mjs'

afterEach(() => {
  vi.unstubAllEnvs()
  resetPhoneLogStore()
  ctor.mockClear()
})

describe('envValue · una sola normalización para el build y el runtime', () => {
  it('recorta y trata vacío como ausente', () => {
    expect(envValue({ A: ' tok \n' }, 'A')).toBe('tok')
    expect(envValue({ A: '   ' }, 'A')).toBeUndefined()
    expect(envValue({ A: '' }, 'A')).toBeUndefined()
    expect(envValue({}, 'A')).toBeUndefined()
  })
})

describe('getPhoneLogStore · pasa al SDK los valores recortados, los mismos que aprobó la puerta', () => {
  it('un token con espacios llega a Redis sin ellos', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '  https://x.upstash.io \n')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', ' token ')
    expect(await getPhoneLogStore()).not.toBeNull()
    expect(ctor).toHaveBeenCalledWith({ url: 'https://x.upstash.io', token: 'token' })
  })

  it('URL o token solo con espacios cuentan como ausentes: no hay almacén', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '   ')
    expect(await getPhoneLogStore()).toBeNull()
    expect(ctor).not.toHaveBeenCalled()
  })

  it('el secreto del HMAC también sale recortado', () => {
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', '  s3cr3t ')
    expect(otpPhoneSecret()).toBe('s3cr3t')
  })
})
