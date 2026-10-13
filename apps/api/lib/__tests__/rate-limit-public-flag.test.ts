import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Un Upstash que SIEMPRE deniega: si el límite público está activo, responde 429.
vi.mock('@upstash/redis', () => ({ Redis: class {} }))
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static fixedWindow() {
      return {}
    }
    async limit() {
      return { success: false, reset: Date.now() + 30_000 }
    }
  },
}))

import { publicRateLimitEnabled, rateLimitRequest, resetUpstashStore } from '../http/rate-limit'

const search = () =>
  new Request('https://apiv2.tindivo.com/api/v1/public/search', {
    headers: { 'x-real-ip': '9.9.9.9' },
  })

describe('publicRateLimitEnabled · flag propio, apagado por defecto', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['1', false],
    ['TRUE', false],
    ['true', true],
    [' true ', true],
  ])('RATE_LIMIT_PUBLIC_ENABLED=%j -> %s', (v, esperado) => {
    expect(publicRateLimitEnabled({ RATE_LIMIT_PUBLIC_ENABLED: v })).toBe(esperado)
  })
})

describe('límite público por IP detrás del flag', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'tok')
    resetUpstashStore()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    resetUpstashStore()
  })

  it('con Upstash configurado y SIN el flag, no limita (configurar Upstash no lo activa)', async () => {
    await expect(rateLimitRequest(search())).resolves.toBeNull()
  })

  it('con Upstash y el flag en true, limita (429)', async () => {
    vi.stubEnv('RATE_LIMIT_PUBLIC_ENABLED', 'true')
    const r = await rateLimitRequest(search())
    expect(r?.status).toBe(429)
  })
})
