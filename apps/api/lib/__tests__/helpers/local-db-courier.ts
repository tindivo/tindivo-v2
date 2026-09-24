/**
 * Helpers de integración para Tindivo Entregas (`courier`), contra la DB LOCAL.
 * Reusa el cliente y el guard anti-producción de `local-db.ts`; NO lo duplica.
 *
 * Puntos dentro del polígono de cobertura sembrado (`0045`/`0064`) — usar
 * SIEMPRE estas dos constantes en los tests, nunca coordenadas inventadas: un
 * punto fuera del polígono hace que `create_courier_order` rechace con
 * `courier_out_of_zone`, que es un test aparte, no un efecto colateral de éste.
 */
import { localClient } from './local-db.ts'

export const COURIER_POINT_A = { lat: -9.146, lng: -78.278 } as const
export const COURIER_POINT_B = { lat: -9.1495, lng: -78.2795 } as const
/** A propósito muy lejos del pueblo (Lima) — para probar el guard de zona. */
export const OUT_OF_ZONE_POINT = { lat: -12.0464, lng: -77.0428 } as const

export interface CourierCustomer {
  userId: string
  phone: string
}

export interface CourierDriver {
  userId: string
  driverId: string
}

let phoneSeq = 0
/** Celular peruano de prueba único por seed — evita chocar con `maxActivePerPhone`. */
function nextPhone(): string {
  phoneSeq += 1
  return `9${String(80000000 + phoneSeq).padStart(8, '0')}`.slice(0, 9)
}

export async function seedCourierCustomer(): Promise<CourierCustomer> {
  const { data: authUser, error: authErr } = await localClient.auth.admin.createUser({
    email: `courier-cliente-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Entregas' },
  })
  if (authErr) throw new Error(`seed courier customer auth falló: ${authErr.message}`)
  return { userId: authUser.user.id, phone: nextPhone() }
}

export async function seedCourierDriver(
  opts: { available?: boolean } = {},
): Promise<CourierDriver> {
  const { available = true } = opts
  const { data: authUser, error: authErr } = await localClient.auth.admin.createUser({
    email: `courier-motorizado-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Motorizado Entregas Test' },
  })
  if (authErr) throw new Error(`seed courier driver auth falló: ${authErr.message}`)
  const userId = authUser.user.id

  const { data: driver, error: driverErr } = await localClient
    .from('drivers')
    .insert({ user_id: userId, full_name: 'Motorizado Entregas Test', phone: nextPhone() })
    .select('id')
    .single()
  if (driverErr) throw new Error(`seed drivers falló: ${driverErr.message}`)

  const { error: availErr } = await localClient
    .from('driver_availability')
    .upsert({ driver_id: driver.id, is_available: available })
  if (availErr) throw new Error(`seed driver_availability falló: ${availErr.message}`)

  return { userId, driverId: driver.id }
}

/** Enciende/apaga Tindivo Entregas y fija un horario que cubre TODO el día, en Lima. */
export async function setCourierEnabled(enabled: boolean): Promise<void> {
  const { data } = await localClient
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  const value = {
    ...(data?.value as Record<string, unknown>),
    enabled,
    hours: { start: '00:00', end: '23:59' },
  }
  const { error } = await localClient.from('app_settings').update({ value }).eq('key', 'courier')
  if (error) throw new Error(`setCourierEnabled falló: ${error.message}`)
}

/** Fija un horario que NO cubre el momento actual (en Lima) — para el guard "cerrado". */
export async function setCourierHoursClosedNow(): Promise<void> {
  const nowLima = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' }))
  const start = new Date(nowLima.getTime() + 3 * 60 * 60_000)
  const end = new Date(nowLima.getTime() + 4 * 60 * 60_000)
  const hhmm = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const { data } = await localClient
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  const value = {
    ...(data?.value as Record<string, unknown>),
    enabled: true,
    hours: { start: hhmm(start), end: hhmm(end) },
  }
  const { error } = await localClient.from('app_settings').update({ value }).eq('key', 'courier')
  if (error) throw new Error(`setCourierHoursClosedNow falló: ${error.message}`)
}

export async function setCourierMaxActivePerPhone(max: number): Promise<void> {
  const { data } = await localClient
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  const value = { ...(data?.value as Record<string, unknown>), maxActivePerPhone: max }
  const { error } = await localClient.from('app_settings').update({ value }).eq('key', 'courier')
  if (error) throw new Error(`setCourierMaxActivePerPhone falló: ${error.message}`)
}

export interface CreateCourierOrderArgs {
  customerUserId: string
  requesterPhone: string
  payer?: 'origin' | 'destination'
  origin?: { lat: number; lng: number }
  destination?: { lat: number; lng: number }
  weightConfirmed?: boolean
  prepaidConfirmed?: boolean
  directoryBusinessId?: string
}

/** Llama `create_courier_order` con valores por defecto razonables (punto A/B dentro de la zona). */
export async function callCreateCourierOrder(args: CreateCourierOrderArgs) {
  const origin = args.origin ?? COURIER_POINT_A
  const destination = args.destination ?? COURIER_POINT_B
  // `p_directory_business_id`/`p_origin_phone` son columnas nullable SIN DEFAULT en
  // Postgres: la RPC exige que el llamador mande `null` explícito, pero el tipo
  // generado por `supabase gen types` las declara `string` a secas (mismo caso
  // documentado en `apps/api/app/api/v1/customer/orders/route.ts` para
  // `p_delivery_address`/`p_delivery_reference`) — de ahí el cast.
  return localClient.rpc('create_courier_order', {
    p_customer_user_id: args.customerUserId,
    p_requester_name: 'Vecino de prueba',
    p_requester_phone: args.requesterPhone,
    p_directory_business_id: (args.directoryBusinessId ?? null) as unknown as string,
    p_origin_name: 'Elmer (prueba)',
    p_origin_phone: null as unknown as string,
    p_origin_lat: origin.lat,
    p_origin_lng: origin.lng,
    p_origin_reference_text: 'Frente al parque, prueba de integración',
    p_destination_name: 'Vecino de prueba',
    p_destination_phone: args.requesterPhone,
    p_destination_lat: destination.lat,
    p_destination_lng: destination.lng,
    p_destination_reference_text: 'Casa de dos pisos, prueba de integración',
    p_item_description: 'Un paquete de prueba',
    p_is_fragile: false,
    p_ready_in_min: 0,
    p_payer: args.payer ?? 'destination',
    p_weight_confirmed: args.weightConfirmed ?? true,
    p_prepaid_confirmed: args.prepaidConfirmed ?? true,
    p_utm_source: undefined,
  })
}

/** Borra todo lo sembrado por un test de courier, en el orden que las FKs exigen. */
export async function cleanupCourier(seed: {
  customerUserIds?: string[]
  driverUserIds?: string[]
  directoryBusinessIds?: string[]
}): Promise<void> {
  const { customerUserIds = [], driverUserIds = [], directoryBusinessIds = [] } = seed

  const driverIds: string[] = []
  if (driverUserIds.length > 0) {
    const { data } = await localClient.from('drivers').select('id').in('user_id', driverUserIds)
    for (const d of data ?? []) driverIds.push(d.id)
  }

  // courier_order_events cae por CASCADE al borrar courier_orders.
  if (customerUserIds.length > 0) {
    await localClient.from('courier_orders').delete().in('customer_user_id', customerUserIds)
  }
  if (driverIds.length > 0) {
    await localClient.from('courier_orders').delete().in('driver_id', driverIds)
  }
  if (directoryBusinessIds.length > 0) {
    await localClient.from('directory_businesses').delete().in('id', directoryBusinessIds)
  }

  const allUserIds = [...customerUserIds, ...driverUserIds]
  for (const id of allUserIds) {
    await localClient.from('users').delete().eq('id', id)
    await localClient.auth.admin.deleteUser(id)
  }
}
