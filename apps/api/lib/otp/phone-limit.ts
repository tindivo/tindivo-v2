import { createHmac, randomUUID } from 'node:crypto'
import type { LimitRule } from '../http/rate-limit'
import { envValue } from './sms-guard.mjs'

/**
 * Límite de envíos de OTP por NÚMERO DE DESTINO (SEC-03). El tope por usuario
 * (`customer_otp_attempts`, 3 en 24 h) no frena a quien crea cuentas gratis
 * para disparar SMS al mismo número ajeno: este cuenta por teléfono, sea quien
 * sea el usuario o la IP.
 *
 * VENTANA MÓVIL REAL DE 24 H, no fija. Con `fixedWindow` la ventana corta a
 * medianoche UTC (19:00 en Lima, cuando abre el servicio) y se podían mandar 5
 * antes y 5 después del corte. Aquí se guarda cada envío con su instante (un
 * sorted set en Redis) y se cuentan los de las últimas 24 h exactas.
 *
 * SOLO CUENTAN LOS ENVÍOS QUE TWILIO ACEPTA, sin carrera: `reserve` comprueba
 * el cupo y aparta la plaza en UN solo script atómico; si Twilio rechaza el
 * envío, `release` la devuelve. Dos peticiones simultáneas no pueden pasar las
 * dos con el último hueco. Lo que queda: mientras Twilio responde, una plaza
 * apartada cuenta aunque luego se devuelva (una petición concurrente puede
 * recibir un 429 que un segundo después no recibiría), y si el proceso muere
 * entre reservar y devolver, la plaza se pierde hasta que caduque. Ambos casos
 * yerran del lado de mandar MENOS SMS, que es el que importa.
 *
 * - Almacén: Upstash (el mismo del límite por IP). No `customer_otp_attempts`:
 *   esa tabla se vacía por `user_id` al borrar la cuenta (0259), y crear
 *   cuenta, pedir SMS, borrarla y repetir reiniciaría el contador.
 * - FALLA ABIERTO, y lo registra: sin Upstash, con Upstash que no arranca o no
 *   contesta en `TIMEOUT_MS`, o sin `OTP_PHONE_HMAC_SECRET`. El tope por usuario
 *   sigue vigente en todos esos casos.
 * - Umbral: `app_settings.rate_limits.otp_phone` (por defecto 5 en 24 h,
 *   decisión de Jesús del 2026-10-12).
 * - El teléfono no se guarda en claro: la clave es un HMAC-SHA256 con un
 *   secreto propio (un hash simple de 9 dígitos se revierte probando todos).
 */

export const HMAC_CONTEXT = 'tindivo:otp-phone:v1:'
export const TIMEOUT_MS = 1_000
/**
 * Vida de la lápida de un `release`: 1 h. Un EVAL de reserva en vuelo solo
 * puede llegar tarde por un reintento de red o una función serverless
 * congelada (segundos a unos minutos); 1 h lo cubre con margen y la clave
 * (un UUID, sin teléfono) no se acumula.
 */
export const TOMBSTONE_TTL_MS = 60 * 60 * 1000
/**
 * Antigüedad máxima admisible de una reserva: 5 min. Pasada la lápida (1 h) un
 * EVAL rezagado reinsertaría la plaza 24 h; si el script rechaza toda reserva
 * emitida hace más de esto, ya no puede.
 *
 * UN SOLO RELOJ: el de Redis. La hora de emisión (`t0`) se pide a Redis (`TIME`)
 * justo antes de reservar y el script la compara con su propio `TIME`; el reloj
 * de la app no interviene, así que el desfase app↔Redis no mueve nada. La
 * relación que debe cumplirse es MAX_RESERVE_AGE_MS + duración máxima de una
 * invocación < TOMBSTONE_TTL_MS: una reserva rezagada que llegue con la lápida
 * ya caducada tiene más de 1 h de edad, luego es 'stale'. 5 min está muy por
 * encima de una reserva normal (timeout de 1 s por intento) y deja ~55 min.
 */
export const MAX_RESERVE_AGE_MS = 5 * 60 * 1000

/** Lápida del `member`: el UUID es aleatorio y no contiene el teléfono. */
export function tombstoneKey(member: string): string {
  return `tindivo:otp_phone_rel:${member}`
}

export function phoneLimitKey(e164: string, secret: string): string {
  return `tindivo:otp_phone:${createHmac('sha256', secret).update(`${HMAC_CONTEXT}${e164}`).digest('hex')}`
}

/**
 * `skipped`: la reserva permitida NO ocupó plaza (lápida, o emitida hace más de
 * `MAX_RESERVE_AGE_MS`). Con un member nuevo y `t0` recién pedido a Redis ninguna
 * de las dos puede darse EN VIVO: `reserveOtpPhone` lo trata como anomalía.
 */
export type ReserveResult =
  | { allowed: true; skipped?: 'tombstone' | 'stale' }
  | { allowed: false; retryAfterMs: number }

/** Registro de envíos con ventana móvil. */
export interface PhoneLogStore {
  /**
   * Atómico: descarta los envíos con instante `<= now - ventana`; si quedan
   * menos de `limit`, apunta `member` en `now` y deja pasar; si no, dice
   * cuánto falta para que salga el más viejo. `t0` es la hora de emisión de la
   * reserva, en el reloj de ESTE almacén (la que dio `time()`): si al aplicarse
   * han pasado más de `MAX_RESERVE_AGE_MS`, no inserta (`skipped: 'stale'`). Un
   * `t0` en el futuro (solo si el reloj de Redis retrocede) no cuenta como viejo.
   * `now` solo lo usa la versión en memoria (tests); en Redis el instante lo da
   * el propio servidor (`TIME`).
   */
  reserve(
    key: string,
    member: string,
    rule: LimitRule,
    t0: number,
    now?: number,
  ): Promise<ReserveResult>
  /**
   * Hora del reloj del almacén, en ms (en Redis, `TIME`). Solo lectura: si llega
   * tarde es inocua. `now` solo lo usa la versión en memoria.
   */
  time(now?: number): Promise<number>
  /**
   * Atómico e independiente del orden: deja una lápida del `member` y lo quita
   * del conjunto. Si su `reserve` llega DESPUÉS, la lápida impide la inserción.
   */
  release(key: string, member: string, now?: number): Promise<void>
}

/**
 * Misma lógica que el script de Redis, en memoria: para los tests y como
 * referencia. Un envío en `ts` cuenta mientras `ts > now - ventana`. Imita
 * también el `PEXPIRE`: cada plaza concedida fija la caducidad del conjunto
 * entero en `now + ventana`.
 */
export function memoryPhoneLog(): PhoneLogStore {
  const sets = new Map<string, Map<string, number>>()
  const expiresAt = new Map<string, number>()
  const tombstones = new Map<string, number>() // member → caduca en
  return {
    async time(now = Date.now()) {
      return now
    },
    async reserve(key, member, rule, t0, now = t0) {
      // Un solo reloj (`now`) para la lápida, su caducidad y la antigüedad, como el Lua con TIME.
      if ((tombstones.get(member) ?? 0) > now) return { allowed: true, skipped: 'tombstone' }
      if (!Number.isFinite(t0) || now - t0 > MAX_RESERVE_AGE_MS) {
        return { allowed: true, skipped: 'stale' }
      }
      const win = rule.windowSec * 1000
      if ((expiresAt.get(key) ?? Number.POSITIVE_INFINITY) <= now) {
        sets.delete(key)
        expiresAt.delete(key)
      }
      const set = sets.get(key) ?? new Map<string, number>()
      sets.set(key, set)
      for (const [m, ts] of set) if (ts <= now - win) set.delete(m)
      if (set.size < rule.limit) {
        set.set(member, now)
        expiresAt.set(key, now + win)
        return { allowed: true }
      }
      const oldest = Math.min(...set.values())
      return { allowed: false, retryAfterMs: oldest + win - now }
    },
    async release(key, member, now = Date.now()) {
      tombstones.set(member, now + TOMBSTONE_TTL_MS)
      const set = sets.get(key)
      set?.delete(member)
      if (set?.size === 0) {
        sets.delete(key)
        expiresAt.delete(key)
      }
    },
  }
}

/**
 * KEYS[1] = clave, KEYS[2] = lápida del miembro · ARGV = ventana(ms), límite, miembro, t0.
 * Con lápida (el `release` llegó antes) no inserta ni cuenta: el SMS ya fue
 * rechazado y nadie lee esta respuesta (`'tombstone'`). Con una reserva emitida
 * hace más de MAX_RESERVE_AGE_MS tampoco (`'stale'`): la lápida ya pudo caducar.
 * `t0` es la hora de Redis (TIME_SCRIPT) al emitir la reserva: ambos extremos de
 * la resta son del mismo reloj. Si `t0` falta, es NaN/infinito o no es un número se trata como
 * 'stale' (falla seguro: nunca inserta a ciegas); el código propio siempre lo
 * manda, así que verlo EN VIVO es una anomalía que `reserveOtpPhone` registra.
 * Un `t0` en el futuro (solo si Redis retrocede el reloj) no cuenta como viejo.
 * El instante sale de `TIME` de Redis (no del servidor de la app): relojes de
 * varias instancias serverless desfasados no mueven la ventana.
 */
export const RESERVE_SCRIPT = `
local key = KEYS[1]
if redis.call('EXISTS', KEYS[2]) == 1 then
  return {1, 0, 'tombstone'}
end
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local issued = tonumber(ARGV[4])
if issued == nil or issued ~= issued or issued == math.huge or now - issued > ${MAX_RESERVE_AGE_MS} then
  return {1, 0, 'stale'}
end
local win = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - win)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, ARGV[3])
  redis.call('PEXPIRE', key, win)
  return {1, 0, 'ok'}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
return {0, tonumber(oldest[2]) + win - now}
`

/** Hora de Redis en ms (`TIME`). Solo lectura: si llega tarde es inocua, no escribe. */
export const TIME_SCRIPT = `
local t = redis.call('TIME')
return tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
`

/** KEYS[1] = clave, KEYS[2] = lápida · ARGV = TTL de la lápida (ms), miembro. Atómico. */
export const RELEASE_SCRIPT = `
redis.call('SET', KEYS[2], '1', 'PX', tonumber(ARGV[1]))
redis.call('ZREM', KEYS[1], ARGV[2])
return 1
`

interface RedisLike {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
}

export function redisPhoneLog(redis: RedisLike): PhoneLogStore {
  return {
    async time() {
      return Number(await redis.eval(TIME_SCRIPT, [], []))
    },
    async reserve(key, member, rule, t0) {
      const out = (await redis.eval(
        RESERVE_SCRIPT,
        [key, tombstoneKey(member)],
        [rule.windowSec * 1000, rule.limit, member, t0],
      )) as [number, number, string?]
      if (Number(out[0]) !== 1) return { allowed: false, retryAfterMs: Number(out[1]) }
      return out[2] === 'tombstone' || out[2] === 'stale'
        ? { allowed: true, skipped: out[2] }
        : { allowed: true }
    },
    async release(key, member) {
      await redis.eval(RELEASE_SCRIPT, [key, tombstoneKey(member)], [TOMBSTONE_TTL_MS, member])
    },
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sin respuesta en ${ms} ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

export interface PhoneLimitDeps {
  store: PhoneLogStore | null
  rule: LimitRule
  secret: string | null
  now?: () => number
  timeoutMs?: number
}

export type PhoneGate =
  | { allowed: true; release: () => Promise<void> }
  | { allowed: false; retryAfterSec: number }

const NOOP = async () => {}

/**
 * Aparta una plaza para este número; `release()` si Twilio rechazó el envío.
 *
 * `release` va SIEMPRE ligado al `member` de esta reserva, también si `reserve`
 * venció por timeout: el EVAL pudo aplicarse en Redis aunque la respuesta no
 * llegara, y entonces hay una plaza fantasma que solo ese `member` identifica.
 * Si `reserve` venció por timeout su EVAL sigue en vuelo y puede llegar a Redis
 * DESPUÉS del `release` (o la función morir antes). Por eso el `release` no
 * espera: deja una lápida del `member` y hace el ZREM en un solo script; si la
 * reserva llega después, la lápida impide la inserción, y si llegó antes, el
 * ZREM la quita. Llámalo fuera de la respuesta (`after()`).
 */
export async function reserveOtpPhone(e164: string, deps: PhoneLimitDeps): Promise<PhoneGate> {
  if (!deps.store || !deps.secret) return { allowed: true, release: NOOP }
  const store = deps.store
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS
  const key = phoneLimitKey(e164, deps.secret)
  let member = randomUUID()
  const release = async () => {
    try {
      await withTimeout(store.release(key, member), timeoutMs)
    } catch (err) {
      console.error('[otp-phone-limit] no se pudo devolver la plaza:', err)
    }
  }
  // Un intento = la hora de Redis (`TIME`) y la reserva con ella: un solo reloj.
  // `deps.now` solo se inyecta en tests (el almacén en memoria); Redis lo ignora.
  const attempt = async () => {
    const injected = deps.now?.()
    const t0 = await store.time(injected)
    return store.reserve(key, member, deps.rule, t0, injected)
  }
  try {
    let res = await withTimeout(attempt(), timeoutMs)
    if (res.allowed && res.skipped) {
      // Con `t0` recién pedido y un member nuevo, 'stale'/'tombstone' EN VIVO no
      // deberían darse: reloj de Redis retrocedido, un TIME que tardó más de
      // MAX_RESERVE_AGE_MS, o un almacén roto. Un reintento con member nuevo.
      console.error(
        `[otp-phone-limit] anomalía: reserva en vivo omitida (${res.skipped}); se reintenta una vez con otro member`,
      )
      member = randomUUID()
      res = await withTimeout(attempt(), timeoutMs)
      if (res.allowed && res.skipped) {
        console.error(
          `[otp-phone-limit] la reserva sigue omitida (${res.skipped}) tras el reintento: el límite por número no cuenta este envío, se deja pasar`,
        )
        return { allowed: true, release }
      }
    }
    if (!res.allowed) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(res.retryAfterMs / 1000)) }
    }
    return { allowed: true, release }
  } catch (err) {
    console.error('[otp-phone-limit] almacén no disponible, se deja pasar:', err)
    return { allowed: true, release }
  }
}

// --- Cableado de producción ---------------------------------------------------

/** El secreto del HMAC, o `null` (y un aviso) si falta. Nunca otro secreto de respaldo. */
export function otpPhoneSecret(): string | null {
  const s = envValue(process.env, 'OTP_PHONE_HMAC_SECRET')
  if (!s) {
    console.error('[otp-phone-limit] falta OTP_PHONE_HMAC_SECRET: límite por número APAGADO')
    return null
  }
  return s
}

let cached: PhoneLogStore | null | undefined

/** Para los tests: olvida el almacén ya creado. */
export function resetPhoneLogStore(): void {
  cached = undefined
}

/** El registro en Upstash, o `null` si no está configurado o no arranca. Nunca lanza. */
export async function getPhoneLogStore(): Promise<PhoneLogStore | null> {
  if (cached !== undefined) return cached
  const url = envValue(process.env, 'UPSTASH_REDIS_REST_URL')
  const token = envValue(process.env, 'UPSTASH_REDIS_REST_TOKEN')
  if (!url || !token) {
    cached = null
    return null
  }
  try {
    const { Redis } = await import('@upstash/redis')
    cached = redisPhoneLog(new Redis({ url, token }) as unknown as RedisLike)
  } catch (err) {
    console.error('[otp-phone-limit] Upstash no arrancó, se deja pasar:', err)
    cached = null
  }
  return cached
}
