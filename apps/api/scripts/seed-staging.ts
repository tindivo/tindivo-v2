/**
 * Seed del MUNDO en STAGING (`tindivo-dev`, ref `jgziumvrtogguljhpdos`).
 *
 * Siembra lo mismo que `seed-e2e.ts` en local (negocios con menú y horario, motorizados,
 * clientes con dirección; sin pedidos y SIN cuenta de admin) usando el cuerpo compartido
 * `seed-world.ts`. Idempotente: ids fijos + upsert.
 *
 * Uso:
 *   node apps/api/scripts/seed-staging.ts --env-file <ruta> --out <ruta>
 *   pnpm db:seed:staging -- --env-file <ruta> --out <ruta>
 *
 * - `--env-file`: archivo `CLAVE=valor` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de
 *   staging. Vive FUERA del repo, p. ej. `D:\Tinkuy Creativo\Proyectos\Tindivo\secretos\staging.env`.
 *   Nunca se imprime ni se registra.
 * - `--out`: dónde se escriben las credenciales (email, rol, contraseña) en una tabla Markdown.
 *   También FUERA del repo: aborta si la ruta cae dentro del worktree o de cualquier carpeta con `.git`.
 *
 * GUARDIA (`staging-target.ts`, antes de cualquier petición): el host tiene que ser exactamente
 * `jgziumvrtogguljhpdos.supabase.co` por https; si la URL o la clave mencionan producción
 * (`zpnipajgwfthxhdtzhly`), aborta; una clave JWT debe decir `ref` de staging y `role=service_role`.
 *
 * Contraseñas: aleatorias y NUEVAS en cada corrida (también para usuarios que ya existen). Por
 * consola solo salen emails y conteos. `push_dispatch` NO se toca (en staging está anulado).
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { E2E } from './e2e-fixtures.ts'
import { seedWorld } from './seed-world.ts'
import { assertOutsideRepo, assertStagingTarget, stagingSettings } from './staging-target.ts'

function arg(name: string): string {
  const i = process.argv.indexOf(name)
  const v = i >= 0 ? process.argv[i + 1] : undefined
  if (!v || v.startsWith('--')) throw new Error(`Falta ${name} <ruta>`)
  return v
}

/** Lee `CLAVE=valor` (tolera CRLF, comillas, comentarios `#` y `export `). */
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!m?.[1]) continue
    let v = (m[2] ?? '').trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

/** Rol que se muestra en la tabla de credenciales, por id de usuario. */
const ROLE_BY_ID = new Map<string, string>([
  [E2E.BUSINESS_USER_ID, 'business'],
  [E2E.BUSINESS_2_USER_ID, 'business'],
  [E2E.DRIVER_USER_ID, 'driver'],
  [E2E.DRIVER_2_USER_ID, 'driver'],
  ...E2E.CUSTOMERS.map((c) => [c.userId, 'customer'] as [string, string]),
])

async function main(): Promise<void> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const envFile = arg('--env-file')
  const outPath = resolve(arg('--out'))

  const env = readEnvFile(envFile)
  const url = env.SUPABASE_URL ?? ''
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !serviceKey) {
    throw new Error('El env-file debe traer SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  }
  assertStagingTarget(url, serviceKey)

  // Se comprueba la ruta tal cual y con enlaces simbólicos resueltos (tramo existente).
  const hasGit = (d: string) => existsSync(join(d, '.git'))
  assertOutsideRepo(outPath, repoRoot, hasGit)
  let existing = dirname(outPath)
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing)
  assertOutsideRepo(
    join(realpathSync(existing), outPath.slice(existing.length)),
    realpathSync(repoRoot),
    hasGit,
  )

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
  const raw = db as any

  console.log('\nSeed staging — mundo (idempotente, IDs fijos, contraseñas nuevas)\n')

  // ── app_settings ───────────────────────────────────────────────────────────
  console.log('app_settings')
  const settings = stagingSettings(new Date().toISOString())
  const { error: setErr } = await raw.from('app_settings').upsert(settings, { onConflict: 'key' })
  if (setErr) throw new Error(`upsert app_settings falló: ${setErr.message}`)
  console.log(`  ✓ app_settings                ${settings.map((s) => s.key).join(', ')}`)

  const { data: courier, error: courierErr } = await raw
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  if (courierErr) throw new Error(`leer app_settings.courier falló: ${courierErr.message}`)
  const { error: courierUpdErr } = await raw
    .from('app_settings')
    .update({ value: { ...courier.value, ignoreSchedule: true } })
    .eq('key', 'courier')
  if (courierUpdErr) throw new Error(`abrir Entregas a toda hora falló: ${courierUpdErr.message}`)
  console.log('  ✓ courier.ignoreSchedule      true')

  // ── usuarios con contraseña al azar ────────────────────────────────────────
  const credentials: { email: string; role: string; password: string }[] = []

  async function ensureAuthUser(id: string, email: string, fullName: string): Promise<void> {
    const password = randomBytes(18).toString('base64url')
    const { data } = await db.auth.admin.getUserById(id)
    if (data?.user) {
      const { error } = await db.auth.admin.updateUserById(id, { password })
      if (error) throw new Error(`actualizar contraseña de ${email} falló: ${error.message}`)
      console.log(`  ✓ auth.users                  ${email} (ya existía, contraseña nueva)`)
    } else {
      const { error } = await db.auth.admin.createUser({
        id,
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
      if (error) throw new Error(`crear auth user ${email} falló: ${error.message}`)
      console.log(`  ✓ auth.users                  ${email} (creado)`)
    }
    credentials.push({ email, role: ROLE_BY_ID.get(id) ?? 'desconocido', password })
  }

  console.log('\nusuarios')
  await seedWorld(db, ensureAuthUser, { includeAdmin: false })

  // ── credenciales (solo al archivo --out) ───────────────────────────────────
  const lines = [
    '# Credenciales de staging (tindivo-dev)',
    '',
    `Generadas: ${new Date().toISOString()}. Cambian en cada corrida. No versionar.`,
    '',
    '| Email | Rol | Contraseña |',
    '|---|---|---|',
    ...credentials.map((c) => `| ${c.email} | ${c.role} | ${c.password} |`),
    '',
  ]
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 })

  console.log(`\nMundo de staging listo: ${credentials.length} usuarios. Credenciales en --out.\n`)
}

main().catch((err) => {
  console.error('\nSeed staging FALLÓ:', err instanceof Error ? err.message : err)
  process.exit(1)
})
