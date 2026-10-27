/**
 * Migración 0279: una cuenta nueva solo se crea con Google. Contra la base LOCAL, con el hook
 * «before user created» activo por `supabase/config.toml`.
 *
 *  · Alta pública por correo (`signUp`) y por enlace mágico (`signInWithOtp`): rechazadas, sin
 *    fila en `auth.users`. Si el hook no estuviera conectado, la base local (autoconfirm) las
 *    crearía: estas pruebas lo detectan.
 *  · Alta administrativa (`auth.admin.createUser`, como el personal): sigue funcionando, y esa
 *    cuenta entra con contraseña.
 *  · La función decide por lista de permitidos: solo `provider = 'google'` sin `is_anonymous`.
 *  · Solo `supabase_auth_admin` puede ejecutarla.
 *
 * El alta con Google no se puede ejecutar aquí (no hay proveedor Google en la base local): se
 * prueba la función con la forma del evento que arma GoTrue v2.192.0 (`hooks.go`,
 * `triggerBeforeUserCreatedExternal` → `SignupParams{Provider: providerType}`).
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const URL = 'http://127.0.0.1:54321'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const CLAVE = 'test-password-12345'
const opts = { auth: { persistSession: false, autoRefreshToken: false } }

const creados: string[] = []

// `postgres` no puede hacer SET ROLE supabase_auth_admin; el superusuario local sí.
function psql(sql: string, usuario = 'postgres'): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      usuario,
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim()
}

const correo = (etiqueta: string): string =>
  `alta-google-${etiqueta}-${crypto.randomUUID().slice(0, 8)}@integration.local`

function usuariosConCorreo(email: string): number {
  return Number(psql(`select count(*) from auth.users where email = '${email}';`))
}

/** Lo que devuelve el hook para un evento dado, como lo llama GoTrue (rol supabase_auth_admin). */
function hook(evento: string): string {
  return psql(
    `begin; set local role supabase_auth_admin;
     select auth_hooks.before_user_created($ev$${evento}$ev$::jsonb)::text;
     rollback;`,
    'supabase_admin',
  )
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .join('')
}

afterAll(async () => {
  for (const id of creados) await db.auth.admin.deleteUser(id)
})

describe('0279 · alta pública', () => {
  it('signUp con correo y contraseña se rechaza con 403 y no crea la cuenta', async () => {
    const email = correo('signup')
    const anon = createClient(URL, ANON_KEY, opts)
    const { data, error } = await anon.auth.signUp({ email, password: CLAVE })
    expect(error?.status).toBe(403)
    expect(error?.message).toBe('Las cuentas nuevas de Tindivo se crean con Google.')
    expect(data.user).toBeNull()
    expect(usuariosConCorreo(email)).toBe(0)
  })

  it('el enlace mágico a un correo nuevo tampoco crea la cuenta', async () => {
    const email = correo('otp')
    const anon = createClient(URL, ANON_KEY, opts)
    const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    expect(error?.status).toBe(403)
    expect(usuariosConCorreo(email)).toBe(0)
  })
})

describe('0279 · alta administrativa (personal)', () => {
  it('auth.admin.createUser no pasa por el hook y la cuenta entra con contraseña', async () => {
    const email = correo('admin')
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: CLAVE,
      email_confirm: true,
    })
    expect(error).toBeNull()
    if (data.user) creados.push(data.user.id)
    expect(usuariosConCorreo(email)).toBe(1)

    const anon = createClient(URL, ANON_KEY, opts)
    const { data: s, error: serr } = await anon.auth.signInWithPassword({ email, password: CLAVE })
    expect(serr).toBeNull()
    expect(s.session?.user.id).toBe(data.user?.id)
  })
})

describe('0279 · la función', () => {
  const PERMITIDO = '{}'

  it('deja pasar solo Google sin cuenta anónima', () => {
    expect(hook('{"user": {"app_metadata": {"provider": "google"}, "is_anonymous": false}}')).toBe(
      PERMITIDO,
    )
    expect(hook('{"user": {"app_metadata": {"provider": "google"}}}')).toBe(PERMITIDO)
  })

  it.each([
    ['correo', '{"user": {"app_metadata": {"provider": "email"}}}'],
    ['teléfono', '{"user": {"app_metadata": {"provider": "phone"}}}'],
    ['Google anónimo', '{"user": {"app_metadata": {"provider": "google"}, "is_anonymous": true}}'],
    ['anónimo sin proveedor', '{"user": {"app_metadata": {}, "is_anonymous": true}}'],
    ['proveedor con otra grafía', '{"user": {"app_metadata": {"provider": "Google"}}}'],
    ['proveedor nuevo', '{"user": {"app_metadata": {"provider": "apple"}}}'],
    ['sin app_metadata', '{"user": {}}'],
    ['evento vacío', '{}'],
  ])('rechaza con 403: %s', (_caso, evento) => {
    const r = JSON.parse(hook(evento)) as { error?: { http_code?: number } }
    expect(r.error?.http_code).toBe(403)
  })

  it('solo supabase_auth_admin entra al esquema auth_hooks', () => {
    const fila = psql(
      `select string_agg(r || '=' || has_schema_privilege(r, 'auth_hooks', 'USAGE'), ',' order by r)
         from unnest(array['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) r;`,
    )
    expect(fila).toBe('anon=false,authenticated=false,service_role=false,supabase_auth_admin=true')
  })

  it('solo supabase_auth_admin puede ejecutarla', () => {
    const fila = psql(
      `select string_agg(r || '=' || has_function_privilege(r, 'auth_hooks.before_user_created(jsonb)', 'EXECUTE'), ',' order by r)
         from unnest(array['anon', 'authenticated', 'service_role', 'supabase_auth_admin']) r;`,
    )
    expect(fila).toBe('anon=false,authenticated=false,service_role=false,supabase_auth_admin=true')
  })
})
