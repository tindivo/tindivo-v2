/**
 * Tests de INTEGRACIÓN del muro del piloto cerrado (migración 0135).
 *
 * Corre contra la DB LOCAL (127.0.0.1:54321) y llama a los dos route handlers
 * directamente con un `Request`, igual que `push-subscriptions.integration.test.ts`.
 * Los JWT son reales: se crean usuarios con el admin de Auth y se entra con
 * contraseña, así que `requireRole` valida contra el GoTrue local.
 *
 * Lo único mockeado es Twilio. No por comodidad: el caso "número invitado pasa
 * send-code" atraviesa el gate y llegaría a pedir un SMS de verdad.
 *
 * EL TEST QUE IMPORTA es P4. El gate de pedidos se enforcea sobre el teléfono
 * VERIFICADO (`customer_profiles.phone`), no sobre el que el cliente teclea en el
 * checkout (`body.customerPhone`). P3 y P4 son el par que lo demuestra: mismo
 * usuario, mismos dos números, intercambiados de sitio, resultados opuestos.
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

// Twilio mockeado: `twilioClient` real es `null` sin credenciales y el handler
// respondería 503, que taparía el resultado del gate.
vi.mock('@/lib/twilio/client', () => ({
  twilioClient: {
    verify: {
      v2: {
        services: () => ({
          verifications: { create: async () => ({ channel: 'sms' }) },
        }),
      },
    },
  },
  VERIFY_SERVICE_SID: 'VAtest',
}))

import { PILOT_LAUNCH_AT } from '@tindivo/contracts'
import { POST as createOrder } from '../../app/api/v1/customer/orders/route'
import { POST as sendCode } from '../../app/api/v1/customer/phone/send-code/route'
import { POST as pilotAccess } from '../../app/api/v1/public/pilot-access/route'
import { PILOT_REJECTION_DETAIL } from '../pilot/gate'

const BASE = 'http://localhost:3001/api/v1'
const RUN = `pilot-${Date.now()}`

/** Invitado: entra en `pilot_whitelist`. */
const PHONE_IN = '987000111'
/** No invitado: nunca entra en la whitelist. */
const PHONE_OUT = '987000222'

interface TestUser {
  id: string
  token: string
  /** El que quedó en `customer_profiles.phone`, en E.164. */
  verified: string
}

/** Usuario cuyo teléfono VERIFICADO está invitado. */
let userIn: TestUser
/** Usuario cuyo teléfono VERIFICADO NO está invitado. */
let userOut: TestUser

function headers(token: string): Record<string, string> {
  return { 'content-type': 'application/json', authorization: `Bearer ${token}` }
}

function postSendCode(token: string, phone: string): Promise<Response> {
  return sendCode(
    new Request(`${BASE}/customer/phone/send-code`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({ phone }),
    }),
  )
}

function postOrder(token: string, customerPhone: string): Promise<Response> {
  return createOrder(
    new Request(`${BASE}/customer/orders`, {
      method: 'POST',
      headers: { ...headers(token), 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({
        businessId: crypto.randomUUID(),
        deliveryMethod: 'pickup',
        paymentIntent: 'prepaid',
        customerName: 'Vecino de Prueba',
        customerPhone,
        items: [{ menuItemId: crypto.randomUUID(), quantity: 1 }],
      }),
    }),
  )
}

/** El endpoint público que consulta el muro de la portada. Sin auth. */
function postPilotAccess(phone: string): Promise<Response> {
  return pilotAccess(
    new Request(`${BASE}/public/pilot-access`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    }),
  )
}

/** `{ status, code, detail }` de una respuesta, para poder imprimirla cruda. */
async function summarize(res: Response) {
  const body = (await res.json()) as { code?: string; detail?: string }
  return { status: res.status, code: body.code, detail: body.detail }
}

/** ¿La respuesta fue el rechazo del muro? */
function isPilotRejection(s: { status: number; code?: string; detail?: string }): boolean {
  return s.status === 403 && s.detail === PILOT_REJECTION_DETAIL
}

async function createCustomer(suffix: string, phone9: string): Promise<TestUser> {
  const email = `${RUN}-${suffix}@integration.local`
  const password = 'test-password-12345'
  const { data, error } = await localClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Pilot Test ${suffix.toUpperCase()}` },
  })
  if (error) throw new Error(`createCustomer(${suffix}) failed: ${error.message}`)
  const id = data.user.id

  // `handle_new_user` ya siembra el rol `customer` al crear el auth user; el
  // upsert es para no depender de ese detalle del trigger.
  const { error: roleErr } = await localClient
    .from('user_roles')
    .upsert({ user_id: id, role: 'customer' })
  if (roleErr) throw new Error(`user_roles upsert failed: ${roleErr.message}`)

  // El perfil guarda E.164, que es lo que escribe /customer/phone/verify.
  const verified = `+51${phone9}`
  const { error: profErr } = await localClient.from('customer_profiles').upsert({
    user_id: id,
    full_name: `Pilot Test ${suffix.toUpperCase()}`,
    phone: verified,
    phone_verified_at: new Date().toISOString(),
  })
  if (profErr) throw new Error(`customer_profiles upsert failed: ${profErr.message}`)

  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !session.session) {
    throw new Error(`signIn(${suffix}) failed: ${signInErr?.message}`)
  }
  return { id, token: session.session.access_token, verified }
}

beforeAll(async () => {
  await localClient.from('pilot_whitelist').delete().in('phone', [PHONE_IN, PHONE_OUT])
  const { error } = await localClient.from('pilot_whitelist').insert({ phone: PHONE_IN })
  if (error) throw new Error(`seed pilot_whitelist failed: ${error.message}`)

  userIn = await createCustomer('in', PHONE_IN)
  userOut = await createCustomer('out', PHONE_OUT)
})

afterAll(async () => {
  vi.useRealTimers()
  await localClient.from('pilot_whitelist').delete().in('phone', [PHONE_IN, PHONE_OUT])
  for (const u of [userIn, userOut]) {
    if (!u) continue
    await localClient.from('customer_otp_attempts').delete().eq('user_id', u.id)
    await localClient.from('customer_profiles').delete().eq('user_id', u.id)
    await localClient.from('user_roles').delete().eq('user_id', u.id)
    await localClient.from('users').delete().eq('id', u.id)
    await localClient.auth.admin.deleteUser(u.id)
  }
})

describe('muro del piloto — piloto ACTIVO (reloj real, hoy)', () => {
  it('P1 número invitado pasa send-code Y pasa el gate de orders', async () => {
    const code = await summarize(await postSendCode(userIn.token, PHONE_IN))
    console.log('P1 send-code  ->', JSON.stringify(code))
    expect(code.status).toBe(200)

    const order = await summarize(await postOrder(userIn.token, PHONE_IN))
    console.log('P1 orders     ->', JSON.stringify(order))
    expect(isPilotRejection(order)).toBe(false)
  })

  it('P2 número NO invitado es rechazado en send-code', async () => {
    const s = await summarize(await postSendCode(userOut.token, PHONE_OUT))
    console.log('P2 send-code  ->', JSON.stringify(s))
    expect(s.status).toBe(403)
    expect(s.detail).toBe(PILOT_REJECTION_DETAIL)
  })

  it('P2-bis número NO invitado es rechazado en orders', async () => {
    const s = await summarize(await postOrder(userOut.token, PHONE_OUT))
    console.log('P2-bis orders ->', JSON.stringify(s))
    expect(s.status).toBe(403)
    expect(s.detail).toBe(PILOT_REJECTION_DETAIL)
  })

  it('P3 verificado INVITADO + body.customerPhone distinto -> PASA', async () => {
    // Se enforcea el verificado, así que teclear otro número no debe estorbar.
    const s = await summarize(await postOrder(userIn.token, PHONE_OUT))
    console.log('P3 orders     ->', JSON.stringify(s))
    expect(isPilotRejection(s)).toBe(false)
  })

  it('P4 verificado NO invitado + body.customerPhone INVITADO -> RECHAZADO', async () => {
    // La evasión: el cliente teclea en el checkout un número que sí está en la
    // lista. Si el gate mirara `body.customerPhone`, esto pasaría.
    const s = await summarize(await postOrder(userOut.token, PHONE_IN))
    console.log('P4 orders     ->', JSON.stringify(s))
    expect(s.status).toBe(403)
    expect(s.detail).toBe(PILOT_REJECTION_DETAIL)
  })

  it('P4-bis la misma evasión tampoco funciona en send-code', async () => {
    // Aquí el gate SÍ mira el número del body, y es correcto: send-code no tiene
    // teléfono verificado que mirar (justamente está intentando verificar uno).
    // Lo que cierra la puerta es P4: la cuenta ya verificada no puede pedir.
    const s = await summarize(await postSendCode(userOut.token, PHONE_IN))
    console.log('P4-bis s-code ->', JSON.stringify(s))
    expect(s.status).toBe(200)
  })
})

describe('POST /public/pilot-access — el que consulta el muro', () => {
  it('P6 número invitado -> allowed true', async () => {
    const res = await postPilotAccess(PHONE_IN)
    const body = await res.json()
    console.log('P6 access IN  ->', res.status, JSON.stringify(body))
    expect(res.status).toBe(200)
    expect(body.data.allowed).toBe(true)
  })

  it('P6-bis número NO invitado -> allowed false', async () => {
    const res = await postPilotAccess(PHONE_OUT)
    const body = await res.json()
    console.log('P6-bis access ->', res.status, JSON.stringify(body))
    expect(res.status).toBe(200)
    expect(body.data.allowed).toBe(false)
  })

  it('P6-ter un número inválido no llega a la tabla: 422', async () => {
    const res = await postPilotAccess('123')
    const body = await res.json()
    console.log('P6-ter access ->', res.status, JSON.stringify(body.code))
    expect(res.status).toBe(422)
  })
})

describe('muro del piloto — reloj DESPUÉS de PILOT_LAUNCH_AT', () => {
  it('P5 número NO invitado pasa los dos endpoints', async () => {
    // Solo se falsea `Date`: falsear todos los timers rompe los fetch del cliente
    // de Supabase.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const after = new Date(PILOT_LAUNCH_AT.getTime() + 60_000)
      vi.setSystemTime(after)
      console.log(
        'P5 reloj      ->',
        new Date().toISOString(),
        `(launch: ${PILOT_LAUNCH_AT.toISOString()})`,
      )

      const code = await summarize(await postSendCode(userOut.token, PHONE_OUT))
      console.log('P5 send-code  ->', JSON.stringify(code))
      expect(code.status).toBe(200)

      const order = await summarize(await postOrder(userOut.token, PHONE_OUT))
      console.log('P5 orders     ->', JSON.stringify(order))
      expect(isPilotRejection(order)).toBe(false)

      // Y el endpoint del muro deja de consultar la tabla: todo el mundo pasa.
      const access = await postPilotAccess(PHONE_OUT)
      const body = await access.json()
      console.log('P5 access     ->', access.status, JSON.stringify(body))
      expect(body.data.allowed).toBe(true)
      expect(body.data.pilotActive).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
