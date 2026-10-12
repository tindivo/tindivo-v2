/**
 * Tope de envíos de OTP por NÚMERO de destino (SEC-03) en `send-code`.
 *
 * Twilio y Upstash se sustituyen (no hay ni uno ni otro en local); lo real es la
 * ruta, `requireRole` contra el GoTrue local y los umbrales de `app_settings`.
 * Dos usuarios distintos piden código al MISMO número: el segundo, aunque no haya
 * gastado su cupo personal, topa con el límite del número.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { localClient } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('../twilio/client', () => ({
  DEV_OTP_CODE: '000000',
  OTP_DEV_SIMULATION: false,
  VERIFY_SERVICE_SID: 'VA00000000000000000000000000000000',
  twilioClient: { verify: { v2: { services: () => ({ verifications: { create } }) } } },
}))

const hits = vi.hoisted(() => ({ keys: [] as string[] }))
vi.mock('../http/rate-limit', async (importOriginal) => {
  const real = await importOriginal<typeof import('../http/rate-limit')>()
  const mem = real.memoryStore()
  return {
    ...real,
    getUpstashStore: async () => ({
      hit: (key: string, rule: import('../http/rate-limit').LimitRule) => {
        hits.keys.push(key)
        return mem.hit(key, rule)
      },
    }),
  }
})

import { POST as sendCode } from '../../app/api/v1/customer/phone/send-code/route'

const BASE = 'http://localhost:3001/api/v1'
const TELEFONO = `9${String(Date.now()).slice(-8)}`
const NOMBRE = 'Vecino OTP'

interface Vecino {
  userId: string
  token: string
}
const vecinos: Vecino[] = []
let previo: unknown = null

async function crearVecino(tag: string): Promise<Vecino> {
  const email = `otp-phone-${tag}-${Date.now()}@integration.local`
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
    create.mockResolvedValue({ channel: 'sms' })
    const { data } = await localClient
      .from('app_settings')
      .select('value')
      .eq('key', 'rate_limits')
      .maybeSingle()
    previo = data?.value ?? null
    // Umbral desde app_settings (no del código): 2 envíos por número.
    const { error } = await localClient.from('app_settings').upsert({
      key: 'rate_limits',
      value: { ...((previo as object | null) ?? {}), otp_phone: { limit: 2, windowSec: 86400 } },
    })
    if (error) throw new Error(`sembrar rate_limits falló: ${error.message}`)
  })

  afterAll(async () => {
    if (previo === null) await localClient.from('app_settings').delete().eq('key', 'rate_limits')
    else await localClient.from('app_settings').upsert({ key: 'rate_limits', value: previo })
    for (const v of vecinos) {
      await localClient.from('customer_otp_attempts').delete().eq('user_id', v.userId)
      await localClient.from('customer_profiles').delete().eq('user_id', v.userId)
      await localClient.from('users').delete().eq('id', v.userId)
      await localClient.auth.admin.deleteUser(v.userId)
    }
  })

  it('el tercer pedido al mismo número es 429 aunque lo pida OTRO usuario, y no llama a Twilio', async () => {
    const a = await crearVecino('a')
    const b = await crearVecino('b')
    expect((await pedir(a, TELEFONO)).status).toBe(200)
    expect((await pedir(b, TELEFONO)).status).toBe(200)
    create.mockClear()
    const res = await pedir(a, TELEFONO)
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('otro número no se ve afectado', async () => {
    const c = await crearVecino('c')
    const otro = `9${String(Date.now() + 1).slice(-7)}0`
    expect((await pedir(c, otro)).status).toBe(200)
  })

  it('la clave del contador no lleva el teléfono en claro', () => {
    expect(hits.keys.length).toBeGreaterThan(0)
    for (const k of hits.keys) expect(k).not.toContain(TELEFONO)
  })
})
