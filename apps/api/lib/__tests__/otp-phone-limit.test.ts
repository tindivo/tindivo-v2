import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, resolveLimits } from '../http/rate-limit'
import {
  HMAC_CONTEXT,
  memoryPhoneLog,
  otpPhoneSecret,
  phoneLimitKey,
  RESERVE_SCRIPT,
  redisPhoneLog,
  reserveOtpPhone,
} from '../otp/phone-limit'

const SECRET = 'secreto-de-prueba'
const PHONE = '+51999888777'
const H = 60 * 60 * 1000
const MIN = 60 * 1000
const rule = { limit: 5, windowSec: 24 * 60 * 60 }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** Agota el cupo con envíos aceptados en los instantes dados. */
async function enviar(store: ReturnType<typeof memoryPhoneLog>, at: number[]) {
  for (const t of at) {
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => t })
    expect(g.allowed).toBe(true)
  }
}

describe('phoneLimitKey', () => {
  it('no contiene el teléfono en claro, es estable y tiene la forma esperada', () => {
    const k = phoneLimitKey(PHONE, SECRET)
    expect(k).not.toContain('999888777')
    expect(k).toBe(phoneLimitKey(PHONE, SECRET))
    expect(k).toMatch(/^tindivo:otp_phone:[0-9a-f]{64}$/)
  })
  it('cambia con el número y con el secreto', () => {
    expect(phoneLimitKey(PHONE, SECRET)).not.toBe(phoneLimitKey('+51999888778', SECRET))
    expect(phoneLimitKey(PHONE, SECRET)).not.toBe(phoneLimitKey(PHONE, 'otro'))
  })
  it('el HMAC lleva el contexto versionado', async () => {
    const { createHmac } = await import('node:crypto')
    const esperado = createHmac('sha256', SECRET).update(`${HMAC_CONTEXT}${PHONE}`).digest('hex')
    expect(HMAC_CONTEXT).toBe('tindivo:otp-phone:v1:')
    expect(phoneLimitKey(PHONE, SECRET)).toBe(`tindivo:otp_phone:${esperado}`)
  })
})

describe('ventana MÓVIL de 24 h (reloj inyectado)', () => {
  const T = 1_000_000_000_000

  it('un envío de hace 23 h 59 min todavía cuenta', async () => {
    const store = memoryPhoneLog()
    await enviar(store, [T - 24 * H + MIN, T - 2 * H, T - 3 * H, T - 4 * H, T - 5 * H])
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => T })
    expect(g.allowed).toBe(false)
    // Se libera cuando sale el más viejo: dentro de 1 min.
    if (!g.allowed) expect(g.retryAfterSec).toBe(60)
  })

  it('uno de hace 24 h 1 min ya no cuenta', async () => {
    const store = memoryPhoneLog()
    await enviar(store, [T - 24 * H - MIN, T - 2 * H, T - 3 * H, T - 4 * H, T - 5 * H])
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => T })
    expect(g.allowed).toBe(true)
  })

  it('no hay corte a medianoche UTC: 5 antes y 5 después de las 19:00 de Lima no caben', async () => {
    const MEDIANOCHE_UTC = Date.UTC(2026, 9, 12, 0, 0, 0)
    const store = memoryPhoneLog()
    await enviar(
      store,
      [1, 2, 3, 4, 5].map((i) => MEDIANOCHE_UTC - i * MIN),
    )
    const g = await reserveOtpPhone(PHONE, {
      store,
      rule,
      secret: SECRET,
      now: () => MEDIANOCHE_UTC + MIN,
    })
    expect(g.allowed).toBe(false)
  })

  it('cuenta por número: otro número tiene su propio cupo', async () => {
    const store = memoryPhoneLog()
    await enviar(store, [1, 2, 3, 4, 5])
    const g = await reserveOtpPhone('+51911111111', { store, rule, secret: SECRET, now: () => 6 })
    expect(g.allowed).toBe(true)
  })
})

describe('solo cuentan los envíos aceptados', () => {
  it('release devuelve la plaza: un rechazo de Twilio no gasta cupo', async () => {
    const store = memoryPhoneLog()
    for (let i = 0; i < 10; i++) {
      const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => i })
      expect(g.allowed).toBe(true)
      if (g.allowed) await g.release()
    }
    await enviar(store, [20, 21, 22, 23, 24])
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => 25 })
    expect(g.allowed).toBe(false)
  })

  it('sin carrera: 20 peticiones simultáneas con 5 plazas dejan pasar exactamente 5', async () => {
    const store = memoryPhoneLog()
    const out = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => 100 }),
      ),
    )
    expect(out.filter((g) => g.allowed)).toHaveLength(5)
  })
})

describe('falla abierto', () => {
  it('sin almacén', async () => {
    const g = await reserveOtpPhone(PHONE, { store: null, rule, secret: SECRET })
    expect(g.allowed).toBe(true)
  })
  it('sin secreto, aunque haya almacén (y no lo toca)', async () => {
    const store = { reserve: vi.fn(), release: vi.fn() }
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: null })
    expect(g.allowed).toBe(true)
    expect(store.reserve).not.toHaveBeenCalled()
  })
  it('si el almacén revienta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = {
      reserve: async () => {
        throw new Error('redis caído')
      },
      release: async () => {},
    }
    expect((await reserveOtpPhone(PHONE, { store, rule, secret: SECRET })).allowed).toBe(true)
  })
  it('si el almacén no contesta, no cuelga: pasa al vencer el timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = { reserve: () => new Promise<never>(() => {}), release: async () => {} }
    const t0 = Date.now()
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, timeoutMs: 20 })
    expect(g.allowed).toBe(true)
    expect(Date.now() - t0).toBeLessThan(500)
  })
  it('un release que falla no rompe la respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = {
      reserve: async () => ({ allowed: true as const }),
      release: async () => {
        throw new Error('redis caído')
      },
    }
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET })
    expect(g.allowed).toBe(true)
    if (g.allowed) await expect(g.release()).resolves.toBeUndefined()
  })
})

describe('otpPhoneSecret', () => {
  it('sin variable devuelve null y lo registra; nunca cae a otro secreto', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'no-debe-usarse')
    expect(otpPhoneSecret()).toBeNull()
    expect(err).toHaveBeenCalled()
  })
  it('con variable la devuelve', () => {
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', ' s3creto ')
    expect(otpPhoneSecret()).toBe('s3creto')
  })
})

describe('redisPhoneLog llama al script con la forma esperada', () => {
  it('reserve → EVAL(script, [clave], [now, ventana ms, límite, miembro]); release → ZREM', async () => {
    const redis = {
      eval: vi.fn(async () => [0, 1234]),
      zrem: vi.fn(async () => 1),
    }
    const store = redisPhoneLog(redis)
    expect(await store.reserve('k', 'm', rule, 42)).toEqual({ allowed: false, retryAfterMs: 1234 })
    expect(redis.eval).toHaveBeenCalledWith(RESERVE_SCRIPT, ['k'], [42, 86_400_000, 5, 'm'])
    await store.release('k', 'm')
    expect(redis.zrem).toHaveBeenCalledWith('k', 'm')
  })
})

describe('umbral otp_phone desde app_settings', () => {
  it('por defecto 5 en 24 h (decisión de Jesús, 2026-10-12)', () => {
    expect(DEFAULT_LIMITS.otp_phone).toEqual({ limit: 5, windowSec: 86400 })
  })
  it('el override de app_settings lo cambia sin tocar los demás', () => {
    const l = resolveLimits({ otp_phone: { limit: 7, windowSec: 3600 } })
    expect(l.otp_phone).toEqual({ limit: 7, windowSec: 3600 })
    expect(l.otp).toEqual(DEFAULT_LIMITS.otp)
  })
})
