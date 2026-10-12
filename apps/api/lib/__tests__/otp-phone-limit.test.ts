import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, memoryStore, resolveLimits } from '../http/rate-limit'
import { checkOtpPhoneLimit, phoneLimitKey } from '../otp/phone-limit'

const SECRET = 'secreto-de-prueba'
const rule = { limit: 3, windowSec: 86400 }
const PHONE = '+51999888777'

describe('phoneLimitKey', () => {
  it('no contiene el teléfono en claro y es estable', () => {
    const k = phoneLimitKey(PHONE, SECRET)
    expect(k).not.toContain('999888777')
    expect(k).toBe(phoneLimitKey(PHONE, SECRET))
    expect(k).toMatch(/^otp_phone:[0-9a-f]{64}$/)
  })
  it('cambia con el número y con el secreto', () => {
    expect(phoneLimitKey(PHONE, SECRET)).not.toBe(phoneLimitKey('+51999888778', SECRET))
    expect(phoneLimitKey(PHONE, SECRET)).not.toBe(phoneLimitKey(PHONE, 'otro'))
  })
})

describe('checkOtpPhoneLimit', () => {
  it('deja pasar hasta el tope y bloquea el siguiente, con Retry-After', async () => {
    const store = memoryStore()
    for (let i = 0; i < 3; i++) {
      expect(await checkOtpPhoneLimit(PHONE, { store, rule, secret: SECRET })).toEqual({
        allowed: true,
      })
    }
    const r = await checkOtpPhoneLimit(PHONE, { store, rule, secret: SECRET })
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.retryAfterSec).toBeGreaterThan(0)
  })
  it('cuenta por número: otro número tiene su propio cupo', async () => {
    const store = memoryStore()
    for (let i = 0; i < 4; i++) await checkOtpPhoneLimit(PHONE, { store, rule, secret: SECRET })
    expect(await checkOtpPhoneLimit('+51911111111', { store, rule, secret: SECRET })).toEqual({
      allowed: true,
    })
  })
  it('la ventana se reinicia', async () => {
    let t = 1_000
    const store = memoryStore(() => t)
    for (let i = 0; i < 4; i++) await checkOtpPhoneLimit(PHONE, { store, rule, secret: SECRET })
    t += 86_400_001
    expect(await checkOtpPhoneLimit(PHONE, { store, rule, secret: SECRET })).toEqual({
      allowed: true,
    })
  })
  it('sin almacén falla abierto', async () => {
    expect(await checkOtpPhoneLimit(PHONE, { store: null, rule, secret: SECRET })).toEqual({
      allowed: true,
    })
  })
  it('si el almacén revienta, falla abierto', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = {
      hit: async () => {
        throw new Error('redis caído')
      },
    }
    expect(await checkOtpPhoneLimit(PHONE, { store, rule, secret: SECRET })).toEqual({
      allowed: true,
    })
  })
})

describe('umbral otp_phone desde app_settings', () => {
  it('por defecto 3 en 24 h', () => {
    expect(DEFAULT_LIMITS.otp_phone).toEqual({ limit: 3, windowSec: 86400 })
  })
  it('el override de app_settings lo cambia sin tocar los demás', () => {
    const l = resolveLimits({ otp_phone: { limit: 5, windowSec: 3600 } })
    expect(l.otp_phone).toEqual({ limit: 5, windowSec: 3600 })
    expect(l.otp).toEqual(DEFAULT_LIMITS.otp)
  })
})
