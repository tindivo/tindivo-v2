/**
 * Tope de envíos de OTP por NÚMERO de destino (SEC-03) en `send-code`.
 *
 * Lo real: la ruta, `requireRole` contra el GoTrue local, el tope por usuario
 * en `customer_otp_attempts`, los umbrales de `app_settings`, el borrado de
 * cuenta (`DELETE /customer/account`) y TODO el cableado de `phone-limit.ts`
 * (variables, import de `@upstash/redis`, EVAL, lápida + ZREM, timeout).
 *
 * Lo sustituido: Twilio (`create`) y el cliente `@upstash/redis`, cuyo EVAL lo
 * atiende `memoryPhoneLog` (misma lógica que el script Lua). El script en sí lo
 * prueba `otp-phone-limit.redis.test.ts` contra un Redis 7 real.
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

// `after()` solo existe dentro de una petición de Next: aquí guarda las tareas
// y `pedir` las espera antes de devolver, como haría el runtime tras responder.
const tareas = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => {
    tareas.push(Promise.resolve().then(fn))
  },
}))

type Modo = 'ok' | 'init-fail' | 'timeout' | 'down'
const fake = vi.hoisted(() => ({
  modo: 'ok' as string,
  keys: [] as string[],
  log: null as unknown,
}))
vi.mock('@upstash/redis', async () => {
  const { memoryPhoneLog, RELEASE_SCRIPT, TIME_SCRIPT } = await import('../otp/phone-limit')
  const log = memoryPhoneLog()
  fake.log = log
  class Redis {
    constructor() {
      if (fake.modo === 'init-fail') throw new Error('Upstash no arranca')
    }
    async eval(_s: string, keys: string[], args: (string | number)[]) {
      if (fake.modo === 'timeout') return new Promise(() => {})
      if (fake.modo === 'down') throw new Error('redis caído')
      if (_s === TIME_SCRIPT) return Date.now()
      if (_s === RELEASE_SCRIPT) {
        await log.release(keys[0] as string, String(args[1]))
        return 1
      }
      fake.keys.push(keys[0] as string)
      const [win, limit, member, t0] = args
      const r = await log.reserve(
        keys[0] as string,
        String(member),
        { limit: Number(limit), windowSec: Number(win) / 1000 },
        Number(t0),
      )
      return r.allowed ? [1, 0] : [0, r.retryAfterMs]
    }
  }
  return { Redis }
})

import { DELETE as deleteAccount } from '../../app/api/v1/customer/account/route'
import { POST as sendCode } from '../../app/api/v1/customer/phone/send-code/route'
import { resetPhoneLogStore } from '../otp/phone-limit'

const BASE = 'http://localhost:3001/api/v1'
const NOMBRE = 'Vecino OTP'
const RAIZ = `9${String(Date.now()).slice(-6)}`
/** Un número propio de esta corrida por caso: 9 dígitos que empiezan por 9. */
const tel = (i: number) => `${RAIZ}${String(i).padStart(2, '0')}`
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

async function pedir(v: Vecino, phone: string): Promise<Response> {
  const res = await sendCode(
    new Request(`${BASE}/customer/phone/send-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${v.token}` },
      body: JSON.stringify({ phone }),
    }),
  )
  await Promise.all(tareas.splice(0))
  return res
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
      await localClient
        .from('phone_transfer_challenges')
        .delete()
        .eq('user_id', v.userId)
        .throwOnError()
      await localClient.from('phone_assignments').delete().eq('user_id', v.userId).throwOnError()
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
    create.mockRejectedValueOnce(
      Object.assign(new Error('rechazado'), { code: 60200, status: 400 }),
    )
    expect((await pedir(v, t)).status).toBe(500)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(200)
    // Dos aceptados = cupo lleno; el tope personal (3) aún no llegó.
    const res = await pedir(v, t)
    expect(res.status).toBe(429)
    expect(((await res.json()) as { detail: string }).detail).toContain('este número')
  })

  /** Cuántos intentos personales hay apuntados para este usuario. */
  async function intentos(v: Vecino): Promise<number> {
    const { count } = await localClient
      .from('customer_otp_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', v.userId)
    return count ?? 0
  }

  it('rechazo inequívoco (4xx de Twilio): libera la plaza y no cuenta el intento personal', async () => {
    const t = tel(7)
    const v = await crearVecino()
    create.mockRejectedValueOnce(
      Object.assign(new Error('número inválido'), { code: 21211, status: 400 }),
    )
    expect((await pedir(v, t)).status).toBe(500)
    expect(await intentos(v)).toBe(0)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(429) // cupo del número (2) lleno con los 2 aceptados
  })

  it('Twilio 429 con código (20429, no procesado): libera la plaza y no cuenta el intento personal', async () => {
    const t = tel(0)
    const v = await crearVecino()
    create.mockRejectedValueOnce(
      Object.assign(new Error('Too many requests'), { code: 20429, status: 429 }),
    )
    expect((await pedir(v, t)).status).toBe(500)
    expect(await intentos(v)).toBe(0)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(429) // los 2 aceptados llenan el cupo (2): la plaza del 429 se liberó
  })

  it('4xx sin código de Twilio: resultado incierto, conserva la plaza y cuenta el intento', async () => {
    const t = tel(10)
    const v = await crearVecino()
    create.mockRejectedValueOnce(Object.assign(new Error('proxy dijo no'), { status: 403 }))
    expect((await pedir(v, t)).status).toBe(500)
    expect(await intentos(v)).toBe(1)
    expect((await pedir(v, t)).status).toBe(200) // segunda plaza
    expect((await pedir(v, t)).status).toBe(429) // la incierta sigue ocupando una
  })

  it('timeout tras aceptación (sin status): conserva la plaza y cuenta en AMBOS topes', async () => {
    const t = tel(8)
    const v = await crearVecino()
    create.mockRejectedValueOnce(
      Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' }),
    )
    expect((await pedir(v, t)).status).toBe(500)
    expect(await intentos(v)).toBe(1)
    expect((await pedir(v, t)).status).toBe(200) // segunda plaza
    const res = await pedir(v, t) // tercera: el cupo del número (2) ya incluye la incierta
    expect(res.status).toBe(429)
    expect(((await res.json()) as { detail: string }).detail).toContain('este número')
    expect(await intentos(v)).toBe(2)
  })

  it('5xx de Twilio: conserva la plaza y cuenta el intento personal', async () => {
    const t = tel(9)
    const v = await crearVecino()
    create.mockRejectedValueOnce(
      Object.assign(new Error('servicio no disponible'), { code: 20500, status: 503 }),
    )
    expect((await pedir(v, t)).status).toBe(500)
    expect(await intentos(v)).toBe(1)
    expect((await pedir(v, t)).status).toBe(200)
    expect((await pedir(v, t)).status).toBe(429)
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

  it('sin OTP_PHONE_HMAC_SECRET y con Twilio configurado, send-code responde 503 y no envía (decisión 2026-10-13)', async () => {
    const t = tel(1)
    const v = await crearVecino()
    vi.stubEnv('OTP_PHONE_HMAC_SECRET', '')
    // `twilioClient` está simulado como no nulo: aquí el proceso «puede mandar SMS reales».
    // El criterio real de `canSendRealSms` lo cubre sms-guard.test.ts; la ruta se guía por `twilioClient`.
    try {
      const res = await pedir(v, t)
      expect(res.status).toBe(503)
      expect(create).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each([
    '',
    '   ',
  ])('UPSTASH_REDIS_REST_URL=%j: lo vacío cuenta como ausente y llega al 503, no a un error de validación', async (blank) => {
    const v = await crearVecino()
    // Entorno y módulos nuevos: `serverEnv()` se valida una sola vez por proceso,
    // y aquí NO se sustituye ni él ni `requireRole` (GoTrue local real).
    vi.stubEnv('UPSTASH_REDIS_REST_URL', blank)
    vi.resetModules()
    try {
      const { POST } = await import('../../app/api/v1/customer/phone/send-code/route')
      const res = await POST(
        new Request(`${BASE}/customer/phone/send-code`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${v.token}` },
          body: JSON.stringify({ phone: tel(7) }),
        }),
      )
      await Promise.all(tareas.splice(0))
      expect(res.status).toBe(503)
      expect(create).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
