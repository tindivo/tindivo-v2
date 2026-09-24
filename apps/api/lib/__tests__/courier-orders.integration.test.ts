/**
 * Test de INTEGRACIÓN de Tindivo Entregas (`courier`) — migración 0232/0233.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321). Cubre las tres RPC
 * que son la única autoridad sobre las reglas de negocio del backend:
 * `create_courier_order`, `advance_courier_order`, `expire_courier_orders`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localClient } from './helpers/local-db.ts'
import {
  type CourierCustomer,
  type CourierDriver,
  callCreateCourierOrder,
  cleanupCourier,
  OUT_OF_ZONE_POINT,
  seedCourierCustomer,
  seedCourierDriver,
  setCourierEnabled,
  setCourierHoursClosedNow,
  setCourierMaxActivePerPhone,
} from './helpers/local-db-courier.ts'

// El archivo entero muta `app_settings.courier` (enabled/hours/maxActivePerPhone)
// para poder probar cada guard. Se restaura al terminar para que una corrida
// de este archivo no deje el mundo compartido en un estado distinto al que
// tenía — lo mismo que ya hace `e2e/courier-pedir-desde-negocio.spec.ts`.
let courierSettingsAntes: Record<string, unknown> | null = null

beforeAll(async () => {
  const { data } = await localClient
    .from('app_settings')
    .select('value')
    .eq('key', 'courier')
    .single()
  courierSettingsAntes = (data?.value as Record<string, unknown>) ?? null
})

afterAll(async () => {
  if (courierSettingsAntes) {
    await localClient
      .from('app_settings')
      .update({ value: courierSettingsAntes })
      .eq('key', 'courier')
  }
})

interface CourierOrderRow {
  id: string
  short_id: string
  status: string
  fee_amount: string
  distance_m: string | null
  payer: string
  transport_collected_at: string | null
  cancel_reason: string | null
}

async function leer(id: string): Promise<CourierOrderRow> {
  const { data, error } = await localClient
    .from('courier_orders')
    .select(
      'id, short_id, status, fee_amount, distance_m, payer, transport_collected_at, cancel_reason',
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`leer(${id}) falló: ${error.message}`)
  return data as unknown as CourierOrderRow
}

async function eventos(courierOrderId: string): Promise<string[]> {
  const { data, error } = await localClient
    .from('courier_order_events')
    .select('event_type')
    .eq('courier_order_id', courierOrderId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`eventos(${courierOrderId}) falló: ${error.message}`)
  return (data ?? []).map((e) => e.event_type)
}

describe('create_courier_order', () => {
  let customer: CourierCustomer
  let driver: CourierDriver

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driver = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
    await setCourierMaxActivePerPhone(1)
  })

  afterEach(async () => {
    await cleanupCourier({ customerUserIds: [customer.userId], driverUserIds: [driver.userId] })
  })

  it('crea la solicitud con precio, distancia y short_id válidos, y deja el evento', async () => {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(error).toBeNull()
    const body = data as {
      id: string
      shortId: string
      orderNumber: number
      status: string
      feeAmount: number
      distanceM: number
    }
    expect(body.status).toBe('requested')
    expect(body.feeAmount).toBe(3)
    expect(body.distanceM).toBeGreaterThan(0)
    expect(body.shortId).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)

    const row = await leer(body.id)
    expect(row.status).toBe('requested')
    expect(row.payer).toBe('destination')

    expect(await eventos(body.id)).toEqual(['courier.requested'])
  })

  it('rechaza si el servicio está apagado', async () => {
    await setCourierEnabled(false)
    const { error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(error?.message).toContain('courier_disabled')
  })

  it('rechaza fuera del horario configurado', async () => {
    await setCourierHoursClosedNow()
    const { error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(error?.message).toContain('courier_closed')
  })

  it('rechaza si no hay ningún motorizado disponible', async () => {
    // `courier_has_available_driver()` mira TODOS los motorizados, no solo el
    // de este test — la base local trae motorizados del seed e2e ya
    // disponibles. Se apagan todos, se prueba, y se restauran exactamente como
    // estaban (fileParallelism:false hace esto seguro: un solo archivo de
    // integración corre a la vez).
    const { data: antes, error: leerErr } = await localClient
      .from('driver_availability')
      .select('driver_id, is_available')
    if (leerErr) throw new Error(`leer driver_availability falló: ${leerErr.message}`)

    await localClient
      .from('driver_availability')
      .update({ is_available: false })
      .neq('driver_id', '00000000-0000-0000-0000-000000000000')

    try {
      const { error } = await callCreateCourierOrder({
        customerUserId: customer.userId,
        requesterPhone: customer.phone,
      })
      expect(error?.message).toContain('courier_no_driver')
    } finally {
      for (const row of antes ?? []) {
        await localClient
          .from('driver_availability')
          .update({ is_available: row.is_available })
          .eq('driver_id', row.driver_id)
      }
    }
  })

  it('rechaza un punto fuera de la zona de cobertura (origen)', async () => {
    const { error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      origin: OUT_OF_ZONE_POINT,
    })
    expect(error?.message).toContain('courier_out_of_zone:origin')
  })

  it('rechaza un punto fuera de la zona de cobertura (destino)', async () => {
    const { error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      destination: OUT_OF_ZONE_POINT,
    })
    expect(error?.message).toContain('courier_out_of_zone:destination')
  })

  it('exige el checkbox de peso permitido', async () => {
    const { error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      weightConfirmed: false,
    })
    expect(error).not.toBeNull()
  })

  it('exige el checkbox de "ya pagué mi pedido"', async () => {
    const { error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      prepaidConfirmed: false,
    })
    expect(error).not.toBeNull()
  })

  it('aplica el tope de un pedido activo por teléfono', async () => {
    const first = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(first.error).toBeNull()

    const second = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(second.error?.message).toContain('courier_active_limit')
  })
})

describe('advance_courier_order', () => {
  let customer: CourierCustomer
  let driverA: CourierDriver
  let driverB: CourierDriver
  let courierOrderId: string

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driverA = await seedCourierDriver({ available: true })
    driverB = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
    await setCourierMaxActivePerPhone(5)
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      payer: 'destination',
    })
    if (error) throw new Error(`seed courier_order falló: ${error.message}`)
    courierOrderId = (data as { id: string }).id
  })

  afterEach(async () => {
    await cleanupCourier({
      customerUserIds: [customer.userId],
      driverUserIds: [driverA.userId, driverB.userId],
    })
  })

  it('accept es una carrera atómica: solo un motorizado gana', async () => {
    const [ra, rb] = await Promise.all([
      localClient.rpc('advance_courier_order', {
        p_courier_order_id: courierOrderId,
        p_actor_user_id: driverA.userId,
        p_action: 'accept',
      }),
      localClient.rpc('advance_courier_order', {
        p_courier_order_id: courierOrderId,
        p_actor_user_id: driverB.userId,
        p_action: 'accept',
      }),
    ])
    const results = [ra, rb]
    const ganadores = results.filter((r) => r.error === null)
    const perdedores = results.filter((r) => r.error !== null)
    expect(ganadores).toHaveLength(1)
    expect(perdedores).toHaveLength(1)
    expect(perdedores[0]?.error?.message).toContain('courier_already_taken')

    const row = await leer(courierOrderId)
    expect(row.status).toBe('accepted')
  })

  it('rechaza una transición que se salta pasos', async () => {
    const { error } = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'arrive', // todavía no aceptó
    })
    expect(error?.message).toContain('courier_invalid_transition')
  })

  it('release suelta la entrega sin reiniciar el pedido original', async () => {
    await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'accept',
    })
    const { error } = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'release',
    })
    expect(error).toBeNull()
    const row = await leer(courierOrderId)
    expect(row.status).toBe('requested')

    // Otro motorizado ahora puede aceptarla.
    const { error: acceptB } = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverB.userId,
      p_action: 'accept',
    })
    expect(acceptB).toBeNull()
  })

  it('guarda de cobro: payer=destination no deja entregar sin cobrar el transporte', async () => {
    const actions = ['accept', 'depart', 'arrive', 'pick_up', 'depart_dropoff'] as const
    for (const action of actions) {
      const { error } = await localClient.rpc('advance_courier_order', {
        p_courier_order_id: courierOrderId,
        p_actor_user_id: driverA.userId,
        p_action: action,
      })
      expect(error, `acción "${action}" no debía fallar`).toBeNull()
    }
    const sinCobrar = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'deliver',
    })
    expect(sinCobrar.error?.message).toContain('courier_transport_unpaid')

    const cobro = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'collect_transport',
      p_payment_method: 'cash',
    })
    expect(cobro.error).toBeNull()

    const entrega = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'deliver',
    })
    expect(entrega.error).toBeNull()
    const row = await leer(courierOrderId)
    expect(row.status).toBe('delivered')
  })

  it('guarda de cobro: payer=origin no deja recoger sin cobrar el transporte en el punto A', async () => {
    // El tope de este describe es 5 por teléfono (beforeEach): reusar el mismo
    // teléfono no choca con `courier_active_limit`.
    const { data, error: createErr } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      payer: 'origin',
    })
    if (createErr) throw new Error(createErr.message)
    const originOrderId = (data as { id: string }).id

    await localClient.rpc('advance_courier_order', {
      p_courier_order_id: originOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'accept',
    })
    await localClient.rpc('advance_courier_order', {
      p_courier_order_id: originOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'depart',
    })
    await localClient.rpc('advance_courier_order', {
      p_courier_order_id: originOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'arrive',
    })

    const sinCobrar = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: originOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'pick_up',
    })
    expect(sinCobrar.error?.message).toContain('courier_transport_unpaid')

    await localClient.rpc('advance_courier_order', {
      p_courier_order_id: originOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'collect_transport',
      p_payment_method: 'yape',
    })
    const conCobro = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: originOrderId,
      p_actor_user_id: driverA.userId,
      p_action: 'pick_up',
    })
    expect(conCobro.error).toBeNull()
  })

  it('cancela desde un estado no terminal y exige la razón', async () => {
    const sinRazon = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: customer.userId,
      p_action: 'cancel',
    })
    expect(sinRazon.error?.message).toContain('courier_cancel_reason_required')

    const { error } = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: customer.userId,
      p_action: 'cancel',
      p_cancel_reason: 'customer_cancelled',
    })
    expect(error).toBeNull()
    const row = await leer(courierOrderId)
    expect(row.status).toBe('cancelled')
    expect(row.cancel_reason).toBe('customer_cancelled')
  })

  it('no deja cancelar dos veces (ya es terminal)', async () => {
    await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: customer.userId,
      p_action: 'cancel',
      p_cancel_reason: 'customer_cancelled',
    })
    const { error } = await localClient.rpc('advance_courier_order', {
      p_courier_order_id: courierOrderId,
      p_actor_user_id: customer.userId,
      p_action: 'cancel',
      p_cancel_reason: 'other',
    })
    expect(error?.message).toContain('courier_invalid_transition')
  })
})

describe('expire_courier_orders', () => {
  let customer: CourierCustomer
  let driver: CourierDriver

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driver = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
  })

  afterEach(async () => {
    await cleanupCourier({ customerUserIds: [customer.userId], driverUserIds: [driver.userId] })
  })

  it('cancela lo que lleva más de courierAcceptMinutes sin aceptar, con el motivo correcto', async () => {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    if (error) throw new Error(error.message)
    const id = (data as { id: string }).id

    const { data: current, error: readErr } = await localClient
      .from('courier_orders')
      .select('created_at')
      .eq('id', id)
      .single()
    if (readErr || !current) throw new Error(`leer created_at falló: ${readErr?.message}`)
    const backdated = new Date(new Date(current.created_at).getTime() - 20 * 60_000).toISOString()
    await localClient.from('courier_orders').update({ created_at: backdated }).eq('id', id)

    const { error: expireErr } = await localClient.rpc('expire_courier_orders')
    expect(expireErr).toBeNull()

    const row = await leer(id)
    expect(row.status).toBe('cancelled')
    expect(row.cancel_reason).toBe('no_driver')
    expect(await eventos(id)).toContain('courier.expired')
  })

  it('no toca una solicitud reciente', async () => {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    if (error) throw new Error(error.message)
    const id = (data as { id: string }).id

    await localClient.rpc('expire_courier_orders')

    const row = await leer(id)
    expect(row.status).toBe('requested')
  })
})

describe('courier_service_status y get_courier_tracking', () => {
  let customer: CourierCustomer
  let driver: CourierDriver

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driver = await seedCourierDriver({ available: true })
  })

  afterEach(async () => {
    await cleanupCourier({ customerUserIds: [customer.userId], driverUserIds: [driver.userId] })
  })

  it('refleja enabled/openNow/price sin sesión', async () => {
    await setCourierEnabled(true)
    const { data, error } = await localClient.rpc('courier_service_status')
    expect(error).toBeNull()
    const status = data as { enabled: boolean; openNow: boolean; price: number }
    expect(status.enabled).toBe(true)
    expect(status.openNow).toBe(true)
    expect(status.price).toBe(3)
  })

  it('openNow es false con el servicio apagado, aunque haya motorizado y horario abierto', async () => {
    await setCourierEnabled(false)
    const { data } = await localClient.rpc('courier_service_status')
    const status = data as { enabled: boolean; openNow: boolean }
    expect(status.enabled).toBe(false)
    expect(status.openNow).toBe(false)
  })

  it('get_courier_tracking encuentra la solicitud por short_id, sin exponer teléfonos', async () => {
    await setCourierEnabled(true)
    const { data: created, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    if (error) throw new Error(error.message)
    const shortId = (created as { shortId: string }).shortId

    const { data, error: trackErr } = await localClient.rpc('get_courier_tracking', {
      p_short_id: shortId,
    })
    expect(trackErr).toBeNull()
    const tracking = data as { shortId: string; status: string } | null
    expect(tracking?.shortId).toBe(shortId)
    expect(tracking?.status).toBe('requested')
    expect(JSON.stringify(tracking)).not.toContain(customer.phone)
  })

  it('devuelve null para un short_id que no existe', async () => {
    const { data } = await localClient.rpc('get_courier_tracking', { p_short_id: 'ZZZZZZZZ' })
    expect(data).toBeNull()
  })
})
