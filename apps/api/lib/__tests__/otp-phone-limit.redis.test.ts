/**
 * El script Lua de `phone-limit.ts` contra un Redis REAL (7.x). Los otros tests
 * ejecutan `memoryPhoneLog`, que pasaría con el Lua roto: este es el único que
 * prueba `RESERVE_SCRIPT`.
 *
 * Necesita `REDIS_URL` (en CI lo da el servicio `redis:7` del job de
 * integración). En local, sin `REDIS_URL`, se salta con aviso; en CI faltar es
 * un fallo, no un salto. Local: `docker run --rm -p 6379:6379 redis:7` y
 * `REDIS_URL=redis://127.0.0.1:6379`.
 *
 * UN SOLO RELOJ: el de Redis. `t0` (la hora de emisión) sale de `store.time()` y el
 * script la compara con su propio `TIME`. Los eventos pasados se siembran con ZADD
 * directo, con scores calculados desde el `TIME` del propio servidor.
 */
import { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_RESERVE_AGE_MS,
  type PhoneLogStore,
  phoneLimitKey,
  RESERVE_SCRIPT,
  redisPhoneLog,
  reserveOtpPhone,
  TOMBSTONE_TTL_MS,
  tombstoneKey,
} from '../otp/phone-limit'

const REDIS_URL = process.env.REDIS_URL
const H = 60 * 60 * 1000
const MIN = 60 * 1000
const rule = { limit: 5, windowSec: 24 * 60 * 60 }
const RUN = `${process.pid}-${Date.now()}`
const KEY = `tindivo:test:otp_phone:${RUN}`
/** Members únicos por ejecución: las lápidas viven 1 h en un Redis compartido. */
const mb = (n: string) => `${RUN}:${n}`
const ALL = ['tarde', 'antes', 'vieja', 'fresca', 'futura'].map(mb)

if (!REDIS_URL) {
  console.warn(
    '[otp-phone-limit.redis] REDIS_URL no definido: se SALTA la prueba del script Lua contra Redis real.',
  )
}

describe('REDIS_URL en CI', () => {
  it('está definido (si no, el test del script Lua se saltaría en silencio)', () => {
    if (process.env.CI) expect(REDIS_URL).toBeTruthy()
  })
})

describe.skipIf(!REDIS_URL)('RESERVE_SCRIPT contra Redis real', () => {
  let redis: Redis
  let store: PhoneLogStore

  /** `TIME` de Redis en ms, la misma fuente que usa el script. */
  async function redisNow(): Promise<number> {
    const [sec, micro] = await redis.time()
    return Number(sec) * 1000 + Math.floor(Number(micro) / 1000)
  }

  /** Reserva con la hora de emisión recién pedida a Redis, como hace `reserveOtpPhone`. */
  async function reservar(member: string, r = rule, key = KEY) {
    return store.reserve(key, member, r, await store.time())
  }

  /** Apunta un envío pasado con ZADD directo, `agoMs` antes del TIME de Redis. */
  async function seed(member: string, agoMs: number) {
    await redis.zadd(KEY, (await redisNow()) - agoMs, member)
  }

  beforeAll(() => {
    redis = new Redis(REDIS_URL as string)
    store = redisPhoneLog({
      eval: (script, keys, args) => redis.eval(script, keys.length, ...keys, ...args),
    })
  })
  beforeEach(async () => {
    await redis.del(KEY, ...[...ALL].map(tombstoneKey))
  })
  afterAll(async () => {
    await redis.del(KEY, ...[...ALL].map(tombstoneKey))
    redis.disconnect()
  })

  it('límite exacto: 5 pasan, la 6ª no y dice cuánto falta', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await reservar(mb(`m${i}`))).allowed).toBe(true)
    }
    const r = await reservar(mb('m5'))
    expect(r.allowed).toBe(false)
    if (!r.allowed) {
      // El más viejo se pidió hace instantes: faltan ~24 h.
      expect(r.retryAfterMs).toBeGreaterThan(24 * H - 5_000)
      expect(r.retryAfterMs).toBeLessThanOrEqual(24 * H)
    }
    expect(await redis.zcard(KEY)).toBe(5)
  })

  it('ventana móvil: un evento de hace 23 h 59 min cuenta', async () => {
    await seed('viejo', 24 * H - MIN)
    for (let i = 0; i < 4; i++) await seed(`r${i}`, (i + 2) * H)
    const r = await reservar('nuevo')
    expect(r.allowed).toBe(false)
    if (!r.allowed) {
      // Sale en ~1 min.
      expect(r.retryAfterMs).toBeGreaterThan(MIN - 5_000)
      expect(r.retryAfterMs).toBeLessThanOrEqual(MIN)
    }
  })

  it('ventana móvil: un evento de hace 24 h 1 min ya no cuenta (y se purga)', async () => {
    await seed('caducado', 24 * H + MIN)
    for (let i = 0; i < 4; i++) await seed(`r${i}`, (i + 2) * H)
    expect((await reservar('nuevo')).allowed).toBe(true)
    expect(await redis.zscore(KEY, 'caducado')).toBeNull()
    expect(await redis.zcard(KEY)).toBe(5)
  })

  it('release devuelve la plaza (ZREM del member)', async () => {
    for (let i = 0; i < 5; i++) await reservar(mb(`m${i}`))
    expect((await reservar(mb('x'))).allowed).toBe(false)
    await store.release(KEY, mb('m2'))
    expect((await reservar(mb('x'))).allowed).toBe(true)
  })

  it('lápida: release ANTES de reserve con el mismo member, la reserva no inserta y la lápida tiene TTL', async () => {
    await store.release(KEY, mb('tarde'))
    const r = await reservar(mb('tarde'))
    expect(r.allowed).toBe(true)
    expect(await redis.zcard(KEY)).toBe(0)
    const ttl = await redis.pttl(tombstoneKey(mb('tarde')))
    expect(ttl).toBeGreaterThan(TOMBSTONE_TTL_MS - 5_000)
    expect(ttl).toBeLessThanOrEqual(TOMBSTONE_TTL_MS)
    // Otro member sí ocupa plaza.
    await reservar(mb('otro'))
    expect(await redis.zcard(KEY)).toBe(1)
  })

  it('lápida: release DESPUÉS de reserve quita la plaza', async () => {
    expect((await reservar(mb('antes'))).allowed).toBe(true)
    expect(await redis.zcard(KEY)).toBe(1)
    await store.release(KEY, mb('antes'))
    expect(await redis.zcard(KEY)).toBe(0)
  })

  describe('antigüedad máxima de la reserva (lápida caducada)', () => {
    const evalRaw = (member: string, ...t0: number[]) =>
      redis.eval(
        RESERVE_SCRIPT,
        2,
        KEY,
        tombstoneKey(member),
        rule.windowSec * 1000,
        rule.limit,
        member,
        ...t0,
      ) as Promise<[number, number, string]>

    it('t0 de TIME y reserva inmediata: ok e inserta', async () => {
      const out = await evalRaw(mb('fresca'), await redisNow())
      expect(out).toEqual([1, 0, 'ok'])
      expect(await redis.zcard(KEY)).toBe(1)
    })
    it('t0 de hace 6 min: no inserta y el script lo distingue', async () => {
      const out = await evalRaw(mb('vieja'), (await redisNow()) - 6 * MIN)
      expect(out).toEqual([1, 0, 'stale'])
      expect(await redis.zcard(KEY)).toBe(0)
    })
    it('t0 en el límite (hace 5 min menos 10 s): inserta', async () => {
      const out = await evalRaw(mb('fresca'), (await redisNow()) - (MAX_RESERVE_AGE_MS - 10_000))
      expect(out[2]).toBe('ok')
    })
    it('t0 en el futuro (el reloj de Redis retrocedió): inserta', async () => {
      expect((await evalRaw(mb('futura'), (await redisNow()) + 10 * MIN))[2]).toBe('ok')
      expect(await redis.zcard(KEY)).toBe(1)
    })
    it('sin t0 (ARGV[4] ausente): falla seguro, es stale y no inserta', async () => {
      expect(await evalRaw(mb('vieja'))).toEqual([1, 0, 'stale'])
      expect(await evalRaw(mb('vieja'), Number.NaN)).toEqual([1, 0, 'stale'])
      expect(await redis.zcard(KEY)).toBe(0)
    })
    it('por el store: t0 de hace 6 min no inserta y se propaga skipped; el de ahora sí', async () => {
      const vieja = await store.reserve(KEY, mb('vieja'), rule, (await store.time()) - 6 * MIN)
      expect(vieja).toEqual({ allowed: true, skipped: 'stale' })
      expect(await redis.zcard(KEY)).toBe(0)
      expect(await reservar(mb('fresca'))).toEqual({ allowed: true })
      expect(await redis.zcard(KEY)).toBe(1)
    })
    it('release, la lápida caduca (PEXPIRE 1 ms) y llega la reserva con t0 viejo: no inserta', async () => {
      const t0 = (await store.time()) - (MAX_RESERVE_AGE_MS + MIN)
      await store.release(KEY, mb('tarde'))
      await redis.pexpire(tombstoneKey(mb('tarde')), 1)
      await new Promise((r) => setTimeout(r, 20))
      expect(await redis.exists(tombstoneKey(mb('tarde')))).toBe(0)
      const res = await store.reserve(KEY, mb('tarde'), rule, t0)
      expect(res).toEqual({ allowed: true, skipped: 'stale' })
      expect(await redis.zcard(KEY)).toBe(0)
    })
  })

  describe('secuencia completa redisPhoneLog → reserveOtpPhone', () => {
    const PHONE = `+519${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    const SECRET = `secreto-${RUN}`
    const PKEY = phoneLimitKey(PHONE, SECRET)
    const deps = () => ({ store, rule, secret: SECRET })
    beforeEach(async () => {
      await redis.del(PKEY)
    })
    afterAll(async () => {
      await redis.del(PKEY)
    })

    it('5 envíos ocupan plaza real, el 6º da 429 y release devuelve una', async () => {
      const gates = []
      for (let i = 0; i < 5; i++) {
        const g = await reserveOtpPhone(PHONE, deps())
        expect(g.allowed).toBe(true)
        gates.push(g)
      }
      expect(await redis.zcard(PKEY)).toBe(5)
      const sexto = await reserveOtpPhone(PHONE, deps())
      expect(sexto.allowed).toBe(false)
      if (!sexto.allowed) expect(sexto.retryAfterSec).toBeGreaterThan(24 * 60 * 60 - 10)
      const g0 = gates[0]
      if (g0?.allowed) await g0.release()
      expect(await redis.zcard(PKEY)).toBe(4)
      expect((await reserveOtpPhone(PHONE, deps())).allowed).toBe(true)
      expect(await redis.zcard(PKEY)).toBe(5)
    })
  })

  it('PEXPIRE: la clave caduca con la ventana y se renueva en cada plaza concedida', async () => {
    await reservar('a')
    const ttl = await redis.pttl(KEY)
    expect(ttl).toBeGreaterThan(24 * H - 5_000)
    expect(ttl).toBeLessThanOrEqual(24 * H)
    // Una ventana corta: el TTL sigue a la ventana y la clave desaparece sola.
    await redis.del(KEY)
    await reservar('b', { limit: 5, windowSec: 1 })
    expect(await redis.pttl(KEY)).toBeLessThanOrEqual(1_000)
    await new Promise((r) => setTimeout(r, 1_300))
    expect(await redis.exists(KEY)).toBe(0)
  })

  it('el reloj es el de Redis (TIME), no el de quien llama', async () => {
    await reservar('a')
    const score = Number(await redis.zscore(KEY, 'a'))
    expect(Math.abs(score - (await redisNow()))).toBeLessThan(2_000)
    expect(RESERVE_SCRIPT).toContain("redis.call('TIME')")
  })
})
