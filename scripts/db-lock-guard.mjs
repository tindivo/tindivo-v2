/**
 * Guardia del candado de la base LOCAL (`scripts/db-lock.mjs`, plan-diario.md §2.3).
 *
 * El candado solo protege si quien lo ignora también se frena. Lanzar vitest de
 * integración a mano, sin `pnpm db:lock run …`, ejecutaba igual el barrido de
 * `globalSetup` y los `afterAll`, y borraba los negocios y usuarios de prueba de
 * OTRA sesión que sí tenía el candado: «invalid response from upstream»,
 * «Pedido no existe», «Motorizado no encontrado» a mitad de una corrida ajena.
 *
 * Quien borra o siembra llama a `assertDbLock()` y aborta si no está dentro de
 * un `db:lock run` / `db:cycle`:
 *
 *  - `db-lock.mjs` escribe un `token` aleatorio en `holder.json` y lo exporta al
 *    hijo en `TINDIVO_DB_LOCK_TOKEN`. Vale si coincide con el del archivo y el
 *    proceso dueño sigue vivo (un candado huérfano no sirve de pase).
 *  - La CI no comparte base: cada job levanta la suya. Allí vale la señal
 *    explícita `CI=true` + `TINDIVO_DB_LOCK_BYPASS=ci-isolated-db`, que pone el
 *    job `api-integration` de `.github/workflows/ci.yml`. Las dos a la vez; una
 *    sola no basta. Nunca la pongas en tu máquina: es mentir sobre la base.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LOCK_DIR = join(homedir(), '.tindivo', 'db-local-54322.lock')
export const INFO = join(LOCK_DIR, 'holder.json')
export const TOKEN_ENV = 'TINDIVO_DB_LOCK_TOKEN'
export const CI_BYPASS_ENV = 'TINDIVO_DB_LOCK_BYPASS'
export const CI_BYPASS_VALUE = 'ci-isolated-db'

export const LOCK_REQUIRED_MESSAGE =
  'La base local es compartida: corre esto con `pnpm db:lock run -- "<comando>"` o `pnpm db:cycle`. ' +
  'Sin el candado, el barrido de restos de test borra los datos de otra sesión. ' +
  'Detalle: supabase/AGENTS.md (Base local y tests).'

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: existe pero es de otro usuario. Vivo, a efectos del candado.
    return error.code === 'EPERM'
  }
}

export function readHolder(infoPath = INFO) {
  try {
    return JSON.parse(readFileSync(infoPath, 'utf8'))
  } catch {
    return null
  }
}

export function hasValidLock({ env = process.env, infoPath = INFO } = {}) {
  if (env.CI === 'true' && env[CI_BYPASS_ENV] === CI_BYPASS_VALUE) return true
  const token = env[TOKEN_ENV]
  if (!token) return false
  const holder = readHolder(infoPath)
  return Boolean(holder?.token) && holder.token === token && isAlive(holder.pid)
}

export function assertDbLock(options) {
  if (!hasValidLock(options)) throw new Error(LOCK_REQUIRED_MESSAGE)
}
