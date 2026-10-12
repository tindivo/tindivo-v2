import { createHmac, randomUUID } from 'node:crypto'
import type { LimitRule } from '../http/rate-limit'

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

export function phoneLimitKey(e164: string, secret: string): string {
  return `tindivo:otp_phone:${createHmac('sha256', secret).update(`${HMAC_CONTEXT}${e164}`).digest('hex')}`
}

export type ReserveResult = { allowed: true } | { allowed: false; retryAfterMs: number }

/** Registro de envíos con ventana móvil. */
export interface PhoneLogStore {
  /**
   * Atómico: descarta los envíos con instante `<= now - ventana`; si quedan
   * menos de `limit`, apunta `member` en `now` y deja pasar; si no, dice
   * cuánto falta para que salga el más viejo.
   */
  reserve(key: string, member: string, rule: LimitRule, now: number): Promise<ReserveResult>
  release(key: string, member: string): Promise<void>
}

/**
 * Misma lógica que el script de Redis, en memoria: para los tests y como
 * referencia. Un envío en `ts` cuenta mientras `ts > now - ventana`.
 */
export function memoryPhoneLog(): PhoneLogStore {
  const sets = new Map<string, Map<string, number>>()
  return {
    async reserve(key, member, rule, now) {
      const win = rule.windowSec * 1000
      const set = sets.get(key) ?? new Map<string, number>()
      sets.set(key, set)
      for (const [m, ts] of set) if (ts <= now - win) set.delete(m)
      if (set.size < rule.limit) {
        set.set(member, now)
        return { allowed: true }
      }
      const oldest = Math.min(...set.values())
      return { allowed: false, retryAfterMs: oldest + win - now }
    },
    async release(key, member) {
      sets.get(key)?.delete(member)
    },
  }
}

/** KEYS[1] = clave · ARGV = now(ms), ventana(ms), límite, miembro. */
export const RESERVE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local win = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - win)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, ARGV[4])
  redis.call('PEXPIRE', key, win)
  return {1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
return {0, tonumber(oldest[2]) + win - now}
`

interface RedisLike {
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>
  zrem(key: string, member: string): Promise<unknown>
}

export function redisPhoneLog(redis: RedisLike): PhoneLogStore {
  return {
    async reserve(key, member, rule, now) {
      const out = (await redis.eval(
        RESERVE_SCRIPT,
        [key],
        [now, rule.windowSec * 1000, rule.limit, member],
      )) as [number, number]
      return Number(out[0]) === 1
        ? { allowed: true }
        : { allowed: false, retryAfterMs: Number(out[1]) }
    },
    async release(key, member) {
      await redis.zrem(key, member)
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

/** Aparta una plaza para este número; `release()` si el envío no salió. */
export async function reserveOtpPhone(e164: string, deps: PhoneLimitDeps): Promise<PhoneGate> {
  if (!deps.store || !deps.secret) return { allowed: true, release: NOOP }
  const store = deps.store
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS
  const key = phoneLimitKey(e164, deps.secret)
  const member = randomUUID()
  try {
    const res = await withTimeout(
      store.reserve(key, member, deps.rule, (deps.now ?? Date.now)()),
      timeoutMs,
    )
    if (!res.allowed) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(res.retryAfterMs / 1000)) }
    }
    return {
      allowed: true,
      release: async () => {
        try {
          await withTimeout(store.release(key, member), timeoutMs)
        } catch (err) {
          console.error('[otp-phone-limit] no se pudo devolver la plaza:', err)
        }
      },
    }
  } catch (err) {
    console.error('[otp-phone-limit] almacén no disponible, se deja pasar:', err)
    return { allowed: true, release: NOOP }
  }
}

// --- Cableado de producción ---------------------------------------------------

/** El secreto del HMAC, o `null` (y un aviso) si falta. Nunca otro secreto de respaldo. */
export function otpPhoneSecret(): string | null {
  const s = process.env.OTP_PHONE_HMAC_SECRET?.trim()
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
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
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
