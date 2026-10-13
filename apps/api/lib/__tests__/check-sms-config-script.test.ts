import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../scripts/check-sms-config.mjs', import.meta.url))

const TWILIO = {
  TWILIO_ACCOUNT_SID: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  TWILIO_AUTH_TOKEN: 'valor-secreto-del-token',
  TWILIO_VERIFY_SERVICE_SID: 'VAbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
}
const LIMIT = {
  OTP_PHONE_HMAC_SECRET: 'valor-secreto-hmac',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'valor-secreto-upstash',
}

/** Entorno limpio: no hereda las variables reales de quien corre el test. */
function run(env: Record<string, string>) {
  const base: Record<string, string> = {}
  for (const k of ['PATH', 'Path', 'SystemRoot']) {
    const v = process.env[k]
    if (v) base[k] = v
  }
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...base, ...env }, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('puerta de build · check-sms-config', () => {
  it('sin Twilio (no puede mandar SMS reales) pasa, aunque falte todo lo demás', () => {
    expect(run({}).code).toBe(0)
  })

  it('con Twilio y las tres variables del límite, pasa', () => {
    expect(run({ ...TWILIO, ...LIMIT }).code).toBe(0)
  })

  it('con Twilio y sin las del límite, FALLA y nombra las que faltan', () => {
    const r = run(TWILIO)
    expect(r.code).toBe(1)
    expect(r.out).toContain('OTP_PHONE_HMAC_SECRET')
    expect(r.out).toContain('UPSTASH_REDIS_REST_URL')
    expect(r.out).toContain('UPSTASH_REDIS_REST_TOKEN')
  })

  it('con Twilio y solo una faltante, nombra solo esa', () => {
    const { OTP_PHONE_HMAC_SECRET: _omit, ...resto } = LIMIT
    const r = run({ ...TWILIO, ...resto })
    expect(r.code).toBe(1)
    expect(r.out).toContain('OTP_PHONE_HMAC_SECRET')
    expect(r.out).not.toContain('UPSTASH_REDIS_REST_URL')
  })

  it('NUNCA imprime valores de variables', () => {
    const r = run({ ...TWILIO, UPSTASH_REDIS_REST_TOKEN: 'valor-secreto-upstash' })
    expect(r.code).toBe(1)
    for (const v of [...Object.values(TWILIO), 'valor-secreto-upstash']) {
      expect(r.out).not.toContain(v)
    }
  })
})
