/**
 * Guardia y datos puros de `seed-staging.ts` (sin red, sin base: se prueban con vitest).
 *
 * Staging es `tindivo-dev` (`jgziumvrtogguljhpdos`). Producción es `tindivo-prod`
 * (`zpnipajgwfthxhdtzhly`). Este módulo existe para que un env-file equivocado aborte
 * ANTES de la primera petición.
 */
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const STAGING_REF = 'jgziumvrtogguljhpdos'
export const STAGING_HOST = `${STAGING_REF}.supabase.co`
export const PROD_REF = 'zpnipajgwfthxhdtzhly'

/** Único origen aceptado (sin barra final). `seed-staging.ts` usa ESTA constante, no el env-file. */
export const STAGING_ORIGIN = `https://${STAGING_HOST}`

/**
 * SHA-256 (hex) del texto UTF-8 de la service role de staging. La clave es de alta entropía, así
 * que publicar su huella es aceptable. SI SE ROTA la service role de staging: calcula la huella
 * nueva (`printf %s "$CLAVE" | sha256sum`) y actualiza esta constante en un commit revisado.
 */
export const STAGING_SERVICE_KEY_SHA256 =
  '2a9eff0be293dc03ee01da8d4e8cfc135526df01e3341bdec9dbdfaeace581b1'

/**
 * Aborta (lanza) salvo que `url` sea EXACTAMENTE el origen de staging (tras quitar una barra
 * final) y que la huella SHA-256 de `serviceKey` sea la registrada. Nunca incluye la clave en el
 * mensaje de error (como mucho, 8 caracteres de la huella calculada).
 */
export function assertStagingTarget(
  url: string,
  serviceKey: string,
  expectedKeySha256: string = STAGING_SERVICE_KEY_SHA256,
): void {
  if (url.includes(PROD_REF) || serviceKey.includes(PROD_REF)) {
    throw new Error(
      `ABORTADO: la URL o la clave apuntan a PRODUCCIÓN (${PROD_REF}). Este script solo siembra staging.`,
    )
  }
  const normalized = url.endsWith('/') ? url.slice(0, -1) : url
  if (normalized !== STAGING_ORIGIN) {
    throw new Error(
      `ABORTADO: SUPABASE_URL debe ser exactamente ${STAGING_ORIGIN} (sin puerto, credenciales, ruta, consulta ni fragmento).`,
    )
  }
  const sha = createHash('sha256').update(serviceKey, 'utf8').digest('hex')
  if (sha !== expectedKeySha256) {
    throw new Error(
      `ABORTADO: SUPABASE_SERVICE_ROLE_KEY no es la service role registrada de staging (huella ${sha.slice(0, 8)}…). Si se rotó, actualiza STAGING_SERVICE_KEY_SHA256 en staging-target.ts.`,
    )
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
  const outside = isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)
  if (!outside) {
    throw new Error(`ABORTADO: --out-dir (${out}) está dentro del repo (${resolve(repoRoot)}).`)
  }
  let dir = out
  for (;;) {
    if (hasGit(dir)) {
      throw new Error(`ABORTADO: --out-dir (${out}) está dentro de un repo git (${dir}).`)
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
