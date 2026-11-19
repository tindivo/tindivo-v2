import { beforeEach, describe, expect, it, vi } from 'vitest'

const alertOps = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => true))
const reserve = vi.hoisted(() => vi.fn())
const verifyCreate = vi.hoisted(() => vi.fn())
const twilioState = vi.hoisted(() => ({ client: null as unknown, sim: false }))
// Lo que responde la base simulada: los envíos de las últimas 24 h y las filas de `app_settings` del celular.
const dbState = vi.hoisted(() => ({
  settings: [] as { key: string; value: unknown }[],
  // Lo que responde `reserve_phone_code`: permitido, denegado o con error.
  reserve: { data: true as unknown, error: null as null | { message: string } },
  reserveCalls: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/ops/alert-ops', () => ({ alertOps }))
vi.mock('@/lib/http/auth', () => ({ requireRole: async () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    // Encadenable y «esperable»: cada .eq/.gte/.update devuelve algo que también se espera.
    const make = (table: string) => {
      const result =
        table === 'app_settings'
          ? { count: null, data: dbState.settings, error: null }
          : { count: 0, data: [{ user_id: 'u1' }], error: null }
      const chain = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        in: () => q,
        update: () => q,
        insert: () => q,
      }
      // Una promesa REAL con los métodos encadenables, para poder hacerle `await`.
      const q: typeof chain & Promise<typeof result> = Object.assign(Promise.resolve(result), chain)
      return q
    }
    // El simulacro sella con la misma RPC que /verify (0277).
    return {
      from: (table: string) => make(table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'reserve_phone_code') {
          dbState.reserveCalls.push(args)
          return dbState.reserve
        }
        return { data: { status: 'verified' }, error: null }
      },
    }
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
    dbState.reserve = { data: true, error: null }
    dbState.reserveCalls = []
    dbState.settings = []
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

  it('CA-AUT-12 · el tope de app_settings llega a la reserva: con 1 el segundo envío da 429 y no manda SMS', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    dbState.settings = [{ key: 'phone_code_max_per_24h', value: 1 }]
    dbState.reserve = { data: false, error: null }
    const res = await call()
    expect(res.status).toBe(429)
    expect(dbState.reserveCalls).toEqual([{ p_user_id: 'u1', p_phone: '+51987654321', p_max: 1 }])
    expect(verifyCreate).not.toHaveBeenCalled()
  })

  it('CA-AUT-12 · sin la fila de app_settings rige el tope de siempre (3)', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    expect((await call()).status).toBe(200)
    expect(dbState.reserveCalls.map((c) => c.p_max)).toEqual([3])
  })

  it('CAX-002 · la reserva va antes de Twilio y un envío permitido lo manda', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    const order: string[] = []
    verifyCreate.mockImplementation(async () => {
      order.push('twilio')
      return { channel: 'sms' }
    })
    const before = dbState.reserveCalls.length
    expect((await call()).status).toBe(200)
    expect(dbState.reserveCalls.length).toBe(before + 1)
    expect(order).toEqual(['twilio'])
  })

  it('CAX-002 · un error de reserva rechaza con 503, no manda SMS y libera la plaza del número', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    dbState.reserve = { data: null, error: { message: 'conexión perdida' } }
    const release = vi.fn(async () => {})
    reserve.mockReset().mockResolvedValue({ allowed: true, release })
    const res = await call()
    expect(res.status).toBe(503)
    expect(verifyCreate).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('CAX-002 · una respuesta de reserva que no es booleana también rechaza', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    dbState.reserve = { data: null, error: null }
    expect((await call()).status).toBe(503)
    expect(verifyCreate).not.toHaveBeenCalled()
  })

  it('CAX-002 · si la cuenta se borró mientras tanto, 401 y no se manda SMS', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    dbState.reserve = { data: null, error: { message: 'account was deleted' } }
    expect((await call()).status).toBe(401)
    expect(verifyCreate).not.toHaveBeenCalled()
  })

  it('CAX-002 · si Twilio falla después de reservar, el cupo no se devuelve (no hay segunda llamada a la base)', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    verifyCreate.mockRejectedValue({ code: 60200, status: 400, message: 'x' })
    await call()
    expect(dbState.reserveCalls.length).toBe(1)
  })

  it('CAX-003 · ningún log lleva el teléfono entero, el código maestro ni el mensaje de Twilio', async () => {
    for (const [k, v] of Object.entries(TWILIO)) vi.stubEnv(k, v)
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't')
    const lines: string[] = []
    const spies = (['error', 'warn', 'log', 'info'] as const).map((m) =>
      vi
        .spyOn(console, m)
        .mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' '))),
    )
    verifyCreate.mockRejectedValue({
      code: 60200,
      status: 400,
      message: 'Invalid parameter To: +51987654321 código 000000',
    })
    await call()
    dbState.reserve = { data: null, error: { message: 'fallo con +51987654321' } }
    await call()
    twilioState.client = null
    twilioState.sim = true
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 's')
    dbState.reserve = { data: true, error: null }
    await call()
    for (const s of spies) s.mockRestore()
    const all = lines.join('\n')
    expect(all).toContain('code=60200')
    expect(all).toContain('+51******321')
    expect(all).not.toContain('987654321')
    expect(all).not.toContain('000000')
    expect(all).not.toContain('Invalid parameter')
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
