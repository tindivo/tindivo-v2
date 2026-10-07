/**
 * Seed de los lugares del pueblo (`map_landmarks`) — SOLO DB LOCAL.
 *
 * POR QUÉ HACE FALTA
 *   Son las chapas del mapa (boticas, restaurantes, plaza, colegios…) y lo que
 *   encuentra la lupa de Entregas. En producción los carga Jesús a mano desde
 *   el admin (`/mapa-referencias`); en local la tabla quedaba vacía, y el mapa
 *   y la búsqueda no se podían probar como los ve el cliente.
 *
 * DE DÓNDE SALE: `fixtures/map-landmarks.json` es una copia de los 60 lugares
 *   ACTIVOS de `tindivo-prod` (7-oct-2026, solo lectura). Con sus MISMOS `id`:
 *   un enlace de tienda (`/entregas?lugar=<id>`) apunta al mismo lugar en
 *   local y en producción. Para refrescarlo, volver a exportar de prod.
 *
 * IDEMPOTENTE: upsert por `id`. No borra los lugares que se hayan creado a
 * mano en local. Va aparte de `seed-e2e.ts` a propósito: el mundo e2e no
 * depende de estos 60 lugares y sus pruebas no deben empezar a hacerlo.
 *
 * GUARD ANTI-PRODUCCIÓN heredado de `local-db.ts`.
 *
 * Uso:  pnpm db:seed:lugares
 */
import { readFileSync } from 'node:fs'
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'

interface LandmarkFixture {
  id: string
  name: string
  category: string
  lat: number
  lng: number
}

const rows = JSON.parse(
  readFileSync(new URL('./fixtures/map-landmarks.json', import.meta.url), 'utf8'),
) as LandmarkFixture[]

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts no conoce todas las tablas
const { error } = await (db as any)
  .from('map_landmarks')
  .upsert(
    rows.map((r) => ({ ...r, active: true })),
    { onConflict: 'id' },
  )
if (error) throw new Error(`upsert map_landmarks falló: ${error.message}`)

const byCategory = new Map<string, number>()
for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1)
console.log(`  ✓ map_landmarks ${rows.length} lugar(es)`)
for (const [c, n] of [...byCategory].sort((a, b) => b[1] - a[1])) console.log(`      ${c.padEnd(12)} ${n}`)
