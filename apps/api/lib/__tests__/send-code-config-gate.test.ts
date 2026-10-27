import { beforeEach, describe, expect, it, vi } from 'vitest'

const alertOps = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => true))
const reserve = vi.hoisted(() => vi.fn())
const verifyCreate = vi.hoisted(() => vi.fn())
const twilioState = vi.hoisted(() => ({ client: null as unknown, sim: false }))

vi.mock('@/lib/ops/alert-ops', () => ({ alertOps }))
vi.mock('@/lib/http/auth', () => ({ requireRole: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    // Encadenable y «esperable»: cada .eq/.gte/.update devuelve algo que también se espera.
    // `data`: la fila que el simulacro sella (exige exactamente una, como /verify).
    const result = { count: 0, data: [{ user_id: 'u1' }], error: null }
    const chain = {
      select: () => q,
      eq: () => q,
      gte: () => q,
      update: () => q,
      insert: () => q,
    }
    // Una promesa REAL con los métodos encadenables, para poder hacerle `await`.
    const q: typeof chain & Promise<typeof result> = Object.assign(Promise.resolve(result), chain)
    return { from: () => q }
  },
}))
vi.mock('@/lib/otp/phone-limit', async (orig) => ({
  ...(await orig<typeof import('../otp/phone-limit')>()),
  reserveOtpPhone: reserve,
  getPhoneLogStore: async () => null,
}))
vi.mock('@/lib/http/rate-limit', () => ({
  loadLimits: async () => ({ otp_phone: { limit: 5, windowSec: 86400 } }),
}))
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void fn() }))
vi.mock('@/lib/twilio/client', () => ({
  DEV_OTP_CODE: '000000',
  VERIFY_SERVICE_SID: 'VAx',
  get twilioClient() {
    return twilioState.client
  },
  get OTP_DEV_SIMULATION() {
    return twilioState.sim
  },
}))

const TWILIO = {
  TWILIO_ACCOUNT_SID: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  TWILIO_AUTH_TOKEN: 'token-secreto-de-prueba',
  TWILIO_VERIFY_SERVICE_SID: 'VAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
}

async function call() {
  const { POST } = await import('../../app/api/v1/customer/phone/send-code/route')
  return POST(
    new Request('http://localhost:3001/api/v1/customer/phone/send-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
      body: JSON.stringify({ phone: '987654321' }),
    }),
  )
}

describe('send-code · segunda defensa de configuración', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    for (const k of [
      ...Object.keys(TWILIO),
      'OTP_PHONE_HMAC_SECRET',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ]) {
      vi.stubEnv(k, '')
    }
    alertOps.mockClear()
    reserve.mockReset().mockResolvedValue({ allowed: true, release: async () => {} })
    verifyCreate.mockReset().mockResolvedValue({ channel: 'sms' })
    twilioState.client = {
      verify: { v2: { services: () => ({ verifications: { create: verifyCreate } }) } },
    }
    twilioState.sim = false
  })

  it('puede mandar SMS reales y falta config: 503, no manda SMS, alerta sin valores', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    const res = await call()
    expect(res.status).toBe(503)
    expect(verifyCreate).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
    expect(alertOps).toHaveBeenCalledTimes(1)
    const [kind, detail] = alertOps.mock.calls[0] as unknown as [string, string]
    expect(kind).toBe('otp_phone_limit_misconfigured')
    expect(detail).toContain('OTP_PHONE_HMAC_SECRET')
    expect(detail).not.toContain(TWILIO.TWILIO_AUTH_TOKEN)
    expect(JSON.stringify(await res.json())).not.toContain('OTP_PHONE_HMAC_SECRET')
  })

  it('puede mandar SMS reales y la config está completa: envía como siempre', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    const res = await call()
    expect(res.status).toBe(200)
    expect(verifyCreate).toHaveBeenCalledTimes(1)
    expect(alertOps).not.toHaveBeenCalled()
  })

  it('no puede mandar SMS reales (simulacro): comportamiento actual, sin 503 ni alerta', async () => {
    twilioState.client = null
    twilioState.sim = true
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).data.channel).toBe('dev')
    expect(alertOps).not.toHaveBeenCalled()
  })

  it('sin Twilio y sin simulacro (producción mal configurada): el 500 de siempre', async () => {
    twilioState.client = null
    const res = await call()
    expect(res.status).toBe(500)
    expect(alertOps).not.toHaveBeenCalled()
  })
})
