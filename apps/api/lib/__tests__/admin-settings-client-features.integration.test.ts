/**
 * `PATCH /admin/settings` para `client_features`, atravesando la capa HTTP.
 *
 * POR QUÉ EXISTE. El panel manda el MAPA COMPLETO de interruptores. Sin escritura
 * condicional, un panel abierto con datos viejos reemplazaba el mapa y reactivaba
 * sin aviso un interruptor que otro admin había apagado (CAX-001). Aquí se prueba
 * que la ruta exige `expectedUpdatedAt`, que lo compara con `updated_at` y que el
 * perdedor de la carrera recibe 409 sin tocar la base.
 */
import { createClient } from '@supabase/supabase-js'
import type { Json } from '@tindivo/supabase'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PATCH } from '../../app/api/v1/admin/settings/route'
import { localClient as db } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/** Service-role del stack local del CLI. Pública, igual que la anon. */
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// El handler construye su propio cliente desde el entorno, y vitest no lo trae.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

const KEY = 'client_features'

type Mapa = Record<string, { enabled: boolean; message?: string }>

let adminToken = ''
let clienteToken = ''
let clienteUserId = ''
/** Fila tal como estaba antes del test; `null` si no existía. */
let original: { value: Json } | null = null

/** Deja la fila con `aa` y `bb` encendidas y devuelve su `updated_at`. */
async function sembrar(): Promise<string> {
  const { data, error } = await db
    .from('app_settings')
    .upsert({
      key: KEY,
      value: { features: { aa: { enabled: true }, bb: { enabled: true } } },
    })
    .select('updated_at')
    .single()
  if (error) throw new Error(`sembrar client_features falló: ${error.message}`)
  return data.updated_at
}

async function leerFila(): Promise<{ value: { features: Mapa }; updated_at: string }> {
  const { data, error } = await db
    .from('app_settings')
    .select('value,updated_at')
    .eq('key', KEY)
    .single()
  if (error) throw new Error(`leer client_features falló: ${error.message}`)
  return data as unknown as { value: { features: Mapa }; updated_at: string }
}

async function patch(body: unknown, token: string | null = adminToken): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return PATCH(
    new Request(`${LOCAL_URL}/api/v1/admin/settings`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    }),
  )
}

async function login(email: string, password: string): Promise<string> {
  // Cliente aparte: `signInWithPassword` sustituiría la sesión de `localClient`.
  const auth = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email} falló: ${error.message}`)
  return data.session?.access_token ?? ''
}

beforeAll(async () => {
  const { data, error } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  if (error) throw new Error(`leer original falló: ${error.message}`)
  original = data

  adminToken = await login('admin@e2e.local', 'e2e-password-12345')

  // Usuario autenticado SIN rol admin.
  const email = `feat-${crypto.randomUUID().slice(0, 8)}@integration.local`
  const { data: creado, error: authErr } = await db.auth.admin.createUser({
    email,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Test Cliente' },
  })
  if (authErr) throw new Error(`crear usuario falló: ${authErr.message}`)
  clienteUserId = creado.user.id
  clienteToken = await login(email, 'test-password-12345')
})

afterAll(async () => {
  if (original) {
    await db.from('app_settings').update({ value: original.value }).eq('key', KEY)
  } else {
    await db.from('app_settings').delete().eq('key', KEY)
  }
  if (clienteUserId) {
    await db.from('users').delete().eq('id', clienteUserId)
    await db.auth.admin.deleteUser(clienteUserId)
  }
})

describe('PATCH /admin/settings · client_features', () => {
  it('sin Authorization → 401', async () => {
    const updatedAt = await sembrar()
    const res = await patch(
      { key: KEY, value: { features: {} }, expectedUpdatedAt: updatedAt },
      null,
    )
    expect(res.status).toBe(401)
  })

  it('un cliente autenticado que no es admin → 403', async () => {
    const updatedAt = await sembrar()
    const res = await patch(
      {
        key: KEY,
        value: { features: { aa: { enabled: false }, bb: { enabled: true } } },
        expectedUpdatedAt: updatedAt,
      },
      clienteToken,
    )
    expect(res.status).toBe(403)
    expect((await leerFila()).value.features.aa?.enabled).toBe(true)
  })

  it('admin con expectedUpdatedAt correcto → 200 y el valor queda guardado', async () => {
    const updatedAt = await sembrar()
    const res = await patch({
      key: KEY,
      value: {
        features: { aa: { enabled: false, message: 'Vuelve pronto' }, bb: { enabled: true } },
      },
      expectedUpdatedAt: updatedAt,
    })
    expect(res.status).toBe(200)
    const fila = await leerFila()
    expect(fila.value.features.aa).toEqual({ enabled: false, message: 'Vuelve pronto' })
    expect(fila.value.features.bb).toEqual({ enabled: true })
  })

  it('añadir una clave → 403 y la fila no cambia', async () => {
    const updatedAt = await sembrar()
    const antes = await leerFila()
    const res = await patch({
      key: KEY,
      value: {
        features: { aa: { enabled: true }, bb: { enabled: true }, cc: { enabled: true } },
      },
      expectedUpdatedAt: updatedAt,
    })
    expect(res.status).toBe(403)
    expect(await leerFila()).toEqual(antes)
  })

  it('quitar una clave → 403', async () => {
    const updatedAt = await sembrar()
    const antes = await leerFila()
    const res = await patch({
      key: KEY,
      value: { features: { aa: { enabled: true } } },
      expectedUpdatedAt: updatedAt,
    })
    expect(res.status).toBe(403)
    expect(await leerFila()).toEqual(antes)
  })

  it('sin expectedUpdatedAt → 422', async () => {
    await sembrar()
    const res = await patch({
      key: KEY,
      value: { features: { aa: { enabled: false }, bb: { enabled: true } } },
    })
    expect(res.status).toBe(422)
    expect((await leerFila()).value.features.aa?.enabled).toBe(true)
  })

  it('CAX-001: la pestaña con datos viejos recibe 409 y no reactiva lo apagado', async () => {
    // Dos «pestañas» leen la misma versión de la fila.
    const versionVieja = await sembrar()

    // La primera apaga `aa`.
    const primera = await patch({
      key: KEY,
      value: { features: { aa: { enabled: false }, bb: { enabled: true } } },
      expectedUpdatedAt: versionVieja,
    })
    expect(primera.status).toBe(200)

    // La segunda, con su copia vieja (aa=true), guarda un cambio de `bb`.
    const segunda = await patch({
      key: KEY,
      value: { features: { aa: { enabled: true }, bb: { enabled: false } } },
      expectedUpdatedAt: versionVieja,
    })
    expect(segunda.status).toBe(409)

    // `aa` sigue apagada y `bb` intacta: la segunda no escribió nada.
    const fila = await leerFila()
    expect(fila.value.features.aa?.enabled).toBe(false)
    expect(fila.value.features.bb?.enabled).toBe(true)
  })

  it('value malformado → 422', async () => {
    const updatedAt = await sembrar()
    const res = await patch({
      key: KEY,
      value: { features: { aa: { enabled: 'si' }, bb: { enabled: true } } },
      expectedUpdatedAt: updatedAt,
    })
    expect(res.status).toBe(422)
    expect((await leerFila()).value.features.aa?.enabled).toBe(true)
  })
})
