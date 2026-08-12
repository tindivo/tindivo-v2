/**
 * Seed del directorio de direcciones — SOLO DB LOCAL.
 *
 * POR QUÉ HACE FALTA
 *   `address_directory` es el activo que hace posible el autocompletado de la
 *   cajera, y en local está VACÍA: el ETL de la 0122 corrió contra prod, no
 *   contra local, y `pnpm db:seed:e2e` no la toca. Sin este seed, la UI del
 *   autocompletado solo se puede ver en su estado "cliente nuevo", que es
 *   justo el camino que no hay que diseñar con cuidado.
 *
 *   Además `supabase db reset` borra el mundo y no lo repone (CLAUDE.md
 *   §Supabase), así que esto tiene que ser re-ejecutable, no un paste manual.
 *
 * DE DÓNDE SALEN LOS DATOS
 *   De `fixtures/address-directory.json`, que genera
 *   `anonymize-address-directory.ts` a partir de un dump de prod. El fixture
 *   conserva la FORMA del directorio real (agrupamiento por teléfono, cobertura
 *   de GPS, referencias largas) y sustituye la identidad. No hay PII en git.
 *
 * IDEMPOTENTE: borra las filas del fixture (prefijo `ad000000-`) y las vuelve a
 * insertar. Correrlo N veces deja el mismo estado. NO toca ninguna fila que no
 * lleve ese prefijo, así que una dirección capturada a mano probando la app
 * sobrevive al reseed.
 *
 * GUARD ANTI-PRODUCCIÓN: se hereda de `local-db.ts`, que evalúa `assertLocalOnly`
 * al importarse y aborta si la URL no es 127.0.0.1/localhost.
 *
 * Uso:  pnpm db:seed:addresses
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'

/**
 * Rango de UUID que marca una fila como "del fixture". Ver el bloque IDEMPOTENTE.
 *
 * Es un RANGO y no un `like` sobre el prefijo porque `id` es `uuid` y Postgres
 * no tiene operador `~~` para ese tipo. Los uuid sí se comparan por orden, así
 * que el rango expresa exactamente lo mismo.
 *
 * Y es un rango y no la lista de ids del fixture porque el borrado tiene que
 * alcanzar también a las filas de un fixture ANTERIOR más grande; con `.in()`
 * sobrevivirían como huérfanas.
 */
const FIXTURE_ID_LOW = 'ad000000-0000-4000-8000-000000000000'
const FIXTURE_ID_HIGH = 'ad000000-0000-4000-8000-ffffffffffff'

interface FixtureRow {
  id: string
  phone: string
  customer_name: string | null
  reference: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  source: 'backfill' | 'driver_verified' | 'admin_curated'
  is_default: boolean
  times_used: number
  last_used_days_ago: number | null
  created_days_ago: number
  from_legacy: boolean
}

// `database.types.ts` no conoce `address_directory` todavía (se regenera con
// `pnpm db:types`, que apunta al remoto). El seed opera sobre datos crudos.
// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const raw = db as any

/** Días atrás → ISO absoluto. Las fechas del fixture son relativas a propósito:
 *  así "hace 3 semanas" sigue diciendo eso dentro de seis meses. */
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  const fixturePath = join(here, 'fixtures', 'address-directory.json')

  let fixture: FixtureRow[]
  try {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'))
  } catch {
    console.error(`\n🚨 No se encontró el fixture: ${fixturePath}\n`)
    console.error('   Generalo con un dump de prod:')
    console.error('   node apps/api/scripts/anonymize-address-directory.ts <dump.json>\n')
    process.exit(1)
  }

  console.log(`\nSembrando directorio de direcciones (${fixture.length} filas)…\n`)

  // ── 1 · Borrar lo sembrado antes ───────────────────────────────────────────
  // Con `like` sobre el prefijo, no con un `delete()` a secas: hay que poder
  // reseedear sin llevarse por delante las direcciones que alguien capturó a
  // mano probando el flujo del motorizado.
  //
  // OJO: la 0122 no tiene policy de DELETE ("nadie borra direcciones"). Esto
  // funciona porque el cliente es service_role y salta RLS — es legítimo en un
  // seeder local, y es exactamente por lo que este script no puede apuntar a
  // otra cosa que 127.0.0.1.
  const { error: delErr } = await raw
    .from('address_directory')
    .delete()
    .gte('id', FIXTURE_ID_LOW)
    .lte('id', FIXTURE_ID_HIGH)
  if (delErr) throw new Error(`limpieza previa falló: ${delErr.message}`)

  // ── 2 · Expandir el fixture a filas de la tabla ────────────────────────────
  const rows = fixture.map((row, index) => ({
    id: row.id,
    phone: row.phone,
    customer_name: row.customer_name,
    reference: row.reference,
    lat: row.lat,
    lng: row.lng,
    accuracy_m: row.accuracy_m,
    source: row.source,
    is_default: row.is_default,
    times_used: row.times_used,
    last_used_at: row.last_used_days_ago === null ? null : isoDaysAgo(row.last_used_days_ago),
    created_at: isoDaysAgo(row.created_days_ago),
    // `updated_by` queda NULL: apunta a `public.users`, y los usuarios que
    // curaron estas filas en prod no existen en local. La columna es nullable.
    updated_by: null,
    // El CHECK `address_directory_import_paired` exige que `imported_at` y
    // `legacy_address_id` vayan juntos o falten los dos. `legacy_created_at`
    // queda libre a propósito (ver el comentario de la 0122).
    legacy_address_id: row.from_legacy
      ? `1e6ac000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      : null,
    imported_at: row.from_legacy ? isoDaysAgo(row.created_days_ago) : null,
    legacy_created_at: row.from_legacy ? isoDaysAgo(row.created_days_ago) : null,
  }))

  // ── 3 · Insertar por lotes ─────────────────────────────────────────────────
  // En lotes y no de golpe para que, si un CHECK rechaza una fila, el error
  // acote dónde está en vez de señalar un insert de 658.
  const BATCH = 200
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await raw.from('address_directory').insert(batch)
    if (error) {
      throw new Error(`insert de address_directory falló en el lote ${i}-${i + batch.length}: ${error.message}`)
    }
    inserted += batch.length
    console.log(`  ✓ ${String(inserted).padStart(4)} / ${rows.length}`)
  }

  // ── 4 · Verificar contra la propia DB ──────────────────────────────────────
  // No contra el array en memoria: lo que importa es lo que quedó en la tabla.
  const { data: check, error: checkErr } = await raw
    .from('address_directory')
    .select('phone, lat')
    .gte('id', FIXTURE_ID_LOW)
    .lte('id', FIXTURE_ID_HIGH)
  if (checkErr) throw new Error(`verificación falló: ${checkErr.message}`)

  const phones = new Map<string, number>()
  for (const r of check) phones.set(r.phone, (phones.get(r.phone) ?? 0) + 1)
  const multi = [...phones.values()].filter((n) => n > 1).length
  const withGps = check.filter((r: { lat: number | null }) => r.lat !== null).length

  console.log(`\n  filas             ${check.length}`)
  console.log(`  teléfonos únicos  ${phones.size}`)
  console.log(`  con >1 dirección  ${multi}`)
  console.log(`  con GPS           ${withGps}`)

  // Teléfonos de ejemplo para probar cada camino de la UI a mano. Sin esto hay
  // que ir a buscarlos a la DB cada vez que se abre el formulario.
  const oneAddress = [...phones.entries()].find(([, n]) => n === 1)?.[0]
  const manyAddresses = [...phones.entries()].find(([, n]) => n > 1)?.[0]
  console.log('\n  Para probar el formulario de la cajera:')
  if (oneAddress) console.log(`    una dirección      ${oneAddress}`)
  if (manyAddresses) console.log(`    varias direcciones ${manyAddresses}`)
  console.log('    cliente nuevo      900000000\n')
}

main().catch((err) => {
  console.error(`\n🚨 ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
