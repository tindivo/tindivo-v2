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
/**
 * El `user_agent` REAL que Chrome manda en cualquier Android desde la *UA
 * reduction*. Nueve dispositivos de `tindivo-prod` comparten esta cadena byte a
 * byte. Va literal a propósito: es la razón de que la limpieza no pueda usarlo
 * como identidad de dispositivo.
 */
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
const INSTALL_A = 'install-aaaaaaaa-1111'
const INSTALL_B = 'install-bbbbbbbb-2222'
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

const subBody = (endpoint: string, userAgent?: string, installId?: string) => ({
  endpoint,
  keys: KEYS,
  ...(userAgent === undefined ? {} : { userAgent }),
  ...(installId === undefined ? {} : { installId }),
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

/** Baja de TODOS los dispositivos del usuario (acompaña a `signOutEverywhere`). */
function deleteAllSubs(token: string | null): Promise<Response> {
  return DELETE(
    new Request(`${BASE}/push/subscriptions`, {
      method: 'DELETE',
      headers: headers(token),
      body: JSON.stringify({ all: true }),
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
  install_id: string | null
  failure_count: number
  last_failed_at: string | null
}

async function rowsOfRun(): Promise<SubRow[]> {
  const { data, error } = await localClient
    .from('push_subscriptions')
    .select(
      'user_id, endpoint, p256dh, auth, user_agent, install_id, failure_count, last_failed_at',
    )
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

  it('T4 endpoint rotado en el mismo dispositivo: la fila vieja se borra', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME, INSTALL_A))
    await postSub(userA.token, subBody(EP('a2'), UA_CHROME, INSTALL_A))

    const rows = await rowsOf(userA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.endpoint).toBe(EP('a2'))
    expect(rows[0]?.install_id).toBe(INSTALL_A)
    expect(rows.map((r) => r.endpoint)).not.toContain(EP('a1'))
  })

  it('T5 distinto install_id NO se considera zombie', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME, INSTALL_A))
    await postSub(userA.token, subBody(EP('b1'), UA_SAFARI, INSTALL_B))

    const rows = await rowsOf(userA.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.endpoint).sort()).toEqual([EP('a1'), EP('b1')].sort())
  })

  it('T5-bis dos Android de la misma persona con el MISMO user_agent sobreviven', async () => {
    // ESTE ES EL FALLO QUE CERRÓ LA 0198, y por eso el `user_agent` es idéntico
    // en las dos altas: es lo que manda Chrome en cualquier Android. Mientras la
    // limpieza usó esa cadena como identidad, el segundo teléfono borraba al
    // primero y la persona se quedaba sin avisos en un equipo que sí usaba, sin
    // enterarse hasta que un pedido no le sonaba.
    await postSub(userA.token, subBody(EP('android1'), UA_ANDROID, INSTALL_A))
    await postSub(userA.token, subBody(EP('android2'), UA_ANDROID, INSTALL_B))

    const rows = await rowsOf(userA.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.install_id).sort()).toEqual([INSTALL_A, INSTALL_B].sort())
  })

  it('T6 endpoint reclamado por otro usuario cambia de dueño', async () => {
    await postSub(userA.token, subBody(EP('shared'), UA_CHROME))
    await postSub(userB.token, subBody(EP('shared'), UA_CHROME))

    const rows = (await rowsOfRun()).filter((r) => r.endpoint === EP('shared'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.user_id).toBe(userB.id)
    expect(await rowsOf(userA.id)).toHaveLength(0)
  })

  it('T7 sin installId no borra nada, ni siquiera con el user_agent repetido', async () => {
    // El fallback al `user_agent` para clientes viejos parece prudente y es lo
    // contrario: dejaría el fallo vivo, y encima de forma asimétrica. Lo que se
    // pierde es una fila rancia, que recoge la purga por 404/410 de `send-push`.
    await postSub(userA.token, subBody(EP('a1'), UA_ANDROID))
    const res = await postSub(userA.token, subBody(EP('a2'), UA_ANDROID))
    expect(res.status).toBe(201)

    const rows = await rowsOf(userA.id)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.install_id === null)).toBe(true)
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

  // ── DELETE { all: true } ────────────────────────────────────────────────────
  // Acompaña a `signOutEverywhere`. Sin esto, revocar las sesiones deja al
  // dispositivo perdido sin acceso pero AÚN recibiendo notificaciones con el
  // nombre y la dirección del cliente en la vista previa.
  it('T20 all borra TODOS los dispositivos del usuario', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    await postSub(userA.token, subBody(EP('b1'), UA_SAFARI))
    expect(await rowsOf(userA.id)).toHaveLength(2)

    const res = await deleteAllSubs(userA.token)
    expect(res.status).toBe(200)

    expect(await rowsOf(userA.id)).toHaveLength(0)
  })

  // LA ASERCIÓN QUE SOSTIENE EL ENDPOINT: el acotado por `user_id` de la rama
  // `all`, que corre con service_role y por tanto sin RLS que la frene.
  //
  // Verificado por mutación el 2026-08-17: quitando ese `.eq('user_id', …)` el
  // test se pone rojo. El modo de fallo resultó ser distinto del esperado —
  // PostgREST rechaza un DELETE sin ningún filtro, así que la petición revienta
  // en vez de vaciar la tabla— pero un filtro EQUIVOCADO (otra columna, otro
  // id) sí borraría filas ajenas, y eso es lo que este test vigila.
  it('T21 all NO toca las suscripciones de otro usuario', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))
    await postSub(userB.token, subBody(EP('b1'), UA_CHROME))

    await deleteAllSubs(userA.token)

    expect(await rowsOf(userA.id)).toHaveLength(0)
    const deB = await rowsOf(userB.id)
    expect(deB).toHaveLength(1)
    expect(deB[0]?.endpoint).toBe(EP('b1'))
  })

  it('T22 all sin auth devuelve 401 y no borra nada', async () => {
    await postSub(userA.token, subBody(EP('a1'), UA_CHROME))

    const res = await deleteAllSubs(null)
    expect(res.status).toBe(401)

    expect(await rowsOf(userA.id)).toHaveLength(1)
  })

  it('T23 un body que no es ni endpoint ni all devuelve 4xx, no 500', async () => {
    const res = await DELETE(
      new Request(`${BASE}/push/subscriptions`, {
        method: 'DELETE',
        headers: headers(userA.token),
        // `all: false` no vale: la baja masiva se pide explícitamente o no se pide.
        body: JSON.stringify({ all: false }),
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)

    const body = await res.json()
    expect(body.code).toBe('validation_error')
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
