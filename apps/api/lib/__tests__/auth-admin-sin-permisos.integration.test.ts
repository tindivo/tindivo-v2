/**
 * Migración 0271: `supabase_auth_admin` (el rol de GoTrue) no tiene permisos en `public`.
 *
 * Contra la base LOCAL, por `docker exec psql` para el catálogo y por GoTrue para el alta.
 * Lo que escribe en el catálogo corre en transacciones que se revierten.
 *
 *   1 · CATÁLOGO. Ni USAGE del esquema, ni privilegios en tablas o secuencias, ni EXECUTE en
 *       funciones de `public` para `supabase_auth_admin`.
 *   2 · ALTA SIN ESOS PERMISOS. Un usuario creado por GoTrue (que corre como
 *       `supabase_auth_admin`) obtiene su fila en `public.users` y su rol por el trigger
 *       `on_auth_user_created` → `handle_new_user`, que es SECURITY DEFINER.
 *   3 · COMO EN PROD. Con los permisos heredados que tiene prod (el rollback de la 0271 los
 *       restaura), la 0271 los quita todos; y el rollback aplica limpio y devuelve exactamente
 *       la lista medida (esquema, 37 tablas, 1 secuencia, 59 funciones).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { localClient } from './helpers/local-db'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'

/** SQL por stdin (los acentos no se corrompen); corta al primer error. */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGCLIENTENCODING=UTF8',
      CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
}

function repoFile(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${relative}`, import.meta.url)), 'utf8')
}

const MIGRATION = repoFile(
  'supabase/migrations/0271_supabase_auth_admin_pierde_los_permisos_heredados.sql',
)
const ROLLBACK = repoFile(
  'supabase/rollbacks/0271_supabase_auth_admin_pierde_los_permisos_heredados.rollback.sql',
)

/** Cuenta lo que tiene `supabase_auth_admin` en `public`: esquema|relaciones|funciones. */
const COUNT_GRANTS = `
select has_schema_privilege('supabase_auth_admin', 'public', 'usage')::text
  || '|' || (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
             and exists (select 1 from aclexplode(c.relacl) a where a.grantee = 'supabase_auth_admin'::regrole))
  || '|' || (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
             and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 'supabase_auth_admin'::regrole));
`

describe('0271 · supabase_auth_admin sin permisos en public', () => {
  it('el catálogo no le da USAGE del esquema ni privilegios en relaciones o funciones', () => {
    expect(psql(COUNT_GRANTS).trim()).toBe('false|0|0')
  })

  const creados: string[] = []
  afterAll(async () => {
    for (const id of creados) await localClient.auth.admin.deleteUser(id)
  })

  it('un alta por GoTrue crea su fila en public.users y su rol, sin esos permisos', async () => {
    const email = `auth-admin-0271-${crypto.randomUUID()}@test.tindivo.invalid`
    const { data, error } = await localClient.auth.admin.createUser({
      email,
      password: `Pw-${crypto.randomUUID()}`,
      email_confirm: true,
      user_metadata: { full_name: 'Prueba 0271' },
    })
    expect(error).toBeNull()
    const userId = data.user?.id
    expect(userId).toBeTruthy()
    if (!userId) return
    creados.push(userId)

    const fila = psql(
      `select u.email || '|' || u.primary_role || '|' || coalesce(string_agg(r.role::text, ','), '')
         from public.users u left join public.user_roles r on r.user_id = u.id
        where u.id = '${userId}' group by u.email, u.primary_role;`,
    ).trim()
    expect(fila).toBe(`${email}|customer|customer`)
  })

  it('con los permisos heredados de prod, la 0271 los quita todos y el rollback los devuelve exactos', () => {
    const salida = psql(`
      begin;
      ${ROLLBACK}
      ${COUNT_GRANTS}
      ${MIGRATION}
      ${COUNT_GRANTS}
      ${MIGRATION}
      ${COUNT_GRANTS}
      rollback;
    `)
    const cuentas = salida
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^(true|false)\|\d+\|\d+$/.test(l))
    // Con el rollback aplicado: el esquema, 37 tablas + order_number_seq y 59 funciones.
    expect(cuentas[0]).toBe('true|38|59')
    // La 0271 los quita todos; aplicada otra vez (idempotente), sigue igual.
    expect(cuentas[1]).toBe('false|0|0')
    expect(cuentas[2]).toBe('false|0|0')
    // Todo se revirtió: la base local sigue sin esos permisos.
    expect(psql(COUNT_GRANTS).trim()).toBe('false|0|0')
  })
})
