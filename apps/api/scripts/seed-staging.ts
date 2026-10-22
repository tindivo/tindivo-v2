/**
 * Seed del MUNDO en STAGING (`tindivo-dev`, ref `jgziumvrtogguljhpdos`).
 *
 * Siembra lo mismo que `seed-e2e.ts` en local (negocios con menú y horario, motorizados,
 * clientes con dirección; sin pedidos y SIN cuenta de admin) usando el cuerpo compartido
 * `seed-world.ts`. Idempotente: ids fijos + upsert.
 *
 * Uso:
 *   node apps/api/scripts/seed-staging.ts --env-file <ruta> --out-dir <carpeta>
 *   pnpm db:seed:staging -- --env-file <ruta> --out-dir <carpeta>
 *
 * - `--env-file`: archivo `CLAVE=valor` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` de
 *   staging. Vive FUERA del repo, p. ej. `D:\Tinkuy Creativo\Proyectos\Tindivo\secretos\staging.env`.
 *   Nunca se imprime ni se registra.
 * - `--out-dir`: carpeta YA existente donde se crea `staging-credenciales-<fecha>/cuentas.md` (email, rol,
 *   contraseña). FUERA del repo: aborta si cae dentro del worktree o de cualquier carpeta con `.git`.
 *   Debe ser una FRONTERA PRIVADA: ni ella ni ninguna carpeta superior puede dejar a otras cuentas
 *   renombrar o borrar entradas (si no, aborta antes de crear nada). Usa una carpeta dentro de tu
 *   perfil, p. ej. `C:/Users/<usuario>/tindivo-secretos`.
 *   La carpeta nace privada (ACL en Windows, 700 en otro SO) y el archivo se crea exclusivo
 *   dentro de ella; nada se borra por ruta. Cada contraseña se guarda en disco ANTES de activarse.
 *
 * GUARDIA (`staging-target.ts`, antes de cualquier petición): `SUPABASE_URL` debe ser exactamente
 * `https://jgziumvrtogguljhpdos.supabase.co` y la SHA-256 de la service role debe ser la registrada
 * (`STAGING_SERVICE_KEY_SHA256`; si se rota la clave, actualiza esa constante). Si la URL o la clave
 * mencionan producción (`zpnipajgwfthxhdtzhly`), aborta. El cliente se crea con `STAGING_ORIGIN`,
 * nunca con el valor del env-file.
 *
 * Contraseñas: aleatorias y NUEVAS en cada corrida (también para usuarios que ya existen). Por
 * consola solo salen emails y conteos. `push_dispatch` NO se toca (en staging está anulado).
 */
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { E2E } from './e2e-fixtures.ts'
import { seedWorld } from './seed-world.ts'
import {
  openPrivateAccountsFile,
  recordThenActivate,
  redactSecrets,
  securePrivateDir,
} from './staging-accounts-file.ts'
import {
  assertOutsideRepo,
  assertStagingTarget,
  STAGING_ORIGIN,
  stagingSettings,
} from './staging-target.ts'

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

/** Secretos de esta corrida: se enmascaran en cualquier mensaje de error. */
const secretsInRun: string[] = []

async function main(): Promise<void> {
  const envFile = arg('--env-file')
  const outDirArg = arg('--out-dir')

  const env = readEnvFile(envFile)
  const url = env.SUPABASE_URL ?? ''
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  secretsInRun.push(serviceKey)
  if (!url || !serviceKey) {
    throw new Error('El env-file debe traer SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
  }
  assertStagingTarget(url, serviceKey)

  // La carpeta debe existir; se comprueba con enlaces simbólicos resueltos (raíz del repo incluida).
  const outDir = realpathSync(resolve(outDirArg))
  const repoRoot = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'))
  assertOutsideRepo(outDir, repoRoot, (d) => existsSync(join(d, '.git')))

  // Sin archivo privado no hay siembra: aborta antes de la primera petición.
  const accountsFile = openPrivateAccountsFile(outDir, new Date().toISOString(), securePrivateDir)
  try {
    await seed(serviceKey, accountsFile)
  } finally {
    closeSync(accountsFile.fd)
  }
}

async function seed(serviceKey: string, accountsFile: { path: string; fd: number }): Promise<void> {
  const db = createClient(STAGING_ORIGIN, serviceKey, {
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
  let count = 0

  async function ensureAuthUser(id: string, email: string, fullName: string): Promise<void> {
    const password = randomBytes(18).toString('base64url')
    secretsInRun.push(password)
    const role = ROLE_BY_ID.get(id) ?? 'desconocido'
    const { data } = await db.auth.admin.getUserById(id)
    await recordThenActivate(accountsFile.fd, { email, role, password }, async () => {
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
    })
    count++
  }

  console.log('\nusuarios')
  await seedWorld(db, ensureAuthUser, { includeAdmin: false })

  console.log(`\nMundo de staging listo: ${count} usuarios. Contraseñas en ${accountsFile.path}\n`)
}

main().catch((err) => {
  console.error(
    '\nSeed staging FALLÓ:',
    redactSecrets(err instanceof Error ? err.message : String(err), secretsInRun),
  )
  process.exit(1)
})
