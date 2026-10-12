import { afterEach, describe, expect, it, vi } from 'vitest'
import { corsHeaders } from '../http/cors'
import {
  checkRateLimit,
  classifyRoute,
  clientIp,
  createLimitsLoader,
  DEFAULT_LIMITS,
  memoryStore,
  parseLimitOverrides,
  rateLimitRequest,
  resetUpstashStore,
  resolveLimits,
} from '../http/rate-limit'

function req(path: string, method = 'GET', headers: Record<string, string> = {}) {
  return new Request(`https://apiv2.tindivo.com${path}`, { method, headers })
}

describe('classifyRoute · qué ruta cuenta y en qué cubo', () => {
  it.each([
    ['GET', '/api/v1/public/orders/ABCD2345', 'tracking'],
    ['GET', '/api/v1/public/courier/ABCD2345', 'tracking'],
    ['GET', '/api/v1/public/courier/directory', 'read'],
    ['GET', '/api/v1/public/courier/status', 'read'],
    ['GET', '/api/v1/public/search', 'search'],
    ['GET', '/api/v1/public/businesses', 'read'],
    ['GET', '/api/v1/public/businesses/abc', 'read'],
    ['GET', '/api/v1/public/store/mi-slug', 'read'],
    ['GET', '/api/v1/public/schedule', 'read'],
    ['POST', '/api/v1/public/pilot-access', 'write'],
    ['POST', '/api/v1/public/store/events', 'events'],
    ['POST', '/api/v1/customer/phone/send-code', 'otp'],
    ['POST', '/api/v1/customer/phone/verify', 'otp'],
  ])('%s %s -> %s', (method, path, bucket) => {
    expect(classifyRoute(method, path)).toBe(bucket)
  })

  it.each([
    ['GET', '/api/v1/health'],
    ['GET', '/api/v1/config'],
    ['GET', '/api/v1/openapi.json'],
    ['GET', '/api/v1/business/orders'],
    ['POST', '/api/v1/customer/orders'],
    ['OPTIONS', '/api/v1/public/search'],
    ['GET', '/api/inngest'],
  ])('%s %s no se limita aquí', (method, path) => {
    expect(classifyRoute(method, path)).toBeNull()
  })
})

describe('clientIp', () => {
  it('prefiere x-real-ip, luego el primero de x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe(
      '1.1.1.1',
    )
    expect(clientIp(new Headers({ 'x-forwarded-for': '2.2.2.2, 3.3.3.3' }))).toBe('2.2.2.2')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})

describe('checkRateLimit', () => {
  const limits = { ...DEFAULT_LIMITS, tracking: { limit: 3, windowSec: 60 } }
  const track = (ip: string) => req('/api/v1/public/orders/ABCD2345', 'GET', { 'x-real-ip': ip })

  it('deja pasar hasta el tope y luego responde 429 con Retry-After y el código del catálogo', async () => {
    const store = memoryStore(() => 1_000)
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimit(track('9.9.9.9'), { store, limits })).toBeNull()
    }
    const res = await checkRateLimit(track('9.9.9.9'), { store, limits })
    expect(res?.status).toBe(429)
    expect(Number(res?.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(res?.headers.get('content-type')).toContain('application/problem+json')
    expect(((await res?.json()) as { code: string }).code).toBe('rate_limited')
  })

  it('cuenta por IP y por cubo', async () => {
    const store = memoryStore(() => 1_000)
    for (let i = 0; i < 3; i++) await checkRateLimit(track('1.1.1.1'), { store, limits })
    expect((await checkRateLimit(track('1.1.1.1'), { store, limits }))?.status).toBe(429)
    expect(await checkRateLimit(track('2.2.2.2'), { store, limits })).toBeNull()
    const search = req('/api/v1/public/search', 'GET', { 'x-real-ip': '1.1.1.1' })
    expect(await checkRateLimit(search, { store, limits })).toBeNull()
  })

  it('la ventana se reinicia', async () => {
    let now = 1_000
    const store = memoryStore(() => now)
    for (let i = 0; i < 4; i++) await checkRateLimit(track('1.1.1.1'), { store, limits })
    now += 61_000
    expect(await checkRateLimit(track('1.1.1.1'), { store, limits })).toBeNull()
  })

  it('falla abierto: sin almacén o con el almacén caído no bloquea', async () => {
    expect(await checkRateLimit(track('1.1.1.1'), { store: null, limits })).toBeNull()
    const roto = {
      hit: async () => {
        throw new Error('redis caído')
      },
    }
    expect(await checkRateLimit(track('1.1.1.1'), { store: roto, limits })).toBeNull()
  })

  it('una ruta no limitada ni toca el almacén', async () => {
    const store = {
      hit: async () => {
        throw new Error('no debía llamarse')
      },
    }
    expect(await checkRateLimit(req('/api/v1/health'), { store, limits })).toBeNull()
  })
})

describe('memoryStore reproduce el fixedWindow de Upstash', () => {
  it('la ventana se alinea a la época, no al primer golpe: corta en el múltiplo', async () => {
    const rule = { limit: 2, windowSec: 60 }
    let now = 59_000 // a 1 s del corte de la ventana [0, 60 000)
    const store = memoryStore(() => now)
    expect((await store.hit('k', rule)).allowed).toBe(true)
    const r = await store.hit('k', rule)
    expect(r.allowed).toBe(true)
    expect(r.resetInMs).toBe(1_000)
    expect((await store.hit('k', rule)).allowed).toBe(false)
    now = 60_000 // nueva ventana, solo 1 s después
    expect((await store.hit('k', rule)).allowed).toBe(true)
  })
})

describe('límites desde app_settings', () => {
  it('sin clave o con basura se usan los valores por defecto', () => {
    expect(resolveLimits(null)).toEqual(DEFAULT_LIMITS)
    expect(parseLimitOverrides({ tracking: { limit: -1 } })).toBeNull()
    expect(parseLimitOverrides('x')).toBeNull()
  })
  it('un override válido pisa solo ese cubo', () => {
    const o = parseLimitOverrides({ tracking: { limit: 5, windowSec: 30 } })
    expect(resolveLimits(o).tracking).toEqual({ limit: 5, windowSec: 30 })
    expect(resolveLimits(o).search).toEqual(DEFAULT_LIMITS.search)
  })
})

describe('HEAD cuenta como GET', () => {
  it('HEAD cae en el mismo cubo que GET', () => {
    expect(classifyRoute('HEAD', '/api/v1/public/search')).toBe('search')
    expect(classifyRoute('HEAD', '/api/v1/public/orders/ABCD2345')).toBe('tracking')
  })

  it('HEAD y GET comparten contador', async () => {
    const limits = { ...DEFAULT_LIMITS, tracking: { limit: 2, windowSec: 60 } }
    const store = memoryStore(() => 1_000)
    const mk = (m: string) => req('/api/v1/public/orders/ABCD2345', m, { 'x-real-ip': '5.5.5.5' })
    await checkRateLimit(mk('GET'), { store, limits })
    await checkRateLimit(mk('HEAD'), { store, limits })
    expect((await checkRateLimit(mk('HEAD'), { store, limits }))?.status).toBe(429)
    expect((await checkRateLimit(mk('GET'), { store, limits }))?.status).toBe(429)
  })
})

describe('createLimitsLoader', () => {
  const custom = { tracking: { limit: 5, windowSec: 30 } }

  it('un timeout real no cuelga y cae a los defaults', async () => {
    const load = createLimitsLoader({
      fetchOverrides: () => new Promise(() => {}),
      timeoutMs: 20,
    })
    const t0 = Date.now()
    expect(await load()).toEqual(DEFAULT_LIMITS)
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('10 solicitudes concurrentes hacen una sola lectura', async () => {
    const fetchOverrides = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return custom
    })
    const load = createLimitsLoader({ fetchOverrides })
    const out = await Promise.all(Array.from({ length: 10 }, () => load()))
    expect(fetchOverrides).toHaveBeenCalledTimes(1)
    expect(out.every((l) => l.tracking.limit === 5)).toBe(true)
  })

  it('si la relectura falla o vence, conserva el último valor bueno', async () => {
    let now = 0
    let fail = false
    const load = createLimitsLoader({
      fetchOverrides: async () => {
        if (fail) throw new Error('supabase caído')
        return custom
      },
      now: () => now,
      ttlMs: 100,
    })
    expect((await load()).tracking.limit).toBe(5)
    fail = true
    now = 1_000
    expect((await load()).tracking.limit).toBe(5)
  })
})

describe('Upstash mal configurado', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    resetUpstashStore()
  })

  it('con URL inválida falla abierto en vez de romper el proxy', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'esto no es una url')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'x')
    resetUpstashStore()
    const r = req('/api/v1/public/search', 'GET', { 'x-real-ip': '7.7.7.7' })
    await expect(rateLimitRequest(r)).resolves.toBeNull()
  })
})

describe('CORS expone Retry-After', () => {
  it('Access-Control-Expose-Headers incluye retry-after', () => {
    const h = corsHeaders(
      req('/api/v1/public/search', 'GET', { origin: 'https://www.tindivo.com' }),
    )
    expect(h['access-control-expose-headers']).toContain('retry-after')
  })
})
