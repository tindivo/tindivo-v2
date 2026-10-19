/**
 * MV7a: registro de dispositivos nativos de push (APNs y FCM), migración 0268.
 * Contra la base LOCAL, por HTTP a la ruta real `PUT/DELETE /push/devices/{installId}`.
 *
 *  · registro             200 con la forma del contrato y SIN el token (es una credencial).
 *  · rotación             misma instalación, token nuevo: una fila y contadores de fallo en cero.
 *  · token que cambia de  la fila de la otra instalación desaparece (el `unique` no se convierte en 500).
 *    instalación
 *  · cambio de usuario    en el mismo aparato la fila pasa al usuario nuevo.
 *  · baja                 propia borra; de otro o inexistente responde 204 y no toca nada.
 *  · errores              401 sin sesión, 422 cuerpo o `installId` inválidos, 403 app que no es de su rol.
 *  · borrado de cuenta    los dispositivos caen con la identidad (DB-13); la RPC rechaza una cuenta borrada.
 *  · concurrencia         dos registros simultáneos del mismo token terminan con UNA fila y sin 500 (TST-2).
 *  · catálogo             `anon` y `authenticated` no ejecutan las funciones ni leen la tabla; RLS activada.
 *
 * Usuarios propios (`push-devices-<run>@integration.local`); `afterAll` los borra y sus filas caen en cascada.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { DELETE as deleteAccount } from '../../app/api/v1/customer/account/route'
import { DELETE, PUT } from '../../app/api/v1/push/devices/[installId]/route'
import { localClient as db } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CLAVE = 'test-password-12345'
const RUN = Math.random().toString(36).slice(2, 8)

interface Usuario {
  id: string
  token: string
  client: ReturnType<typeof createClient>
}

const usuarios: string[] = []
let secuencia = 0

/** Un cliente de la app `customer`; con `rol` extra, también de negocio o motorizado. */
async function crearUsuario(rol?: 'business' | 'driver'): Promise<Usuario> {
  secuencia += 1
  const email = `push-devices-${RUN}-${secuencia}@integration.local`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino MV7a' },
  })
  if (error) throw new Error(`crear usuario falló: ${error.message}`)
  const id = data.user.id
  usuarios.push(id)
  if (rol) {
    const { error: rerr } = await db.from('user_roles').insert({ user_id: id, role: rol })
    if (rerr) throw new Error(`asignar rol falló: ${rerr.message}`)
  }
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error: serr } = await client.auth.signInWithPassword({ email, password: CLAVE })
  if (serr || !s.session) throw new Error(`entrar falló: ${serr?.message}`)
  return { id, token: s.session.access_token, client }
}

const nuevoInstallId = (): string => crypto.randomUUID()
const nuevoToken = (): string => `tok-${RUN}-${crypto.randomUUID()}`

function cuerpo(token: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    platform: 'ios',
    app: 'customer',
    token,
    appVersion: '1.0.0',
    notificationsEnabled: true,
    ...extra,
  }
}

interface Respuesta {
  status: number
  // biome-ignore lint/suspicious/noExplicitAny: cuerpo JSON de una respuesta de prueba
  body: any
  raw: string
}

async function llamar(
  handler: typeof PUT,
  installId: string,
  opts: { bearer?: string; body?: unknown },
): Promise<Respuesta> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`
  const res = await handler(
    new Request(`http://localhost:3001/api/v1/push/devices/${installId}`, {
      method: handler === PUT ? 'PUT' : 'DELETE',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    { params: Promise.resolve({ installId }) },
  )
  const raw = await res.text()
  return { status: res.status, body: raw ? JSON.parse(raw) : null, raw }
}

const registrar = (u: Usuario, installId: string, token: string, extra = {}) =>
  llamar(PUT, installId, { bearer: u.token, body: cuerpo(token, extra) })

async function fila(installId: string) {
  const { data, error } = await db.from('push_devices').select('*').eq('install_id', installId)
  if (error) throw new Error(error.message)
  return data[0] ?? null
}

async function filasConToken(token: string) {
  const { data, error } = await db.from('push_devices').select('install_id').eq('token', token)
  if (error) throw new Error(error.message)
  return data
}

/** SQL por stdin (los acentos no se corrompen); el catálogo no se lee por PostgREST. */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8' },
  ).trim()
}

afterAll(async () => {
  for (const id of usuarios.splice(0)) {
    await db.from('push_devices').delete().eq('user_id', id)
    await db.auth.admin.deleteUser(id)
  }
})

describe('PUT /push/devices/{installId}: registro', () => {
  it('registra, responde con la forma del contrato y nunca devuelve el token', async () => {
    const u = await crearUsuario()
    const installId = nuevoInstallId()
    const token = nuevoToken()
    const res = await registrar(u, installId, token, {
      osVersion: '18.0',
      deviceModel: 'iPhone15,2',
      locale: 'es-PE',
      timezone: 'America/Lima',
    })
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.data).sort()).toEqual([
      'app',
      'installId',
      'notificationsEnabled',
      'platform',
      'registeredAt',
      'updatedAt',
    ])
    expect(res.body.data).toMatchObject({
      installId,
      platform: 'ios',
      app: 'customer',
      notificationsEnabled: true,
    })
    expect(res.body.data.registeredAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/)
    expect(res.raw).not.toContain(token)

    const guardada = await fila(installId)
    expect(guardada).toMatchObject({
      user_id: u.id,
      token,
      environment: 'production',
      os_version: '18.0',
      device_model: 'iPhone15,2',
      locale: 'es-PE',
      timezone: 'America/Lima',
      failure_count: 0,
    })
  })

  it('registrar dos veces la misma instalación deja una sola fila', async () => {
    const u = await crearUsuario()
    const installId = nuevoInstallId()
    const token = nuevoToken()
    expect((await registrar(u, installId, token)).status).toBe(200)
    const otra = await registrar(u, installId, token, { notificationsEnabled: false })
    expect(otra.status).toBe(200)
    expect(otra.body.data.notificationsEnabled).toBe(false)
    const { data } = await db.from('push_devices').select('id').eq('install_id', installId)
    expect(data).toHaveLength(1)
  })

  it('rotación: mismo installId con token nuevo es una fila, con el token nuevo y los contadores en cero', async () => {
    const u = await crearUsuario()
    const installId = nuevoInstallId()
    const viejo = nuevoToken()
    const nuevo = nuevoToken()
    await registrar(u, installId, viejo)
    await db
      .from('push_devices')
      .update({
        failure_count: 4,
        last_failed_at: new Date().toISOString(),
        disabled_at: new Date().toISOString(),
        disabled_reason: 'unregistered',
      })
      .eq('install_id', installId)

    const mismo = await registrar(u, installId, viejo)
    expect(mismo.status).toBe(200)
    expect(await fila(installId)).toMatchObject({
      failure_count: 4,
      disabled_reason: 'unregistered',
    })

    const res = await registrar(u, installId, nuevo)
    expect(res.status).toBe(200)
    const rotada = await fila(installId)
    expect(rotada).toMatchObject({
      token: nuevo,
      failure_count: 0,
      last_failed_at: null,
      disabled_at: null,
      disabled_reason: null,
    })
    expect(await filasConToken(viejo)).toHaveLength(0)
    const { data } = await db.from('push_devices').select('id').eq('install_id', installId)
    expect(data).toHaveLength(1)
  })

  it('el mismo token en otra instalación borra la fila vieja', async () => {
    const u = await crearUsuario()
    const instalacionA = nuevoInstallId()
    const instalacionB = nuevoInstallId()
    const token = nuevoToken()
    await registrar(u, instalacionA, token)
    const res = await registrar(u, instalacionB, token)
    expect(res.status).toBe(200)
    expect(await fila(instalacionA)).toBeNull()
    expect(await fila(instalacionB)).toMatchObject({ token, user_id: u.id })
    expect(await filasConToken(token)).toHaveLength(1)
  })

  it('B no puede registrar la instalación de A: 409 conflict y la fila de A queda intacta', async () => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    const installId = nuevoInstallId()
    const tokenA = nuevoToken()
    await registrar(a, installId, tokenA)
    await db
      .from('push_devices')
      .update({ failure_count: 3, last_failed_at: new Date().toISOString() })
      .eq('install_id', installId)
    const antes = await fila(installId)

    for (const token of [tokenA, nuevoToken()]) {
      const res = await registrar(b, installId, token)
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('conflict')
    }
    expect(await fila(installId)).toEqual(antes)
    expect(antes).toMatchObject({ user_id: a.id, token: tokenA, failure_count: 3 })
  })

  it('cambio de usuario en el aparato: B registra un installId nuevo con el token de A y la fila de A desaparece', async () => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    const instalacionA = nuevoInstallId()
    const instalacionB = nuevoInstallId()
    const token = nuevoToken()
    await registrar(a, instalacionA, token)
    const res = await registrar(b, instalacionB, token)
    expect(res.status).toBe(200)
    expect(await fila(instalacionA)).toBeNull()
    expect(await fila(instalacionB)).toMatchObject({ user_id: b.id, token })
    expect(await filasConToken(token)).toHaveLength(1)
  })

  it('un motorizado y un negocio registran la app que les corresponde', async () => {
    const motorizado = await crearUsuario('driver')
    const negocio = await crearUsuario('business')
    const r1 = await registrar(motorizado, nuevoInstallId(), nuevoToken(), {
      app: 'motorizados',
      platform: 'android',
    })
    const r2 = await registrar(negocio, nuevoInstallId(), nuevoToken(), { app: 'negocios' })
    expect(r1.status).toBe(200)
    expect(r1.body.data).toMatchObject({ app: 'motorizados', platform: 'android' })
    expect(r2.status).toBe(200)
    expect(r2.body.data.app).toBe('negocios')
  })
})

describe('DELETE /push/devices/{installId}: baja', () => {
  it('la baja propia responde 204 y borra la fila', async () => {
    const u = await crearUsuario()
    const installId = nuevoInstallId()
    await registrar(u, installId, nuevoToken())
    const res = await llamar(DELETE, installId, { bearer: u.token })
    expect(res.status).toBe(204)
    expect(res.raw).toBe('')
    expect(await fila(installId)).toBeNull()
  })

  it('la baja de la instalación de otro responde 204 y la fila sigue', async () => {
    const dueno = await crearUsuario()
    const otro = await crearUsuario()
    const installId = nuevoInstallId()
    const token = nuevoToken()
    await registrar(dueno, installId, token)
    const antes = await fila(installId)
    const res = await llamar(DELETE, installId, { bearer: otro.token })
    expect(res.status).toBe(204)
    expect(await fila(installId)).toEqual(antes)
    expect(antes).toMatchObject({ user_id: dueno.id, token })
  })

  it('la baja de una instalación que no existe responde 204', async () => {
    const u = await crearUsuario()
    const res = await llamar(DELETE, nuevoInstallId(), { bearer: u.token })
    expect(res.status).toBe(204)
  })
})

describe('errores de PUT y DELETE', () => {
  it('401 sin token y con un token inválido', async () => {
    const installId = nuevoInstallId()
    for (const bearer of [undefined, 'no-es-un-jwt']) {
      const opts = bearer === undefined ? {} : { bearer }
      const put = await llamar(PUT, installId, { ...opts, body: cuerpo(nuevoToken()) })
      expect(put.status).toBe(401)
      expect(put.body.code).toBe('unauthorized')
      const del = await llamar(DELETE, installId, opts)
      expect(del.status).toBe(401)
    }
    expect(await fila(installId)).toBeNull()
  })

  it('422 con cuerpo inválido', async () => {
    const u = await crearUsuario()
    const installId = nuevoInstallId()
    const malos: unknown[] = [
      cuerpo('corto'),
      cuerpo(nuevoToken(), { platform: 'web' }),
      cuerpo(nuevoToken(), { app: 'admin' }),
      cuerpo(nuevoToken(), { environment: 'staging' }),
      cuerpo(nuevoToken(), { appVersion: '' }),
      cuerpo(nuevoToken(), { notificationsEnabled: 'si' }),
      { platform: 'ios', app: 'customer' },
    ]
    for (const body of malos) {
      const res = await llamar(PUT, installId, { bearer: u.token, body })
      expect(res.status).toBe(422)
      expect(res.body.code).toBe('validation_error')
    }
    expect(await fila(installId)).toBeNull()
  })

  it('422 con un installId que no es UUID, en PUT y en DELETE', async () => {
    const u = await crearUsuario()
    const put = await llamar(PUT, 'no-es-uuid', { bearer: u.token, body: cuerpo(nuevoToken()) })
    expect(put.status).toBe(422)
    const del = await llamar(DELETE, 'no-es-uuid', { bearer: u.token })
    expect(del.status).toBe(422)
  })

  it('403 si la app no corresponde al rol de la sesión', async () => {
    const cliente = await crearUsuario()
    for (const app of ['negocios', 'motorizados']) {
      const installId = nuevoInstallId()
      const res = await registrar(cliente, installId, nuevoToken(), { app })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('forbidden')
      expect(await fila(installId)).toBeNull()
    }
  })
})

describe('borrado de cuenta (DB-13)', () => {
  it('borrar la cuenta elimina sus dispositivos y la RPC rechaza a la cuenta borrada', async () => {
    const u = await crearUsuario()
    const { error: perr } = await db.from('customer_profiles').insert({
      user_id: u.id,
      full_name: 'Vecino MV7a',
      phone: `9${String(Date.now()).slice(-8)}`,
      phone_verified_at: new Date().toISOString(),
    })
    if (perr) throw new Error(`crear el perfil falló: ${perr.message}`)
    const instalaciones = [nuevoInstallId(), nuevoInstallId()]
    for (const installId of instalaciones) {
      expect((await registrar(u, installId, nuevoToken())).status).toBe(200)
    }

    const borrado = await deleteAccount(
      new Request('http://localhost:3001/api/v1/customer/account', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${u.token}` },
      }),
    )
    expect(borrado.status).toBe(204)
    const { data } = await db.from('push_devices').select('id').eq('user_id', u.id)
    expect(data).toHaveLength(0)

    const { error } = await db.rpc('register_push_device', {
      p_actor_user_id: u.id,
      p_install_id: nuevoInstallId(),
      p_platform: 'ios',
      p_app: 'customer',
      p_token: nuevoToken(),
      p_environment: 'production',
      p_app_version: '1.0.0',
      p_os_version: '18.0',
      p_device_model: 'iPhone',
      p_locale: 'es-PE',
      p_timezone: 'America/Lima',
      p_notifications_enabled: true,
    })
    expect(error?.code).toBe('P0001')
    expect(error?.message).toBe('account_deleted')
  })
})

describe('concurrencia (TST-2)', () => {
  it('dos registros simultáneos del mismo token desde dos instalaciones dejan una sola fila y ningún 500', async () => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    for (let ronda = 0; ronda < 8; ronda++) {
      const token = nuevoToken()
      const instalacionA = nuevoInstallId()
      const instalacionB = nuevoInstallId()
      const [ra, rb] = await Promise.all([
        registrar(a, instalacionA, token),
        registrar(b, instalacionB, token),
      ])
      expect([ra.status, rb.status], `ronda ${ronda}`).toEqual([200, 200])
      const filas = await filasConToken(token)
      expect(filas, `ronda ${ronda}`).toHaveLength(1)
    }
  })

  it('el mismo installId nuevo registrado a la vez por dos usuarios deja una fila y nunca un 500', async () => {
    const a = await crearUsuario()
    const b = await crearUsuario()
    for (let ronda = 0; ronda < 8; ronda++) {
      const installId = nuevoInstallId()
      const [ra, rb] = await Promise.all([
        registrar(a, installId, nuevoToken()),
        registrar(b, installId, nuevoToken()),
      ])
      const estados = [ra.status, rb.status].sort()
      expect(estados, `ronda ${ronda}`).toEqual([200, 409])
      const { data } = await db.from('push_devices').select('user_id').eq('install_id', installId)
      expect(data, `ronda ${ronda}`).toHaveLength(1)
      const ganador = ra.status === 200 ? a.id : b.id
      expect(data?.[0]?.user_id, `ronda ${ronda}`).toBe(ganador)
    }
  })
})

/** 4096 caracteres de base64url de bytes aleatorios: el máximo que admite el contrato y casi incompresible. */
const tokenMaximo = (): string => randomBytes(3072).toString('base64url')

/** Cuántas filas tienen ese token, contadas por su hash (el token de 4096 no cabe en una URL de PostgREST). */
function filasPorHash(token: string): number {
  return Number(
    psql(
      `select count(*) from public.push_devices where token_sha256 = sha256(convert_to('${token}', 'UTF8'));`,
    ),
  )
}

describe('token de 4096 caracteres (CAX-002)', () => {
  it('registro, repetición, rotación y transferencia a otra instalación, sin 500 y sin filtrar el token', async () => {
    const u = await crearUsuario()
    const stdout = vi.spyOn(process.stdout, 'write')
    const stderr = vi.spyOn(process.stderr, 'write')
    try {
      const instalacionA = nuevoInstallId()
      const instalacionB = nuevoInstallId()
      const t1 = tokenMaximo()
      const t2 = tokenMaximo()
      expect(t1).toHaveLength(4096)

      const alta = await registrar(u, instalacionA, t1)
      expect(alta.status).toBe(200)
      expect(alta.raw).not.toContain(t1)
      expect(filasPorHash(t1)).toBe(1)

      const repetida = await registrar(u, instalacionA, t1)
      expect(repetida.status).toBe(200)
      expect(repetida.raw).not.toContain(t1)
      expect(filasPorHash(t1)).toBe(1)

      const rotada = await registrar(u, instalacionA, t2)
      expect(rotada.status).toBe(200)
      expect(filasPorHash(t1)).toBe(0)
      expect(filasPorHash(t2)).toBe(1)
      expect(await fila(instalacionA)).toMatchObject({ token: t2 })

      const transferida = await registrar(u, instalacionB, t2)
      expect(transferida.status).toBe(200)
      expect(transferida.raw).not.toContain(t2)
      expect(await fila(instalacionA)).toBeNull()
      expect(await fila(instalacionB)).toMatchObject({ token: t2 })
      expect(filasPorHash(t2)).toBe(1)

      const escrito = [...stdout.mock.calls, ...stderr.mock.calls]
        .map(([chunk]) => String(chunk))
        .join('')
      expect(escrito).not.toContain(t1)
      expect(escrito).not.toContain(t2)
      expect(escrito).toContain('/api/v1/push/devices/{installId}')
    } finally {
      stdout.mockRestore()
      stderr.mockRestore()
    }
  })

  it('la unicidad es por hash: un mismo token no entra dos veces y token no tiene índice propio', async () => {
    const u = await crearUsuario()
    const token = tokenMaximo()
    expect((await registrar(u, nuevoInstallId(), token)).status).toBe(200)
    const { error } = await db.from('push_devices').insert({
      user_id: u.id,
      install_id: nuevoInstallId(),
      platform: 'ios',
      app: 'customer',
      token,
      app_version: '1.0.0',
      notifications_enabled: true,
    })
    expect(error?.code).toBe('23505')
    expect(error?.message).toContain('token_sha256')
    expect(filasPorHash(token)).toBe(1)

    const out = psql(`
select 'IDX|' || indexdef from pg_indexes where schemaname = 'public' and tablename = 'push_devices' order by indexname;
`)
    const indices = out.split('\n').filter((l) => l.startsWith('IDX|'))
    expect(indices.some((l) => l.includes('(token_sha256)') && l.includes('UNIQUE'))).toBe(true)
    expect(indices.some((l) => l.includes('(token)'))).toBe(false)
  })
})

describe('catálogo: permisos y RLS', () => {
  it('RLS activada, tabla marcada server-only y sin políticas', () => {
    const out = psql(`
select 'RLS|' || c.relrowsecurity::text from pg_class c where c.oid = 'public.push_devices'::regclass;
select 'COMENTARIO|' || obj_description('public.push_devices'::regclass, 'pg_class');
select 'POLITICAS|' || count(*) from pg_policies where schemaname = 'public' and tablename = 'push_devices';
`)
    expect(out).toContain('RLS|true')
    expect(out).toContain('COMENTARIO|server-only')
    expect(out).toContain('POLITICAS|0')
  })

  it('una sola sobrecarga de cada función, DEFINER, con search_path vacío y solo service_role', () => {
    const out = psql(`
select 'FN|' || p.proname || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, '')
  || '|anon=' || has_function_privilege('anon', p.oid, 'execute')::text
  || '|auth=' || has_function_privilege('authenticated', p.oid, 'execute')::text
  || '|service=' || has_function_privilege('service_role', p.oid, 'execute')::text
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('register_push_device', 'unregister_push_device')
order by p.proname;
select 'HASH|' || has_function_privilege('anon', 'public.push_token_hash(text)', 'execute')::text
  || '|' || has_function_privilege('authenticated', 'public.push_token_hash(text)', 'execute')::text
  || '|' || has_function_privilege('service_role', 'public.push_token_hash(text)', 'execute')::text;
select 'TABLA|anon=' || has_table_privilege('anon', 'public.push_devices', 'select')::text
  || '|auth=' || has_table_privilege('authenticated', 'public.push_devices', 'select')::text
  || '|service=' || has_table_privilege('service_role', 'public.push_devices', 'select')::text;
`)
    const fns = out.split(/\r?\n/).filter((l) => l.startsWith('FN|'))
    expect(fns).toEqual([
      'FN|register_push_device|true|{"search_path=\\"\\""}|anon=false|auth=false|service=true',
      'FN|unregister_push_device|true|{"search_path=\\"\\""}|anon=false|auth=false|service=true',
    ])
    expect(out).toContain('TABLA|anon=false|auth=false|service=true')
    expect(out).toContain('HASH|false|false|true')
  })

  it('un usuario autenticado no puede llamar las funciones ni leer la tabla por PostgREST', async () => {
    const u = await crearUsuario()
    const suplantada = await crearUsuario()
    const { error: rpcError } = await u.client.rpc('register_push_device', {
      p_actor_user_id: suplantada.id,
      p_install_id: nuevoInstallId(),
      p_platform: 'ios',
      p_app: 'customer',
      p_token: nuevoToken(),
      p_environment: 'production',
      p_app_version: '1.0.0',
      p_os_version: null,
      p_device_model: null,
      p_locale: null,
      p_timezone: null,
      p_notifications_enabled: true,
    })
    expect(rpcError?.code).toBe('42501')
    const { error: bajaError } = await u.client.rpc('unregister_push_device', {
      p_actor_user_id: suplantada.id,
      p_install_id: nuevoInstallId(),
    })
    expect(bajaError?.code).toBe('42501')
    const { error: lecturaError } = await u.client.from('push_devices').select('id')
    expect(lecturaError?.code).toBe('42501')
  })
})
