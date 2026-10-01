/**
 * Seed del directorio de Tindivo Entregas (`directory_businesses`) — SOLO DB LOCAL.
 *
 * POR QUÉ HACE FALTA
 *   No hay panel de alta del directorio todavía (fase de motorizado/admin, ver
 *   Docs/Encargos). Sin datos, las pantallas de directorio y "Tu ruta" del
 *   cliente (`Directorio-lista`, `Directorio-mapa`, `Pedir-1-entrada`) no
 *   tienen nada que mostrar. Los ~8 negocios de este fixture son los mismos
 *   nombres del diseño en Claude Design (Elmer, Botica Santa Rosa, Bodega Doña
 *   Ana, La Florencia…), para que la UI construida se vea igual que el diseño
 *   aprobado al probarla contra datos reales.
 *
 * IDEMPOTENTE: borra las filas del rango de id `cd000000-…` y las reinserta.
 * `supabase db reset` borra el mundo y no lo repone — por eso este script y no
 * un `insert` dentro de la migración (CLAUDE.md §Supabase: datos de fixture no
 * van en migraciones).
 *
 * GUARD ANTI-PRODUCCIÓN heredado de `local-db.ts`.
 *
 * Uso:  pnpm db:seed:courier-directory
 */
import { E2E, localClient as db } from '../lib/__tests__/helpers/local-db.ts'

const FIXTURE_ID_LOW = 'cd000000-0000-4000-8000-000000000000'
const FIXTURE_ID_HIGH = 'cd000000-0000-4000-8000-ffffffffffff'

interface DirectoryFixtureRow {
  id: string
  name: string
  category:
    | 'chicken_grill'
    | 'chifa'
    | 'pizza_burgers'
    | 'snacks'
    | 'desserts'
    | 'drinks_liquor'
    | 'pharmacy'
    | 'bodega'
    | 'other'
  lat: number
  lng: number
  reference_text: string
  phone: string | null
  whatsapp: string | null
  opens_at: string | null
  closes_at: string | null
  visible_on_map: boolean
  courier_enabled: boolean
  is_partner: boolean
  partner_business_id: string | null
  has_menu_in_tindivo: boolean
  works_with_zorritos: boolean
}

// Centro de San Jacinto real (memoria del repo: apps/admin/.../mapa-referencias
// usa -9.1465, -78.2779), NO el fallback de `app_settings.coverage` (desviado).
const CENTER = { lat: -9.146, lng: -78.278 }

const ROWS: DirectoryFixtureRow[] = [
  {
    id: 'cd000000-0000-4000-8000-000000000001',
    name: 'La Florencia',
    category: 'pizza_burgers',
    lat: CENTER.lat + 0.0035,
    lng: CENTER.lng + 0.0015,
    reference_text: 'Plaza principal',
    phone: '900000000',
    whatsapp: null,
    opens_at: '18:00',
    closes_at: '23:00',
    visible_on_map: true,
    courier_enabled: false, // aliado: pide directo por Tindivo, no aplica recojo
    is_partner: true,
    partner_business_id: E2E.BUSINESS_ID,
    has_menu_in_tindivo: true,
    works_with_zorritos: false,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000002',
    name: 'Elmer',
    category: 'snacks',
    lat: CENTER.lat,
    lng: CENTER.lng,
    reference_text: 'Frente al parque',
    phone: '987654321',
    whatsapp: '987654321',
    opens_at: '18:00',
    closes_at: '23:00',
    visible_on_map: true,
    courier_enabled: true,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: false,
    works_with_zorritos: false,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000003',
    name: 'Botica Santa Rosa',
    category: 'pharmacy',
    lat: CENTER.lat + 0.0008,
    lng: CENTER.lng - 0.0012,
    reference_text: 'Jr. Bolívar con Grau',
    phone: '956111222',
    whatsapp: null,
    opens_at: '18:00',
    closes_at: '23:00',
    visible_on_map: true,
    courier_enabled: true,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: false,
    works_with_zorritos: false,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000004',
    name: 'Bodega Doña Ana',
    category: 'bodega',
    lat: CENTER.lat - 0.001,
    lng: CENTER.lng + 0.0008,
    reference_text: 'Junto a la iglesia',
    phone: '944333555',
    whatsapp: '944333555',
    opens_at: '18:00',
    closes_at: '22:00',
    visible_on_map: true,
    courier_enabled: true,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: true,
    works_with_zorritos: false,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000005',
    name: 'Chifa Dragón Dorado',
    category: 'chifa',
    lat: CENTER.lat + 0.0018,
    lng: CENTER.lng - 0.002,
    reference_text: 'A media cuadra del mercado',
    phone: '911222333',
    whatsapp: '911222333',
    opens_at: '18:00',
    closes_at: '23:00',
    visible_on_map: true,
    courier_enabled: true,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: false,
    works_with_zorritos: false,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000006',
    name: 'Heladería La Espuma',
    category: 'desserts',
    lat: CENTER.lat - 0.0016,
    lng: CENTER.lng - 0.0009,
    reference_text: 'Al costado del coliseo',
    phone: '922444666',
    whatsapp: null,
    opens_at: '17:00',
    closes_at: '22:00',
    visible_on_map: true,
    courier_enabled: true,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: false,
    works_with_zorritos: false,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000007',
    name: 'Licorería El Trago',
    category: 'drinks_liquor',
    lat: CENTER.lat + 0.0024,
    lng: CENTER.lng + 0.0022,
    reference_text: 'Cerca al grifo',
    phone: '933555777',
    whatsapp: null,
    opens_at: '18:00',
    closes_at: '23:59',
    visible_on_map: true,
    // Trabaja con Zorritos: recojo no aplica (spec v1 §3.1).
    courier_enabled: false,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: false,
    works_with_zorritos: true,
  },
  {
    id: 'cd000000-0000-4000-8000-000000000008',
    name: 'Carrito de sánguches (Sra. Rosa)',
    category: 'snacks',
    lat: CENTER.lat - 0.0006,
    lng: CENTER.lng + 0.0025,
    reference_text: 'Esquina del jirón principal, de noche',
    // Sin teléfono confiable: queda solo "visible" (spec v1 §3, §8.2).
    phone: null,
    whatsapp: null,
    opens_at: '19:00',
    closes_at: '23:00',
    visible_on_map: true,
    courier_enabled: false,
    is_partner: false,
    partner_business_id: null,
    has_menu_in_tindivo: false,
    works_with_zorritos: false,
  },
]

async function main() {
  const { error: delErr } = await db
    .from('directory_businesses')
    .delete()
    .gte('id', FIXTURE_ID_LOW)
    .lte('id', FIXTURE_ID_HIGH)
  if (delErr) throw new Error(`borrar directory_businesses del fixture falló: ${delErr.message}`)

  const { error: insErr } = await db.from('directory_businesses').insert(ROWS)
  if (insErr) throw new Error(`insertar directory_businesses falló: ${insErr.message}`)

  console.log(`✅ directorio de Tindivo Entregas: ${ROWS.length} negocios sembrados`)
}

main().catch((err) => {
  console.error('❌ seed-courier-directory falló:', err)
  process.exit(1)
})
