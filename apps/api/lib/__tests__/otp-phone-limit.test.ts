import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, resolveLimits } from '../http/rate-limit'
import {
  HMAC_CONTEXT,
  MAX_RESERVE_AGE_MS,
  memoryPhoneLog,
  otpPhoneSecret,
  phoneLimitKey,
  RELEASE_SCRIPT,
  RESERVE_SCRIPT,
  type ReserveResult,
  redisPhoneLog,
  reserveOtpPhone,
  TIME_SCRIPT,
  TOMBSTONE_TTL_MS,
  tombstoneKey,
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
    const store = { time: vi.fn(), reserve: vi.fn(), release: vi.fn() }
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: null })
    expect(g.allowed).toBe(true)
    expect(store.reserve).not.toHaveBeenCalled()
  })
  it('si el almacén revienta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = {
      time: async () => 0,
      reserve: async () => {
        throw new Error('redis caído')
      },
      release: async () => {},
    }
    expect((await reserveOtpPhone(PHONE, { store, rule, secret: SECRET })).allowed).toBe(true)
  })
  it('si el almacén no contesta, no cuelga: pasa al vencer el timeout', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = {
      time: async () => 0,
      reserve: () => new Promise<never>(() => {}),
      release: async () => {},
    }
    const t0 = Date.now()
    const g = await reserveOtpPhone(PHONE, { store, rule, secret: SECRET, timeoutMs: 20 })
    expect(g.allowed).toBe(true)
    expect(Date.now() - t0).toBeLessThan(500)
  })
  it('reserve vence por timeout: el release queda ligado al member y no espera a la reserva', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reserve = vi.fn(() => new Promise<never>(() => {}))
    const release = vi.fn(async () => {})
    const g = await reserveOtpPhone(PHONE, {
      store: { time: async () => 0, reserve, release },
      rule,
      secret: SECRET,
      timeoutMs: 10,
    })
    expect(g.allowed).toBe(true)
    if (g.allowed) await g.release()
    const [, member] = reserve.mock.calls[0] as unknown as [string, string]
    expect(release).toHaveBeenCalledWith(phoneLimitKey(PHONE, SECRET), member)
  })
  it('carrera: el EVAL de reserva se aplica DESPUES del release (y de cualquier tope de espera); cinco rechazos no agotan el número', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const mem = memoryPhoneLog()
      const pendientes: Array<() => void> = []
      // El EVAL llega a Redis tarde: tras vencer el timeout de reserve, tras el
      // release completo y tras 11 s (más que el antiguo tope de espera de 10 s).
      const store = {
        time: mem.time,
        reserve: (k: string, m: string, r: typeof rule, t0: number, now?: number) =>
          new Promise<Awaited<ReturnType<typeof mem.reserve>>>((resolve) => {
            pendientes.push(() => resolve(mem.reserve(k, m, r, t0, now)))
          }),
        release: mem.release,
      }
      const gatesP = Promise.all(
        Array.from({ length: 5 }, () =>
          reserveOtpPhone(PHONE, { store, rule, secret: SECRET, now: () => 1, timeoutMs: 10 }),
        ),
      )
      await vi.advanceTimersByTimeAsync(20)
      const gates = await gatesP
      const liberaciones = Promise.all(gates.map((g) => (g.allowed ? g.release() : undefined)))
      await vi.advanceTimersByTimeAsync(11_000)
      await liberaciones
      for (const aplicar of pendientes) aplicar() // los EVAL llegan después de todo
      await vi.advanceTimersByTimeAsync(0)
      // Los 5 huecos siguen libres: 5 envíos aceptados más caben.
      for (let i = 0; i < 5; i++) {
        const g = await reserveOtpPhone(PHONE, { store: mem, rule, secret: SECRET, now: () => 2 })
        expect(g.allowed).toBe(true)
      }
      const sexta = await reserveOtpPhone(PHONE, { store: mem, rule, secret: SECRET, now: () => 2 })
      expect(sexta.allowed).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
  it('memoryPhoneLog: release antes de reserve deja una lápida y la reserva no ocupa plaza', async () => {
    const mem = memoryPhoneLog()
    await mem.release('k', 'm1')
    expect((await mem.reserve('k', 'm1', rule, 1)).allowed).toBe(true)
    for (let i = 0; i < 5; i++)
      expect((await mem.reserve('k', `n${i}`, rule, 2)).allowed).toBe(true)
  })
  it('un release que falla no rompe la respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = {
      time: async () => 0,
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

describe('memoryPhoneLog: lápida y antigüedad de la reserva con UN solo reloj (el inyectado)', () => {
  const T0 = 1_700_000_000_000 // muy anterior al Date.now() real: delata mezclar relojes
  const una = { limit: 1, windowSec: 24 * 60 * 60 }
  /** ¿la reserva ocupó plaza? Con límite 1, un segundo member solo pasa si no. */
  async function ocupo(log: ReturnType<typeof memoryPhoneLog>, key: string, at: number) {
    return !(await log.reserve(key, `sonda-${key}`, una, at)).allowed
  }

  it('lápida viva antes del TTL: la reserva no ocupa plaza', async () => {
    const log = memoryPhoneLog()
    await log.release('k', 'm', T0)
    await log.reserve('k', 'm', una, T0 + TOMBSTONE_TTL_MS - 1)
    expect(await ocupo(log, 'k', T0 + TOMBSTONE_TTL_MS - 1)).toBe(false)
  })
  it('lápida caducada (en el TTL exacto) con reserva fresca: ya no frena, ocupa plaza', async () => {
    const log = memoryPhoneLog()
    await log.release('k', 'm', T0)
    const at = T0 + TOMBSTONE_TTL_MS
    expect((await log.reserve('k', 'm', una, at, at)).allowed).toBe(true)
    expect(await ocupo(log, 'k', at)).toBe(true)
  })
  it('lápida caducada y reserva ANTIGUA (emitida antes del release): no inserta', async () => {
    const log = memoryPhoneLog()
    await log.release('k', 'm', T0)
    const res = await log.reserve('k', 'm', una, T0, T0 + TOMBSTONE_TTL_MS + 1)
    expect(res).toMatchObject({ allowed: true, skipped: 'stale' })
    expect(await ocupo(log, 'k', T0 + TOMBSTONE_TTL_MS + 1)).toBe(false)
  })
  it('reserva que llega pasada su antigüedad máxima no inserta; en el límite sí', async () => {
    const log = memoryPhoneLog()
    const r1 = await log.reserve('a', 'm', una, T0, T0 + MAX_RESERVE_AGE_MS + 1)
    expect(r1).toMatchObject({ allowed: true, skipped: 'stale' })
    expect(await ocupo(log, 'a', T0 + MAX_RESERVE_AGE_MS + 1)).toBe(false)
    await log.reserve('b', 'm', una, T0, T0 + MAX_RESERVE_AGE_MS)
    expect(await ocupo(log, 'b', T0 + MAX_RESERVE_AGE_MS)).toBe(true)
  })
  it('emitida en el futuro (desfase de reloj negativo): no rompe, inserta', async () => {
    const log = memoryPhoneLog()
    await log.reserve('f', 'm', una, T0 + 10 * MIN, T0)
    expect(await ocupo(log, 'f', T0)).toBe(true)
  })
  it('la antigüedad máxima deja margen frente a la lápida', () => {
    expect(MAX_RESERVE_AGE_MS).toBe(5 * MIN)
    expect(MAX_RESERVE_AGE_MS).toBeLessThan(TOMBSTONE_TTL_MS)
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

describe('memoryPhoneLog imita el PEXPIRE del conjunto', () => {
  it('pasada la ventana desde la última plaza concedida, el conjunto caduca entero', async () => {
    const log = memoryPhoneLog()
    const r = { limit: 1, windowSec: 60 }
    expect((await log.reserve('k', 'a', r, 0)).allowed).toBe(true)
    expect((await log.reserve('k', 'b', r, 59_000)).allowed).toBe(false)
    expect((await log.reserve('k', 'c', r, 60_000)).allowed).toBe(true)
  })
})

describe('OTP_PHONE_HMAC_SECRET vacío no tumba serverEnv() (caché FRÍA)', () => {
  it("'' se trata como ausente: serverEnv() no lanza y el límite falla abierto registrándolo", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', '')
    vi.resetModules() // descarta la caché de serverEnv(): nadie la ha calentado
    const { serverEnv } = await import('../env')
    expect(() => serverEnv()).not.toThrow()
    expect(serverEnv().OTP_PHONE_HMAC_SECRET).toBeUndefined()
    expect(otpPhoneSecret()).toBeNull()
    expect(err).toHaveBeenCalled()
  })
  it('con valor lo conserva', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', 'abc')
    vi.resetModules()
    const { serverEnv } = await import('../env')
    expect(serverEnv().OTP_PHONE_HMAC_SECRET).toBe('abc')
  })
})

describe('redisPhoneLog llama al script con la forma esperada', () => {
  it('reserve → EVAL(script, [clave, lápida], [ventana ms, límite, miembro]); release → EVAL(lápida + ZREM)', async () => {
    const redis = {
      eval: vi.fn(async () => [0, 1234]),
    }
    const store = redisPhoneLog(redis)
    expect(await store.reserve('k', 'm', rule, 1_000)).toEqual({
      allowed: false,
      retryAfterMs: 1234,
    })
    expect(redis.eval).toHaveBeenCalledWith(
      RESERVE_SCRIPT,
      ['k', tombstoneKey('m')],
      [86_400_000, 5, 'm', 1_000],
    )
    await store.release('k', 'm')
    expect(redis.eval).toHaveBeenLastCalledWith(
      RELEASE_SCRIPT,
      ['k', tombstoneKey('m')],
      [TOMBSTONE_TTL_MS, 'm'],
    )
  })
  it('time → EVAL(TIME_SCRIPT) y devuelve ms numéricos', async () => {
    const redis = { eval: vi.fn(async () => 1_700_000_000_123) }
    expect(await redisPhoneLog(redis).time()).toBe(1_700_000_000_123)
    expect(redis.eval).toHaveBeenCalledWith(TIME_SCRIPT, [], [])
  })
  it("propaga `skipped` del script ('stale' y 'tombstone'); 'ok' no lo lleva", async () => {
    const out = (tercero: string) => ({ eval: vi.fn(async () => [1, 0, tercero]) })
    expect(await redisPhoneLog(out('stale')).reserve('k', 'm', rule, 1)).toEqual({
      allowed: true,
      skipped: 'stale',
    })
    expect(await redisPhoneLog(out('tombstone')).reserve('k', 'm', rule, 1)).toEqual({
      allowed: true,
      skipped: 'tombstone',
    })
    expect(await redisPhoneLog(out('ok')).reserve('k', 'm', rule, 1)).toEqual({ allowed: true })
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

describe('un solo reloj: el de Redis (reserveOtpPhone pide TIME antes de reservar)', () => {
  const T0 = 1_700_000_000_000

  /**
   * Doble de un Redis con reloj PROPIO (el del servidor), independiente de la app. Hace lo
   * que el Lua: lápida, antigüedad (`reloj() - t0`) y cupo. El Lua real se prueba en
   * `otp-phone-limit.redis.test.ts`. La fecha de emisión se toma con `find` para que el
   * mismo doble sirva contra el código anterior (que la pasa como 5.º argumento) y así
   * comprobar que (a) y (b) fallan contra él.
   */
  function redisConReloj(reloj: () => number) {
    const plazas = new Map<string, Map<string, number>>()
    const lapidas = new Map<string, number>()
    const reservas: string[] = []
    return {
      reservas,
      plazas: (k: string) => plazas.get(k)?.size ?? 0,
      time: async () => reloj(),
      reserve: async (
        k: string,
        m: string,
        r: { limit: number; windowSec: number },
        ...fechas: (number | undefined)[]
      ): Promise<ReserveResult> => {
        reservas.push(m)
        const emitida = fechas.find((f) => f !== undefined) as number
        const now = reloj()
        if ((lapidas.get(m) ?? 0) > now) return { allowed: true, skipped: 'tombstone' }
        if (now - emitida > MAX_RESERVE_AGE_MS) return { allowed: true, skipped: 'stale' }
        const set = plazas.get(k) ?? new Map<string, number>()
        plazas.set(k, set)
        if (set.size >= r.limit) return { allowed: false, retryAfterMs: 1_000 }
        set.set(m, now)
        return { allowed: true }
      },
      release: async (k: string, m: string) => {
        lapidas.set(m, reloj() + TOMBSTONE_TTL_MS)
        plazas.get(k)?.delete(m)
      },
    }
  }

  it('(a) Redis 6 min por delante de la app: el número agotado NO da permiso', async () => {
    const redis = redisConReloj(() => Date.now() + 6 * MIN)
    const key = phoneLimitKey(PHONE, SECRET)
    for (let i = 0; i < rule.limit; i++) {
      expect((await redis.reserve(key, `previo${i}`, rule, await redis.time())).allowed).toBe(true)
    }
    expect(redis.plazas(key)).toBe(rule.limit)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const g = await reserveOtpPhone(PHONE, { store: redis, rule, secret: SECRET })
    expect(g.allowed).toBe(false)
  })

  it('(b) app 56 min adelantada y reserva rezagada tras caducar la lápida: no inserta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let redisNow = T0
    const redis = redisConReloj(() => redisNow)
    let abrir: () => void = () => {}
    const puerta = new Promise<void>((r) => {
      abrir = r
    })
    const rezagado: Promise<unknown>[] = []
    const store = {
      ...redis,
      // el EVAL rezagado llega a Redis más tarde, con la lápida ya caducada
      reserve: (k: string, m: string, r: typeof rule, ...f: (number | undefined)[]) => {
        const p = puerta.then(() => redis.reserve(k, m, r, ...f))
        rezagado.push(p)
        return p
      },
    }
    const g = await reserveOtpPhone(PHONE, {
      store,
      rule,
      secret: SECRET,
      now: () => redisNow + 56 * MIN, // reloj de la app, 56 min por delante
      timeoutMs: 10,
    })
    expect(g.allowed).toBe(true) // venció el timeout: falla abierto
    if (g.allowed) await g.release()
    redisNow = T0 + TOMBSTONE_TTL_MS + 1_000 // la lápida ya caducó
    abrir()
    await Promise.all(rezagado)
    expect(redis.reservas).toHaveLength(1)
    expect(redis.plazas(phoneLimitKey(PHONE, SECRET))).toBe(0)
  })

  it("(c) 'stale' en vivo: un reintento con member nuevo y log de error", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reserve = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true, skipped: 'stale' })
      .mockResolvedValueOnce({ allowed: true })
    const time = vi.fn(async () => T0)
    const release = vi.fn(async () => {})
    const g = await reserveOtpPhone(PHONE, {
      store: { time, reserve, release },
      rule,
      secret: SECRET,
    })
    expect(g.allowed).toBe(true)
    expect(time).toHaveBeenCalledTimes(2)
    expect(reserve).toHaveBeenCalledTimes(2)
    const [m1, m2] = reserve.mock.calls.map((c) => c[1] as string)
    expect(m1).not.toBe(m2)
    expect(err).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(err.mock.calls)).not.toContain('999888777')
    // El release devuelve el member que sí quedó reservado.
    if (g.allowed) await g.release()
    expect(release).toHaveBeenCalledWith(phoneLimitKey(PHONE, SECRET), m2)
  })

  it("(c) 'stale' persistente: falla abierto con log de error, solo un reintento", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reserve = vi.fn(async () => ({ allowed: true as const, skipped: 'stale' as const }))
    const g = await reserveOtpPhone(PHONE, {
      store: { time: async () => T0, reserve, release: async () => {} },
      rule,
      secret: SECRET,
    })
    expect(g.allowed).toBe(true)
    expect(reserve).toHaveBeenCalledTimes(2)
    expect(err).toHaveBeenCalledTimes(2)
  })

  it("(c) 'tombstone' en vivo con member nuevo es imposible: se registra y se trata igual", async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reserve = vi.fn(async () => ({ allowed: true as const, skipped: 'tombstone' as const }))
    const g = await reserveOtpPhone(PHONE, {
      store: { time: async () => T0, reserve, release: async () => {} },
      rule,
      secret: SECRET,
    })
    expect(g.allowed).toBe(true)
    expect(reserve).toHaveBeenCalledTimes(2)
    expect(err).toHaveBeenCalledTimes(2)
  })

  it('si TIME falla, falla abierto como cualquier fallo de Redis y no reserva', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reserve = vi.fn()
    const g = await reserveOtpPhone(PHONE, {
      store: {
        time: async () => {
          throw new Error('redis caído')
        },
        reserve,
        release: async () => {},
      },
      rule,
      secret: SECRET,
    })
    expect(g.allowed).toBe(true)
    expect(reserve).not.toHaveBeenCalled()
    expect(err).toHaveBeenCalled()
  })
})
