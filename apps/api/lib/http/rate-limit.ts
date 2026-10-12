import { z } from 'zod'
import { createServiceClient } from '../supabase/service'
import { corsHeaders } from './cors'
import { problem } from './problem'

/**
 * Límite de tasa de las rutas PÚBLICAS (SEC-03 / R-08). Se aplica una sola vez,
 * en `proxy.ts`, por IP y por cubo de ruta: así ninguna ruta nueva se queda sin
 * límite por olvido y las apps nativas, que llaman a la misma API, quedan igual
 * de cubiertas.
 *
 * - Almacén: Upstash Redis (DECISIONS: «Rate limit · Upstash Ratelimit»). Sin
 *   `UPSTASH_REDIS_REST_*` (dev, CI) o con Redis caído, FALLA ABIERTO: un
 *   límite de tasa no puede tumbar los pedidos.
 * - Umbrales: `app_settings.rate_limits` (override parcial por cubo); si falta,
 *   `DEFAULT_LIMITS`.
 * - Las rutas con sesión (negocio, motorizado, admin) no se limitan aquí.
 */

export const BUCKETS = [
  'tracking',
  'search',
  'read',
  'write',
  'events',
  'otp',
  'otp_phone',
] as const
export type Bucket = (typeof BUCKETS)[number]

export interface LimitRule {
  limit: number
  windowSec: number
}
export type Limits = Record<Bucket, LimitRule>

/** Por IP. Propuesta inicial conservadora; Jesús los ajusta en `app_settings`. */
export const DEFAULT_LIMITS: Limits = {
  tracking: { limit: 20, windowSec: 60 }, // adivinar short_id
  search: { limit: 30, windowSec: 60 },
  read: { limit: 120, windowSec: 60 },
  write: { limit: 10, windowSec: 600 }, // pilot-access
  events: { limit: 120, windowSec: 60 },
  otp: { limit: 10, windowSec: 600 }, // coste de SMS, por IP
  // Por NÚMERO de destino (hasheado), en ventana MÓVIL de 24 h y contando solo
  // envíos aceptados por Twilio: ver lib/otp/phone-limit.ts (no usa `hit`).
  // classifyRoute no devuelve este cubo. 5 en 24 h: decisión de Jesús, 2026-10-12.
  otp_phone: { limit: 5, windowSec: 24 * 60 * 60 },
}

export function classifyRoute(method: string, pathname: string): Bucket | null {
  let m = method.toUpperCase()
  if (m === 'OPTIONS') return null
  // Next ejecuta HEAD con el handler de GET: debe contar en el mismo cubo.
  if (m === 'HEAD') m = 'GET'
  const p = pathname.replace(/\/+$/, '')
  if (
    m === 'POST' &&
    (p === '/api/v1/customer/phone/send-code' || p === '/api/v1/customer/phone/verify')
  ) {
    return 'otp'
  }
  if (!p.startsWith('/api/v1/public/')) return null
  if (m === 'POST') {
    if (p === '/api/v1/public/store/events') return 'events'
    return 'write'
  }
  if (m !== 'GET') return null
  if (/^\/api\/v1\/public\/orders\/[^/]+$/.test(p)) return 'tracking'
  if (/^\/api\/v1\/public\/courier\/(?!directory$|status$)[^/]+$/.test(p)) return 'tracking'
  if (p === '/api/v1/public/search') return 'search'
  return 'read'
}

export function clientIp(headers: Headers): string {
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  const first = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first || 'unknown'
}

export interface HitResult {
  allowed: boolean
  /** Milisegundos hasta que se libera la ventana. */
  resetInMs: number
}
export interface RateLimitStore {
  hit(key: string, rule: LimitRule): Promise<HitResult>
}

/**
 * Ventana fija en memoria, con la MISMA semántica que `Ratelimit.fixedWindow`
 * de Upstash: la ventana es `floor(t / ventana)`, alineada a la época (para
 * 24 h, corta a medianoche UTC), no «desde el primer golpe». Así los tests ven
 * el corte que verá producción.
 */
export function memoryStore(now: () => number = Date.now): RateLimitStore {
  const windows = new Map<string, { bucket: number; count: number }>()
  return {
    async hit(key, rule) {
      const t = now()
      const ms = rule.windowSec * 1000
      const bucket = Math.floor(t / ms)
      const id = `${key}|${ms}`
      let w = windows.get(id)
      if (!w || w.bucket !== bucket) {
        w = { bucket, count: 0 }
        windows.set(id, w)
      }
      w.count += 1
      return { allowed: w.count <= rule.limit, resetInMs: Math.max(0, (bucket + 1) * ms - t) }
    },
  }
}

const RuleSchema = z.object({
  limit: z.number().int().positive(),
  windowSec: z.number().int().positive(),
})
const OverridesSchema = z.object({
  tracking: RuleSchema.optional(),
  search: RuleSchema.optional(),
  read: RuleSchema.optional(),
  write: RuleSchema.optional(),
  events: RuleSchema.optional(),
  otp: RuleSchema.optional(),
  otp_phone: RuleSchema.optional(),
})

export type LimitOverrides = z.infer<typeof OverridesSchema>

export function parseLimitOverrides(value: unknown): LimitOverrides | null {
  const parsed = OverridesSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function resolveLimits(overrides: LimitOverrides | null): Limits {
  const out = { ...DEFAULT_LIMITS }
  if (!overrides) return out
  for (const b of BUCKETS) {
    const o = overrides[b]
    if (o) out[b] = o
  }
  return out
}

export interface RateLimitDeps {
  store: RateLimitStore | null
  limits: Limits
}

/** `null` si la petición puede pasar; la respuesta 429 si se pasó del tope. */
export async function checkRateLimit(req: Request, deps: RateLimitDeps): Promise<Response | null> {
  const url = new URL(req.url)
  const bucket = classifyRoute(req.method, url.pathname)
  if (!bucket || !deps.store) return null
  const rule = deps.limits[bucket]
  try {
    const res = await deps.store.hit(`${bucket}:${clientIp(req.headers)}`, rule)
    if (res.allowed) return null
    const retryAfter = Math.max(1, Math.ceil(res.resetInMs / 1000))
    return problem('rate_limited', {
      title: 'Demasiadas solicitudes',
      detail: `Hiciste demasiadas solicitudes. Intenta de nuevo en ${retryAfter} s.`,
      headers: { ...corsHeaders(req), 'retry-after': String(retryAfter) },
    })
  } catch (err) {
    console.error('[rate-limit] almacén no disponible, se deja pasar:', err)
    return null
  }
}

// --- Cableado de producción (no se prueba en unitarios) ---------------------

const TTL_MS = 30_000
const LOAD_TIMEOUT_MS = 1_000

/**
 * Lector de umbrales con caché, timeout y single-flight: una sola lectura en
 * vuelo aunque lleguen muchas peticiones, y si falla o vence se conserva el
 * último valor bueno (o los defaults). Nunca deja colgado al proxy.
 */
export function createLimitsLoader(opts: {
  fetchOverrides: () => Promise<unknown>
  now?: () => number
  ttlMs?: number
  timeoutMs?: number
}): () => Promise<Limits> {
  const now = opts.now ?? Date.now
  const ttl = opts.ttlMs ?? TTL_MS
  const timeoutMs = opts.timeoutMs ?? LOAD_TIMEOUT_MS
  let cache: { at: number; value: Limits } | null = null
  let inflight: Promise<Limits> | null = null

  async function refresh(): Promise<Limits> {
    const previous = cache?.value ?? DEFAULT_LIMITS
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      })
      const raw = await Promise.race([opts.fetchOverrides(), timeout])
      const parsed = parseLimitOverrides(raw)
      return parsed || raw == null ? resolveLimits(parsed) : previous
    } catch {
      return previous
    } finally {
      clearTimeout(timer)
    }
  }

  return async () => {
    if (cache && now() - cache.at < ttl) return cache.value
    if (!inflight) {
      inflight = refresh()
        .then((value) => {
          cache = { at: now(), value }
          return value
        })
        .finally(() => {
          inflight = null
        })
    }
    return inflight
  }
}

export const loadLimits = createLimitsLoader({
  fetchOverrides: async () => {
    const { data, error } = await createServiceClient()
      .from('app_settings')
      .select('value')
      .eq('key', 'rate_limits')
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.value ?? null
  },
})

let upstashStore: RateLimitStore | null | undefined

/** Para los tests: olvida el almacén ya creado. */
export function resetUpstashStore(): void {
  upstashStore = undefined
}

async function getUpstashStore(): Promise<RateLimitStore | null> {
  if (upstashStore !== undefined) return upstashStore
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    upstashStore = null
    return null
  }
  const [{ Ratelimit }, { Redis }] = await Promise.all([
    import('@upstash/ratelimit'),
    import('@upstash/redis'),
  ])
  const redis = new Redis({ url, token })
  const cache = new Map<string, InstanceType<typeof Ratelimit>>()
  upstashStore = {
    async hit(key, rule) {
      const id = `${rule.limit}/${rule.windowSec}`
      let rl = cache.get(id)
      if (!rl) {
        rl = new Ratelimit({
          redis,
          limiter: Ratelimit.fixedWindow(rule.limit, `${rule.windowSec} s`),
          prefix: `tindivo:rl:${id}`,
          timeout: 1000, // si Redis no contesta, se deja pasar
        })
        cache.set(id, rl)
      }
      const r = await rl.limit(key)
      return { allowed: r.success, resetInMs: Math.max(0, r.reset - Date.now()) }
    },
  }
  return upstashStore
}

/** Punto de entrada de `proxy.ts`. */
export async function rateLimitRequest(req: Request): Promise<Response | null> {
  const bucket = classifyRoute(req.method, new URL(req.url).pathname)
  if (!bucket) return null
  try {
    const store = await getUpstashStore()
    if (!store) return null
    return await checkRateLimit(req, { store, limits: await loadLimits() })
  } catch (err) {
    console.error('[rate-limit] fallo al preparar el límite, se deja pasar:', err)
    return null
  }
}
