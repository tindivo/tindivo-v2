/**
 * Tests de INTEGRACIÓN de los endpoints de suscripciones push.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321), como el resto de la
 * suite: nada mockeado, porque lo que se prueba ES la interacción con la BD
 * (limpieza de zombies, robo de endpoint entre usuarios, reset del contador de
 * fallos). Lo único que cambia respecto a los otros tests del directorio es que
 * aquí se llama al route handler de Next directamente con un `Request`, en vez
 * de a una RPC: la lógica vive en TypeScript, no en SQL.
 *
 * Los JWT son reales: se crean dos usuarios con el admin de Auth y se entra con
 * contraseña, así que `requireUser` valida contra el GoTrue local igual que en
 * producción.
 */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localClient } from './helpers/local-db'

// ── Keys locales de Supabase CLI (públicas y documentadas, igual que en
//    helpers/local-db.ts). `serverEnv()` valida perezosamente en la primera
//    request, así que basta con poblarlas antes de llamar a un handler.
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

import { GET } from '../../app/api/v1/push/subscriptions/me/route'
import { DELETE, POST } from '../../app/api/v1/push/subscriptions/route'

// ── Identificadores de esta corrida ───────────────────────────────────────────
// Todo endpoint sembrado lleva el prefijo, que es lo que permite limpiar sin
// tocar filas de nadie más.
const RUN = `test-push-${Date.now()}`
const FCM = 'https://fcm.googleapis.com/fcm/send'
const EP = (n: string) => `${FCM}/${RUN}-${n}`
const RUN_PREFIX = `${FCM}/${RUN}-`
/** Cualquier corrida de este archivo, presente o pasada (ver afterAll). */
const ANY_RUN_PREFIX = `${FCM}/test-push-`

const KEYS = { p256dh: 'p256dh-de-prueba', auth: 'auth-de-prueba' }
const UA_CHROME = 'UA-Chrome'
const UA_SAFARI = 'UA-Safari'
const BASE = 'http://localhost:3001/api/v1'

interface TestUser {
  id: string
  token: string
}

let userA: TestUser
let userB: TestUser

// ── Helpers de request ────────────────────────────────────────────────────────
function headers(token: string | null): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

const subBody = (endpoint: string, userAgent?: string) => ({
  endpoint,
  keys: KEYS,
  ...(userAgent === undefined ? {} : { userAgent }),
})

function postSub(token: string | null, body: unknown): Promise<Response> {
  return POST(
    new Request(`${BASE}/push/subscriptions`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify(body),
    }),
  )
}

function deleteSub(token: string | null, endpoint: string): Promise<Response> {
  return DELETE(
    new Request(`${BASE}/push/subscriptions`, {
      method: 'DELETE',
      headers: headers(token),
      body: JSON.stringify({ endpoint }),
    }),
  )
}

function getMe(token: string | null, endpoint?: string): Promise<Response> {
  const qs = endpoint === undefined ? '' : `?endpoint=${encodeURIComponent(endpoint)}`
  return GET(new Request(`${BASE}/push/subscriptions/me${qs}`, { headers: headers(token) }))
}

// ── Helpers de BD (service_role, bypassa RLS) ────────────────────────────────
interface SubRow {
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  user_agent: string | null
  failure_count: number
  last_failed_at: string | null
}

async function rowsOfRun(): Promise<SubRow[]> {
  const { data, error } = await localClient
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, user_agent, failure_count, last_failed_at')
    .like('endpoint', `${RUN_PREFIX}%`)
    .order('endpoint')
  if (error) throw new Error(`rowsOfRun failed: ${error.message}`)
  return (data ?? []) as unknown as SubRow[]
}

async function rowsOf(userId: string): Promise<SubRow[]> {
  return (await rowsOfRun()).filter((r) => r.user_id === userId)
}

async function createUser(suffix: string): Promise<TestUser> {
  const email = `${RUN}-${suffix}@integration.local`
  const password = 'test-password-12345'
  const { data, error } = await localClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Push Test ${suffix.toUpperCase()}` },
  })
  if (error) throw new Error(`createUser(${suffix}) failed: ${error.message}`)

  // Cliente aparte y efímero: firmar con `localClient` le pondría la sesión del
  // usuario encima del service_role y las lecturas de verificación pasarían a
  // estar sujetas a RLS.
  const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !session.session) {
    throw new Error(`signIn(${suffix}) failed: ${signInErr?.message ?? 'sin sesión'}`)
  }
  return { id: data.user.id, token: session.session.access_token }
}

async function deleteRunRows(prefix: string): Promise<void> {
  const { error } = await localClient
    .from('push_subscriptions')
    .delete()
    .like('endpoint', `${prefix}%`)
  if (error) throw new Error(`deleteRunRows failed: ${error.message}`)
}

describe('push/subscriptions — endpoints de suscripción', () => {
  beforeAll(async () => {
    userA = await createUser('a')
    userB = await createUser('b')
  })

  beforeEach(async () => {
    await deleteRunRows(RUN_PREFIX)
  })

  afterAll(async () => {
    // Se barre el prefijo genérico, no solo el de esta corrida: si una corrida
    // anterior murió a medias, sus filas quedarían para siempre.
    await deleteRunRows(ANY_RUN_PREFIX)
    for (const u of [userA, userB]) {
      if (!u) continue
      await localClient.from('users').delete().eq('id', u.id)
      await localClient.auth.admin.deleteUser(u.id)
    }
  })

  // ── POST ────────────────────────────────────────────────────────────────────
  it('T1 suscripción nueva crea exactamente una fila', async () => {
    const res = await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    expect(res.status).toBe(201)

    const rows = await rowsOfRun()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(userA.id)
    expect(rows[0]?.endpoint).toBe(EP('a1'))
    expect(rows[0]?.p256dh).toBe(KEYS.p256dh)
    expect(rows[0]?.auth).toBe(KEYS.auth)
  })

  it('T2 re-suscripción idéntica es idempotente', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    const res = await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    expect(res.status).toBe(201)

    expect(await rowsOfRun()).toHaveLength(1)
  })

  it('T3 el upsert resetea failure_count y last_failed_at', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const { error: updErr } = await localClient
      .from('push_subscriptions')
      .update({ failure_count: 4, last_failed_at: new Date().toISOString() })
      .eq('user_id', userA.id)
      .eq('endpoint', EP('a1'))
    expect(updErr).toBeNull()

    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const rows = await rowsOfRun()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.failure_count).toBe(0)
    expect(rows[0]?.last_failed_at).toBeNull()
  })

  it('T4 endpoint rotado en el mismo navegador: la fila vieja se borra', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    await postSub(userA.token, subBody(EP('a2'), UA_CHROME))

    const rows = await rowsOf(userA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.endpoint).toBe(EP('a2'))
    expect(rows.map((r) => r.endpoint)).not.toContain(EP('a1'))
  })

  it('T5 distinto user_agent NO se considera zombie', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    await postSub(userA.token, subBody(EP('b1'), UA_SAFARI))

    const rows = await rowsOf(userA.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.endpoint).sort()).toEqual([EP('a1'), EP('b1')].sort())
  })

  it('T6 endpoint reclamado por otro usuario cambia de dueño', async () => {
    await postSub(userA.token, subBody(EP('shared'), UA_CHROME))
    await postSub(userB.token, subBody(EP('shared'), UA_CHROME))

    const rows = (await rowsOfRun()).filter((r) => r.endpoint === EP('shared'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(userB.id)
    expect(await rowsOf(userA.id)).toHaveLength(0)
  })

  it('T7 sin userAgent no revienta y no borra de más', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    const res = await postSub(userA.token, subBody(EP('a2')))
    expect(res.status).toBe(201)

    expect(await rowsOf(userA.id)).toHaveLength(2)
  })

  it('T8 POST sin auth devuelve 401 y no crea nada', async () => {
    const res = await postSub(null, subBody(EP('a1'), UA_CHROME))
    expect(res.status).toBe(401)

    expect(await rowsOfRun()).toHaveLength(0)
  })

  it('T9 payload inválido devuelve 4xx con problem detail, no 500', async () => {
    const res = await postSub(userA.token, { endpoint: 'no-es-una-url', keys: KEYS })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    const body = await res.json()
    expect(body.code).toBe('validation_error')
    expect(body.status).toBe(res.status)
    expect(JSON.stringify(body)).not.toMatch(/\bat .*\.ts:\d+/)
    expect(await rowsOfRun()).toHaveLength(0)
  })

  // ── DELETE ──────────────────────────────────────────────────────────────────
  it('T10 borra la suscripción propia', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const res = await deleteSub(userA.token, EP('a1'))
    expect(res.status).toBe(200)

    expect(await rowsOfRun()).toHaveLength(0)
  })

  it('T11 NO borra la suscripción de otro usuario', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    await deleteSub(userB.token, EP('a1'))

    const rows = await rowsOfRun()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(userA.id)
  })

  it('T12 borrar un endpoint inexistente es idempotente', async () => {
    const res = await deleteSub(userA.token, EP('nunca-existio'))
    expect(res.status).toBe(200)
  })

  it('T13 DELETE sin auth devuelve 401', async () => {
    const res = await deleteSub(null, EP('a1'))
    expect(res.status).toBe(401)
  })

  // ── GET /me ─────────────────────────────────────────────────────────────────
  it('T14 suscripción propia: owned true, exists true', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const res = await getMe(userA.token, EP('a1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ owned: true, exists: true })
  })

  it('T15 suscripción ajena: owned false, exists true', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const res = await getMe(userB.token, EP('a1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ owned: false, exists: true })
  })

  it('T16 suscripción desconocida: owned false, exists false', async () => {
    const res = await getMe(userA.token, EP('fantasma'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ owned: false, exists: false })
  })

  it('T17 no filtra la identidad del dueño ajeno', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const res = await getMe(userB.token, EP('a1'))
    const body = await res.json()
    const serialized = JSON.stringify(body)

    expect(serialized).not.toContain(userA.id)
    for (const clave of ['userId', 'user_id', 'owner', 'email']) {
      expect(serialized).not.toContain(`"${clave}"`)
    }
  })

  it('T18 GET sin parámetro endpoint devuelve 4xx, no 500', async () => {
    const res = await getMe(userA.token)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    const body = await res.json()
    expect(body.code).toBe('validation_error')
  })

  it('T19 GET sin auth devuelve 401', async () => {
    const res = await getMe(null, EP('a1'))
    expect(res.status).toBe(401)
  })
})
