/**
 * Cuenta y negocio de DEMOSTRACIÓN para el revisor de las tiendas — SOLO DB LOCAL.
 *
 * Qué siembra (ids fijos, idempotente):
 *  · un cliente de revisión con correo y contraseña, teléfono ya verificado y una
 *    dirección dentro de la zona de cobertura (el revisor no puede recibir el SMS
 *    de Twilio, y no entra con la cuenta de Google de nadie);
 *  · un negocio «Tindivo · Demo para revisión», abierto los 7 días a toda hora,
 *    con su dueño, QR de Yape, menú y la apertura de HOY declarada;
 *  · los ajustes de plataforma abiertos 24 h (los mismos que `seed-e2e`).
 *
 * LO QUE ESTO NO ES TODAVÍA (ver `Docs/trabajo/movil/08-mv5-requisitos-revision.md`):
 * el aislamiento de producción. Este negocio es un negocio más: lo ve cualquiera,
 * sus pedidos llegan a la cajera y entran en la contabilidad. Eso exige cambios en
 * funciones que suman dinero y está esperando la revisión de Jesús y de Codex.
 * Por eso este script se niega a tocar nada que no sea 127.0.0.1.
 *
 * GUARD ANTI-PRODUCCIÓN: heredado de `local-db.ts` (aborta si no es local).
 *
 * Uso:  pnpm db:seed:review          siembra
 *       pnpm db:seed:review:clean    quita el negocio, la cuenta y sus pedidos
 */
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'
import { E2E, LOCAL_ONLY_SETTINGS } from './e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const raw = db as any

export const REVIEW = {
  PASSWORD: 'Revisor-Tindivo-2026',
  CUSTOMER_USER_ID: 'de000000-0000-4000-8000-000000000001',
  CUSTOMER_EMAIL: 'revisor@review.tindivo.local',
  CUSTOMER_NAME: 'Revisor de la tienda',
  CUSTOMER_PHONE: '+51900000901',
  ADDRESS_ID: 'de000000-0000-4000-8000-000000000002',
  OWNER_USER_ID: 'de000000-0000-4000-8000-000000000010',
  OWNER_EMAIL: 'negocio-demo@review.tindivo.local',
  BUSINESS_ID: 'de000000-0000-4000-8000-000000000011',
  BUSINESS_NAME: 'Tindivo · Demo para revisión',
  BUSINESS_SLUG: 'demo-revision',
  CATEGORY_ID: 'de000000-0000-4000-8000-000000000030',
  ITEMS: [
    { id: 'de000000-0000-4000-8000-000000000031', name: 'Pollo a la brasa (demo)', price: 45 },
    { id: 'de000000-0000-4000-8000-000000000032', name: 'Medio pollo (demo)', price: 25 },
    { id: 'de000000-0000-4000-8000-000000000033', name: 'Gaseosa 1 L (demo)', price: 8 },
  ],
  SCHEDULE_IDS: [0, 1, 2, 3, 4, 5, 6].map((d) => `de000000-0000-4000-8000-0000000000a${d}`),
} as const

async function upsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  const { error } = await raw.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`upsert ${table} falló: ${error.message}`)
  console.log(`  ✓ ${table.padEnd(28)} ${rows.length} fila(s)`)
}

async function ensureAuthUser(id: string, email: string, fullName: string): Promise<void> {
  const { data } = await db.auth.admin.getUserById(id)
  if (data?.user) {
    console.log(`  ✓ auth.users                  ${email} (ya existía)`)
    return
  }
  const { error } = await db.auth.admin.createUser({
    id,
    email,
    password: REVIEW.PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error(`crear auth user ${email} falló: ${error.message}`)
  console.log(`  ✓ auth.users                  ${email} (creado)`)
}

async function seed(): Promise<void> {
  console.log('\nSeed de la cuenta de revisión (idempotente, IDs fijos)\n')

  console.log('app_settings')
  await upsert('app_settings', LOCAL_ONLY_SETTINGS, 'key')

  console.log('\nusuarios')
  await ensureAuthUser(REVIEW.CUSTOMER_USER_ID, REVIEW.CUSTOMER_EMAIL, REVIEW.CUSTOMER_NAME)
  await ensureAuthUser(REVIEW.OWNER_USER_ID, REVIEW.OWNER_EMAIL, 'Dueño del negocio demo')
  await upsert(
    'users',
    [
      {
        id: REVIEW.CUSTOMER_USER_ID,
        email: REVIEW.CUSTOMER_EMAIL,
        full_name: REVIEW.CUSTOMER_NAME,
        primary_role: 'customer',
      },
      {
        id: REVIEW.OWNER_USER_ID,
        email: REVIEW.OWNER_EMAIL,
        full_name: 'Dueño del negocio demo',
        primary_role: 'business',
      },
    ],
    'id',
  )
  await upsert(
    'user_roles',
    [
      { user_id: REVIEW.CUSTOMER_USER_ID, role: 'customer' },
      { user_id: REVIEW.OWNER_USER_ID, role: 'business' },
    ],
    'user_id,role',
  )

  console.log('\ncliente de revisión')
  await upsert(
    'customer_profiles',
    [
      {
        user_id: REVIEW.CUSTOMER_USER_ID,
        full_name: REVIEW.CUSTOMER_NAME,
        phone: REVIEW.CUSTOMER_PHONE,
        // Sin el OTP: el revisor no puede recibir el SMS.
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
        id: REVIEW.ADDRESS_ID,
        user_id: REVIEW.CUSTOMER_USER_ID,
        label: 'Casa',
        line: E2E.CUSTOMER_ADDRESS,
        reference: E2E.CUSTOMER_REFERENCE,
        coordinates_lat: E2E.CUSTOMER_LAT,
        coordinates_lng: E2E.CUSTOMER_LNG,
        is_default: true,
        location_confirmed_at: new Date().toISOString(),
        location_accuracy_m: 8,
      },
    ],
    'id',
  )

  console.log('\nnegocio demo')
  await upsert(
    'businesses',
    [
      {
        id: REVIEW.BUSINESS_ID,
        user_id: REVIEW.OWNER_USER_ID,
        name: REVIEW.BUSINESS_NAME,
        slug: REVIEW.BUSINESS_SLUG,
        tagline: 'Negocio de demostración, siempre abierto',
        phone: '+51900000911',
        yape_number: '900000911',
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
  await upsert(
    'business_payment_qrs',
    [
      {
        business_id: REVIEW.BUSINESS_ID,
        slot: 1,
        wallet: 'yape',
        account_number: '900000911',
        account_name: REVIEW.BUSINESS_NAME,
        qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=8&data=${encodeURIComponent('yape://p2p?n=900000911')}`,
      },
    ],
    'business_id,slot',
  )
  await upsert(
    'business_schedule',
    [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      id: REVIEW.SCHEDULE_IDS[day],
      business_id: REVIEW.BUSINESS_ID,
      day_of_week: day,
      is_open: true,
      shift1_start: '00:00',
      shift1_end: '23:59',
      crosses_midnight: false,
    })),
    'id',
  )
  // Desde la 0154 el horario no basta: hay que declarar la apertura de hoy.
  const { data: serviceDate, error: sdErr } = await raw.rpc('current_service_date')
  if (sdErr || !serviceDate) throw new Error(`current_service_date falló: ${sdErr?.message}`)
  await upsert(
    'business_service_days',
    [{ business_id: REVIEW.BUSINESS_ID, service_date: serviceDate, status: 'open' }],
    'business_id,service_date',
  )

  console.log('\nmenú')
  await upsert(
    'menu_categories',
    [
      {
        id: REVIEW.CATEGORY_ID,
        business_id: REVIEW.BUSINESS_ID,
        name: 'Platos de demostración',
        display_order: 0,
        is_active: true,
      },
    ],
    'id',
  )
  await upsert(
    'menu_items',
    REVIEW.ITEMS.map((it, i) => ({
      id: it.id,
      business_id: REVIEW.BUSINESS_ID,
      category_id: REVIEW.CATEGORY_ID,
      name: it.name,
      description: 'Plato de demostración para la revisión de la tienda',
      base_price: it.price,
      display_order: i,
      is_available: true,
    })),
    'id',
  )

  console.log(`\nListo. Entrar como ${REVIEW.CUSTOMER_EMAIL} / ${REVIEW.PASSWORD}\n`)
}

async function clean(): Promise<void> {
  console.log('\nLimpieza de la cuenta de revisión\n')
  const { data: pedidos } = await raw
    .from('orders')
    .select('id')
    .or(`business_id.eq.${REVIEW.BUSINESS_ID},customer_user_id.eq.${REVIEW.CUSTOMER_USER_ID}`)
  const ids: string[] = (pedidos ?? []).map((p: { id: string }) => p.id)
  if (ids.length > 0) {
    await raw.from('domain_events').delete().in('aggregate_id', ids)
    await raw.from('business_charges').delete().in('order_id', ids)
    await raw.from('reports').delete().in('order_id', ids)
    await raw.from('orders').delete().in('id', ids)
  }
  await raw.from('business_charges').delete().eq('business_id', REVIEW.BUSINESS_ID)
  await raw.from('businesses').delete().eq('id', REVIEW.BUSINESS_ID)
  for (const id of [REVIEW.CUSTOMER_USER_ID, REVIEW.OWNER_USER_ID]) {
    await raw.from('users').delete().eq('id', id)
    await db.auth.admin.deleteUser(id)
  }
  console.log(`  ✓ ${ids.length} pedido(s), el negocio y las dos cuentas quitados\n`)
}

const run = process.argv.includes('--clean') ? clean : seed
run().catch((err) => {
  console.error('\nSeed FALLÓ:', err instanceof Error ? err.message : err)
  process.exit(1)
})
