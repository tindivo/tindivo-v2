/**
 * Tope de envíos de OTP por NÚMERO de destino (SEC-03) en `send-code`.
 *
 * Lo real: la ruta, `requireRole` contra el GoTrue local, el tope por usuario
 * en `customer_otp_attempts`, los umbrales de `app_settings`, el borrado de
 * cuenta (`DELETE /customer/account`) y TODO el cableado de `phone-limit.ts`
 * (variables, import de `@upstash/redis`, EVAL, ZREM, timeout).
 *
 * Lo sustituido: Twilio (`create`) y el cliente `@upstash/redis`, cuyo EVAL lo
 * atiende `memoryPhoneLog` (misma lógica que el script Lua). El script en sí se
 * probó aparte contra un Redis 7 real (evidencia en el PR).
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { localClient } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.falso.local'
process.env.UPSTASH_REDIS_REST_TOKEN = 'token-falso'
process.env.OTP_PHONE_HMAC_SECRET = 'secreto-de-la-prueba'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../twilio/client', () => ({
  DEV_OTP_CODE: '000000',
  OTP_DEV_SIMULATION: false,
  VERIFY_SERVICE_SID: 'VA00000000000000000000000000000000',
  twilioClient: { verify: { v2: { services: () => ({ verifications: { create } }) } } },
}))

type Modo = 'ok' | 'init-fail' | 'timeout' | 'down'
const fake = vi.hoisted(() => ({
  modo: 'ok' as string,
  keys: [] as string[],
  log: null as unknown,
}))
vi.mock('@upstash/redis', async () => {
  const { memoryPhoneLog } = await import('../otp/phone-limit')
  const log = memoryPhoneLog()
  fake.log = log
  class Redis {
    constructor() {
      if (fake.modo === 'init-fail') throw new Error('Upstash no arranca')
    }
    async eval(_s: string, keys: string[], args: (string | number)[]) {
      if (fake.modo === 'timeout') return new Promise(() => {})
      if (fake.modo === 'down') throw new Error('redis caído')
      fake.keys.push(keys[0] as string)
      const [now, win, limit, member] = args
      const r = await log.reserve(
        keys[0] as string,
        String(member),
        { limit: Number(limit), windowSec: Number(win) / 1000 },
        Number(now),
      )
      return r.allowed ? [1, 0] : [0, r.retryAfterMs]
    }
    async zrem(key: string, member: string) {
      await log.release(key, member)
      return 1
    }
  }
  return { Redis }
})

import { DELETE as deleteAccount } from '../../app/api/v1/customer/account/route'
import { POST as sendCode } from '../../app/api/v1/customer/phone/send-code/route'
import { resetPhoneLogStore } from '../otp/phone-limit'

const BASE = 'http://localhost:3001/api/v1'
const NOMBRE = 'Vecino OTP'
const RAIZ = `9${String(Date.now()).slice(-7)}`
/** Un número propio de esta corrida por caso: 9 dígitos que empiezan por 9. */
const tel = (i: number) => `${RAIZ}${i}`
const LIMITE = 2

interface Vecino {
  userId: string
  token: string
}
const vecinos: Vecino[] = []
let previo: unknown = null

function modo(m: Modo) {
  fake.modo = m
  resetPhoneLogStore()
}

async function crearVecino(): Promise<Vecino> {
  const email = `otp-phone-${vecinos.length}-${Date.now()}@integration.local`
  const password = 'test-password-12345'
  const { data, error } = await localClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: NOMBRE },
  })
  if (error) throw new Error(`crear el usuario falló: ${error.message}`)
  const userId = data.user.id
  const { error: perfErr } = await localClient
    .from('customer_profiles')
    .insert({ user_id: userId, full_name: NOMBRE })
  if (perfErr) throw new Error(`crear el perfil falló: ${perfErr.message}`)
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: loginErr } = await anon.auth.signInWithPassword({ email, password })
  if (loginErr || !s.session) throw new Error(`entrar falló: ${loginErr?.message}`)
  const v = { userId, token: s.session.access_token }
  vecinos.push(v)
  return v
}

function pedir(v: Vecino, phone: string): Promise<Response> {
  return sendCode(
    new Request(`${BASE}/customer/phone/send-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${v.token}` },
      body: JSON.stringify({ phone }),
    }),
  )
}

describe('send-code · tope por número de destino', () => {
  beforeAll(async () => {
    const { data } = await localClient
      .from('app_settings')
      .select('value')
      .eq('key', 'rate_limits')
      .maybeSingle()
    previo = data?.value ?? null
    // Umbral desde app_settings, no del código.
    const { error } = await localClient.from('app_settings').upsert({
      key: 'rate_limits',
      value: {
        ...((previo as object | null) ?? {}),
        otp_phone: { limit: LIMITE, windowSec: 86400 },
      },
    })
    if (error) throw new Error(`sembrar rate_limits falló: ${error.message}`)
  })

  beforeEach(() => {
    create.mockReset()
    create.mockResolvedValue({ channel: 'sms' })
    modo('ok')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterAll(async () => {
    if (previo === null) await localClient.from('app_settings').delete().eq('key', 'rate_limits')
    else await localClient.from('app_settings').upsert({ key: 'rate_limits', value: previo })
    for (const v of vecinos) {
      await localClient.from('customer_otp_attempts').delete().eq('user_id', v.userId)
      await localClient.from('customer_profiles').delete().eq('user_id', v.userId)
      await localClient.from('users').delete().eq('id', v.userId)
      await localClient.auth.admin.deleteUser(v.userId).catch(() => {})
    }
  })

  it('el mismo número escrito de tres formas cuenta como uno, aunque lo pidan usuarios distintos', async () => {
    const t = tel(1)
    const [a, b, c] = [await crearVecino(), await crearVecino(), await crearVecino()]
    expect((await pedir(a, t)).status).toBe(200)
    expect((await pedir(b, `+51 ${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}`)).status).toBe(200)
    const res = await pedir(c, `51${t}`)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    // Twilio solo recibió los dos aceptados, y siempre en el mismo E.164.
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls.map((call) => call[0].to)).toEqual([`+51${t}`, `+51${t}`])
    // La clave del contador no lleva el teléfono en claro.
    expect(fake.keys.length).toBeGreaterThan(0)
    for (const k of fake.keys) expect(k).not.toContain(t)
  })

  it('un envío que Twilio rechaza no gasta el cupo del número', async () => {
    const t = tel(2)
    const v = await crearVecino()
    create.mockRejectedValueOnce(Object.assign(new Error('rechazado'), { code: 60200 }))
    expect((await pedir(v, t)).status).toBe(500)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(200)
    // Dos aceptados = cupo lleno; el tope personal (3) aún no llegó.
    const res = await pedir(v, t)
    expect(res.status).toBe(429)
    expect(((await res.json()) as { detail: string }).detail).toContain('este número')
  })

  it('borrar la cuenta y crear otra no reinicia el contador del número', async () => {
    const t = tel(3)
    const v = await crearVecino()
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(200)
    const borrado = await deleteAccount(
      new Request(`${BASE}/customer/account`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${v.token}` },
      }),
    )
    expect(borrado.status).toBe(204)
    const nueva = await crearVecino()
    expect((await pedir(nueva, t)).status).toBe(429)
  })

  it('con Redis caído el límite por número falla abierto, pero el tope personal de 3 sigue', async () => {
    const t = tel(4)
    const v = await crearVecino()
    modo('down')
    for (let i = 0; i < 3; i++) expect((await pedir(v, t)).status).toBe(200)
    const res = await pedir(v, t)
    expect(res.status).toBe(429)
    expect(((await res.json()) as { detail: string }).detail).toContain('Máximo 3 intentos')
  })

  it('si Upstash no contesta, la ruta no se cuelga: pasa al vencer el timeout', async () => {
    const v = await crearVecino()
    modo('timeout')
    const t0 = Date.now()
    expect((await pedir(v, tel(5))).status).toBe(200)
    expect(Date.now() - t0).toBeLessThan(5_000)
  })

  it('si Upstash no arranca, la ruta falla abierto', async () => {
    const v = await crearVecino()
    modo('init-fail')
    expect((await pedir(v, tel(6))).status).toBe(200)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('sin OTP_PHONE_HMAC_SECRET el límite por número se apaga (no usa otro secreto)', async () => {
    const t = tel(1) // agotado en el primer caso
    const v = await crearVecino()
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', '')
    try {
      expect((await pedir(v, t)).status).toBe(200)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
