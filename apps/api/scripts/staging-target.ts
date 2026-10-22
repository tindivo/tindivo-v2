/**
 * Guardia y datos puros de `seed-staging.ts` (sin red, sin base: se prueban con vitest).
 *
 * Staging es `tindivo-dev` (`jgziumvrtogguljhpdos`). Producción es `tindivo-prod`
 * (`zpnipajgwfthxhdtzhly`). Este módulo existe para que un env-file equivocado aborte
 * ANTES de la primera petición.
 */
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export const STAGING_REF = 'jgziumvrtogguljhpdos'
export const STAGING_HOST = `${STAGING_REF}.supabase.co`
export const PROD_REF = 'zpnipajgwfthxhdtzhly'

/** Decodifica el payload de un JWT SIN verificar la firma. Lanza si no es un JSON válido. */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  const payload = parts[1]
  if (parts.length !== 3 || !payload) throw new Error('JWT mal formado')
  const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('payload de JWT no es un objeto')
  }
  return parsed as Record<string, unknown>
}

/**
 * Aborta (lanza) salvo que `url` sea exactamente el staging por https y `serviceKey` sea la
 * service role de ESE proyecto. Nunca incluye la clave en el mensaje de error.
 */
export function assertStagingTarget(url: string, serviceKey: string): void {
  if (url.includes(PROD_REF) || serviceKey.includes(PROD_REF)) {
    throw new Error(
      `ABORTADO: la URL o la clave apuntan a PRODUCCIÓN (${PROD_REF}). Este script solo siembra staging.`,
    )
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('ABORTADO: SUPABASE_URL no es una URL válida.')
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== STAGING_HOST) {
    throw new Error(
      `ABORTADO: SUPABASE_URL debe ser exactamente https://${STAGING_HOST} (recibido host "${parsed.hostname}", protocolo "${parsed.protocol}").`,
    )
  }
  if (serviceKey.startsWith('sb_secret_')) return // sin ref dentro: vale la comprobación de URL
  if (serviceKey.split('.').length !== 3) {
    throw new Error('ABORTADO: SUPABASE_SERVICE_ROLE_KEY no tiene una forma reconocida.')
  }
  let payload: Record<string, unknown>
  try {
    payload = decodeJwtPayload(serviceKey)
  } catch {
    throw new Error('ABORTADO: no se pudo decodificar SUPABASE_SERVICE_ROLE_KEY.')
  }
  if (payload.ref === PROD_REF) {
    throw new Error(`ABORTADO: la clave es de PRODUCCIÓN (${PROD_REF}). Este script solo siembra staging.`)
  }
  if (payload.ref !== STAGING_REF) {
    throw new Error(`ABORTADO: la clave no es del proyecto de staging (${STAGING_REF}).`)
  }
  if (payload.role !== 'service_role') {
    throw new Error('ABORTADO: la clave no tiene el rol service_role.')
  }
}

/**
 * Aborta si `outPath` quedaría dentro de `repoRoot` o de cualquier carpeta que contenga
 * `.git` (`hasGit(dir)` lo decide el llamador). Las contraseñas no pueden acabar versionadas.
 */
export function assertOutsideRepo(
  outPath: string,
  repoRoot: string,
  hasGit: (dir: string) => boolean,
): void {
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const out = resolve(outPath)
  const rel = relative(norm(resolve(repoRoot)), norm(out))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`ABORTADO: --out (${out}) está dentro del repo (${resolve(repoRoot)}).`)
  }
  let dir = dirname(out)
  for (;;) {
    if (hasGit(dir)) {
      throw new Error(`ABORTADO: --out (${out}) está dentro de un repo git (${dir}).`)
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
}

/**
 * Ajustes que `seed-staging.ts` escribe. DEFINIDA a mano y distinta de `LOCAL_ONLY_SETTINGS`:
 * `push_dispatch` en staging está anulado a propósito y no se toca jamás.
 */
export function stagingSettings(nowIso: string): { key: string; value: unknown }[] {
  const settings = [
    {
      key: 'platform_schedule',
      value: {
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        startHHMM: '00:00',
        endHHMM: '23:59',
      },
    },
    { key: 'order_intake_cutoff', value: '23:59' },
    { key: 'push_claim_since', value: nowIso },
  ]
  if (settings.some((s) => s.key === 'push_dispatch')) {
    throw new Error('ABORTADO: la lista de ajustes de staging no puede incluir push_dispatch.')
  }
  return settings
}
