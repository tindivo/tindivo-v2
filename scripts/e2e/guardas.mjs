/**
 * Guardas de los escenarios e2e (las prueba `guardas.test.mjs`).
 *
 *  - `assertUploadUrl`: la URL firmada de subida que devuelve la API solo se usa si apunta al MISMO origen que la
 *    Supabase permitida para esta corrida; una respuesta manipulada no puede mandar el comprobante a otro host.
 *  - `fetchSinRedireccion`: nunca sigue una redirección; un 3xx es un error, no un destino nuevo.
 *  - `exigirCandado`: quien escribe en la base local solo corre bajo `pnpm db:lock run` / `db:cycle`
 *    (la señal es la de `scripts/db-lock-guard.mjs`: el token del candado y que su dueño siga vivo).
 */
import { hasValidLock, LOCK_REQUIRED_MESSAGE } from '../db-lock-guard.mjs'

export function assertUploadUrl(uploadUrl, supabaseUrl) {
  let target
  let allowed
  try {
    target = new URL(uploadUrl)
    allowed = new URL(supabaseUrl)
  } catch {
    throw new Error('uploadUrl o la URL de Supabase no son URL válidas')
  }
  if (target.origin !== allowed.origin) {
    throw new Error(
      `uploadUrl apunta a ${target.origin}, que no es la Supabase permitida (${allowed.origin}): no se envía nada`,
    )
  }
}

export async function fetchSinRedireccion(url, init = {}) {
  const res = await fetch(url, { ...init, redirect: 'manual' })
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`HTTP ${res.status}: una redirección no se sigue (${new URL(url).origin})`)
  }
  return res
}

/** Sale con código 2 antes de tocar nada si no hay candado válido. */
export function exigirCandado(opciones) {
  if (!hasValidLock(opciones)) {
    console.error(`\nNO SE EJECUTA: ${LOCK_REQUIRED_MESSAGE}`)
    process.exit(2)
  }
}
