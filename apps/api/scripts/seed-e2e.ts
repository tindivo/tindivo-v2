/**
 * Seed del MUNDO para el e2e — SOLO DB LOCAL.
 *
 * Siembra un mundo mínimo pero completo para recorrer el camino feliz:
 * un negocio abierto, menú con modificadores, motorizado disponible, cliente
 * con dirección dentro de la zona de cobertura, y los app_settings necesarios.
 *
 * IDEMPOTENTE: usa IDs FIJOS + upsert. Correrlo N veces deja el mismo estado,
 * sin truncate y sin duplicar. Por eso NO borra nada del mundo.
 *
 * Los pedidos de prueba NO se tocan aquí: se limpian con `seed-e2e-clean.ts`,
 * que borra solo transaccionales por el marcador del cliente de prueba.
 *
 * GUARD ANTI-PRODUCCIÓN: se hereda de `local-db.ts`, que evalúa `assertLocalOnly`
 * al importarse y aborta si la URL no es 127.0.0.1/localhost. No se duplica aquí.
 *
 * Uso:  pnpm db:seed:e2e
 */
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'
import { E2E, LOCAL_ONLY_SETTINGS } from './e2e-fixtures.ts'

// El cliente Supabase está tipado con un `Database` que aún no conoce algunas
// tablas (business_charges y otras). El seed opera sobre datos crudos, así que
// se accede sin tipar en vez de forzar castings tabla por tabla.
// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const raw = db as any

async function upsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  const { error } = await raw.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`upsert ${table} falló: ${error.message}`)
  console.log(`  ✓ ${table.padEnd(28)} ${rows.length} fila(s)`)
}

/** Crea el usuario en auth.users si no existe; devuelve siempre el mismo id fijo. */
async function ensureAuthUser(id: string, email: string, fullName: string): Promise<void> {
  const { data } = await db.auth.admin.getUserById(id)
  if (data?.user) {
    console.log(`  ✓ auth.users                  ${email} (ya existía)`)
    return
  }
  const { error } = await db.auth.admin.createUser({
    // El id fijo es lo que hace idempotente todo lo que cuelga del usuario.
    id,
    email,
    password: E2E.PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(`crear auth user ${email} falló: ${error.message}`)
  console.log(`  ✓ auth.users                  ${email} (creado)`)
}

async function main(): Promise<void> {
  console.log('\nSeed e2e — mundo (idempotente, IDs fijos)\n')

  // ── 1. app_settings ────────────────────────────────────────────────────────
  // Las migraciones ya siembran estas claves con valores de producción. Aquí solo
  // se sobrescriben las que harían el e2e no determinista: `platform_schedule`
  // (18:00-23:00) y `order_intake_cutoff` (22:30) bloquean la creación de pedidos
  // fuera de la tarde-noche, así que en LOCAL se abren 24h.
  console.log('app_settings')
  await upsert('app_settings', LOCAL_ONLY_SETTINGS, 'key')

  // ── 2. Usuarios (auth primero: todo lo demás tiene FK a public.users) ───────
  console.log('\nusuarios')
  await ensureAuthUser(E2E.BUSINESS_USER_ID, E2E.BUSINESS_EMAIL, 'Dueño E2E')
  await ensureAuthUser(E2E.DRIVER_USER_ID, E2E.DRIVER_EMAIL, 'Motorizado E2E')
  await ensureAuthUser(E2E.CUSTOMER_USER_ID, E2E.CUSTOMER_EMAIL, 'Cliente E2E')

  // El trigger handle_new_user ya creó las filas en public.users; el upsert fija
  // el primary_role, que el trigger deja siempre en 'customer'.
  await upsert(
    'users',
    [
      {
        id: E2E.BUSINESS_USER_ID,
        email: E2E.BUSINESS_EMAIL,
        full_name: 'Dueño E2E',
        primary_role: 'business',
      },
      {
        id: E2E.DRIVER_USER_ID,
        email: E2E.DRIVER_EMAIL,
        full_name: 'Motorizado E2E',
        primary_role: 'driver',
      },
      {
        id: E2E.CUSTOMER_USER_ID,
        email: E2E.CUSTOMER_EMAIL,
        full_name: 'Cliente E2E',
        primary_role: 'customer',
      },
    ],
    'id',
  )

  await upsert(
    'user_roles',
    [
      { user_id: E2E.BUSINESS_USER_ID, role: 'business' },
      { user_id: E2E.DRIVER_USER_ID, role: 'driver' },
      { user_id: E2E.CUSTOMER_USER_ID, role: 'customer' },
    ],
    'user_id,role',
  )

  // ── 3. Negocio abierto ─────────────────────────────────────────────────────
  console.log('\nnegocio')
  await upsert(
    'businesses',
    [
      {
        id: E2E.BUSINESS_ID,
        user_id: E2E.BUSINESS_USER_ID,
        name: E2E.BUSINESS_NAME,
        tagline: 'Pollos a la brasa',
        phone: '+51900000001',
        yape_number: '900000001',
        accent_color: 'f26241',
        delivery_fee: 2.0,
        estimated_eta_min: 25,
        estimated_eta_max: 35,
        is_active: true,
        is_blocked: false,
        blocked_for_debt: false,
        publishes_catalog: true,
        accepts_web_pickup: true,
        accepts_web_delivery: true,
        uses_tindivo_drivers: true,
        coordinates_lat: E2E.BUSINESS_LAT,
        coordinates_lng: E2E.BUSINESS_LNG,
      },
    ],
    'id',
  )

  // Abierto los 7 días, 24h: el e2e no depende de la hora a la que se ejecute.
  await upsert(
    'business_schedule',
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      id: E2E.SCHEDULE_IDS[day],
      business_id: E2E.BUSINESS_ID,
      day_of_week: day,
      is_open: true,
      shift1_start: '00:00',
      shift1_end: '23:59',
      crosses_midnight: false,
    })),
    'id',
  )

  // ── 4. Menú: 3 productos, uno con grupo de modificadores ───────────────────
  console.log('\nmenú')
  await upsert(
    'menu_categories',
    [
      {
        id: E2E.CATEGORY_ID,
        business_id: E2E.BUSINESS_ID,
        name: 'Pollos a la brasa',
        display_order: 0,
        is_active: true,
      },
    ],
    'id',
  )

  await upsert(
    'menu_items',
    [
      {
        id: E2E.ITEM_POLLO_ID,
        business_id: E2E.BUSINESS_ID,
        category_id: E2E.CATEGORY_ID,
        name: E2E.ITEM_POLLO_NAME,
        description: 'Con papas y ensalada',
        base_price: 45.0,
        display_order: 0,
        is_available: true,
      },
      {
        id: E2E.ITEM_MEDIO_ID,
        business_id: E2E.BUSINESS_ID,
        category_id: E2E.CATEGORY_ID,
        name: 'Medio pollo',
        description: 'Con papas',
        base_price: 25.0,
        display_order: 1,
        is_available: true,
      },
      {
        id: E2E.ITEM_GASEOSA_ID,
        business_id: E2E.BUSINESS_ID,
        category_id: E2E.CATEGORY_ID,
        name: 'Gaseosa 1L',
        description: null,
        base_price: 8.0,
        display_order: 2,
        is_available: true,
      },
    ],
    'id',
  )

  // Grupo de modificadores tipo "extra queso": opcional y multi-selección.
  await upsert(
    'menu_modifier_groups',
    [
      {
        id: E2E.MODGROUP_ID,
        business_id: E2E.BUSINESS_ID,
        name: 'Extras',
        selection_type: 'multi',
        is_required: false,
        min_selections: 0,
        max_selections: 3,
        display_order: 0,
      },
    ],
    'id',
  )

  await upsert(
    'menu_modifier_options',
    [
      {
        id: E2E.MODOPT_QUESO_ID,
        group_id: E2E.MODGROUP_ID,
        name: E2E.MODOPT_QUESO_NAME,
        additional_price: 3.0,
        display_order: 0,
        is_available: true,
      },
      {
        id: E2E.MODOPT_PAPAS_ID,
        group_id: E2E.MODGROUP_ID,
        name: 'Papas extra',
        additional_price: 5.0,
        display_order: 1,
        is_available: true,
      },
      {
        id: E2E.MODOPT_AJI_ID,
        group_id: E2E.MODGROUP_ID,
        name: 'Ají de la casa',
        additional_price: 0.0,
        display_order: 2,
        is_available: true,
      },
    ],
    'id',
  )

  // Solo el pollo entero admite extras.
  await upsert(
    'menu_item_modifier_groups',
    [{ item_id: E2E.ITEM_POLLO_ID, group_id: E2E.MODGROUP_ID, display_order: 0 }],
    'item_id,group_id',
  )

  // ── 5. Motorizado activo y disponible ──────────────────────────────────────
  console.log('\nmotorizado')
  await upsert(
    'drivers',
    [
      {
        id: E2E.DRIVER_ID,
        user_id: E2E.DRIVER_USER_ID,
        full_name: 'Motorizado E2E',
        phone: '900000002',
        vehicle_type: 'moto',
        operating_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        shift_start: '00:00',
        shift_end: '23:59',
        is_active: true,
      },
    ],
    'id',
  )

  await upsert(
    'driver_availability',
    [{ driver_id: E2E.DRIVER_ID, is_available: true, shift_started_at: new Date().toISOString() }],
    'driver_id',
  )

  await upsert(
    'driver_restaurants',
    [{ driver_id: E2E.DRIVER_ID, business_id: E2E.BUSINESS_ID }],
    'driver_id,business_id',
  )

  // ── 6. Cliente con dirección DENTRO de la zona de cobertura ────────────────
  // Las coordenadas están verificadas contra public.point_in_coverage_polygon().
  console.log('\ncliente')
  await upsert(
    'customer_profiles',
    [
      {
        user_id: E2E.CUSTOMER_USER_ID,
        full_name: 'Cliente E2E',
        phone: E2E.CUSTOMER_PHONE,
        phone_verified_at: new Date().toISOString(),
        default_address: E2E.CUSTOMER_ADDRESS,
        default_reference: E2E.CUSTOMER_REFERENCE,
        default_coordinates_lat: E2E.CUSTOMER_LAT,
        default_coordinates_lng: E2E.CUSTOMER_LNG,
        strikes: 0,
        contraentrega_blocked: false,
      },
    ],
    'user_id',
  )

  await upsert(
    'customer_addresses',
    [
      {
        id: E2E.ADDRESS_ID,
        user_id: E2E.CUSTOMER_USER_ID,
        label: 'Casa',
        line: E2E.CUSTOMER_ADDRESS,
        reference: E2E.CUSTOMER_REFERENCE,
        coordinates_lat: E2E.CUSTOMER_LAT,
        coordinates_lng: E2E.CUSTOMER_LNG,
        is_default: true,
      },
    ],
    'id',
  )

  console.log('\nMundo e2e listo.\n')
}

main().catch((err) => {
  console.error('\nSeed FALLÓ:', err instanceof Error ? err.message : err)
  process.exit(1)
})
