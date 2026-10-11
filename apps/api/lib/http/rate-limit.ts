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

export const BUCKETS = ['tracking', 'search', 'read', 'write', 'events', 'otp'] as const
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
  otp: { limit: 10, windowSec: 600 }, // coste de SMS
}

export function classifyRoute(method: string, pathname: string): Bucket | null {
  const m = method.toUpperCase()
  if (m === 'OPTIONS') return null
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

/** Ventana fija en memoria: para los tests y como referencia del contrato. */
export function memoryStore(now: () => number = Date.now): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>()
  return {
    async hit(key, rule) {
      const t = now()
      let w = windows.get(key)
      if (!w || w.resetAt <= t) {
        w = { count: 0, resetAt: t + rule.windowSec * 1000 }
        windows.set(key, w)
      }
      w.count += 1
      return { allowed: w.count <= rule.limit, resetInMs: Math.max(0, w.resetAt - t) }
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
let limitsCache: { at: number; value: Limits } | null = null

async function loadLimits(now = Date.now()): Promise<Limits> {
  if (limitsCache && now - limitsCache.at < TTL_MS) return limitsCache.value
  let overrides: LimitOverrides | null = null
  try {
    const { data } = await createServiceClient()
      .from('app_settings')
      .select('value')
      .eq('key', 'rate_limits')
      .maybeSingle()
    overrides = parseLimitOverrides(data?.value)
  } catch {
    overrides = null
  }
  const value = resolveLimits(overrides)
  limitsCache = { at: now, value }
  return value
}

let upstashStore: RateLimitStore | null | undefined

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
  const store = await getUpstashStore()
  if (!store) return null
  return checkRateLimit(req, { store, limits: await loadLimits() })
}
