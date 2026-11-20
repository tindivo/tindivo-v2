import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadLegalDocument } from './loader'

const MIGRATIONS = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url))

/** Última migración que escribe `app_settings.terms_version`: la que manda en la base. */
function termsVersionInDatabase(): string {
  const pattern = /\(\s*'terms_version'\s*,\s*'"([^"]+)"'::jsonb/g
  let version: string | undefined
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const match of readFileSync(join(MIGRATIONS, file), 'utf8').matchAll(pattern)) {
      version = match[1]
    }
  }
  if (!version) throw new Error('Ninguna migración siembra app_settings.terms_version')
  return version
}

describe('versión de los Términos', () => {
  it('coincide con app_settings.terms_version: la app no pide reaceptar una versión que la web no publica', () => {
    expect(loadLegalDocument('terminos').version).toBe(termsVersionInDatabase())
  })
})
