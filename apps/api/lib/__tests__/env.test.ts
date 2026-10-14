import { afterEach, describe, expect, it, vi } from 'vitest'

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
}

/** `serverEnv` real (sin sustituir) sobre un `process.env` controlado. */
async function cargar(extra: Record<string, string>) {
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const [k, v] of Object.entries({ ...BASE, ...extra })) vi.stubEnv(k, v)
  return (await import('../env')).serverEnv()
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('serverEnv · lo vacío o solo espacios cuenta como ausente', () => {
  it.each(['', '   ', '\n'])('UPSTASH_REDIS_REST_URL=%j no lanza y queda ausente', async (v) => {
    const env = await cargar({ UPSTASH_REDIS_REST_URL: v })
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined()
  })

  it.each(['', '   '])('UPSTASH_REDIS_REST_TOKEN=%j queda ausente', async (v) => {
    const env = await cargar({ UPSTASH_REDIS_REST_TOKEN: v })
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined()
  })

  it.each(['', '   '])('OTP_PHONE_HMAC_SECRET=%j queda ausente', async (v) => {
    const env = await cargar({ OTP_PHONE_HMAC_SECRET: v })
    expect(env.OTP_PHONE_HMAC_SECRET).toBeUndefined()
  })

  it('una URL válida con espacios alrededor se acepta recortada', async () => {
    const env = await cargar({ UPSTASH_REDIS_REST_URL: '  https://x.upstash.io \n' })
    expect(env.UPSTASH_REDIS_REST_URL).toBe('https://x.upstash.io')
  })

  it('una URL realmente mala sigue fallando', async () => {
    await expect(cargar({ UPSTASH_REDIS_REST_URL: 'no-es-url' })).rejects.toThrow()
  })
})
