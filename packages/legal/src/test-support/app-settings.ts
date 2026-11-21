import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url))

/**
 * Valor vigente de `app_settings.<key>` según las migraciones: la última que lo siembra
 * (`('key', 'json'::jsonb`) o lo actualiza (`update app_settings set value = 'json' where key = 'key'`).
 */
export function latestAppSetting(key: string, dir: string = MIGRATIONS): unknown {
  const insert = new RegExp(`\\(\\s*'${key}'\\s*,\\s*'([^']*)'::jsonb`, 'g')
  const update = new RegExp(
    `update\\s+(?:public\\.)?app_settings\\s+set\\s+value\\s*=\\s*'([^']*)'(?:::jsonb)?[^;]*?where\\s+key\\s*=\\s*'${key}'`,
    'gi',
  )
  let latest: string | undefined
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
    const hits = [...sql.matchAll(insert), ...sql.matchAll(update)].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    )
    const last = hits.at(-1)
    if (last?.[1] !== undefined) latest = last[1]
  }
  if (latest === undefined) throw new Error(`Ninguna migración escribe app_settings.${key}`)
  return JSON.parse(latest)
}
