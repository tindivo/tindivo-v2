/**
 * Test de INTEGRACIÓN de los tres botones del motorizado en Tindivo Entregas
 * (migración 0235): `driver_courier_step` y los cambios de `create_courier_order`.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321), igual que
 * `courier-orders.integration.test.ts`.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localClient } from './helpers/local-db.ts'
import {
  type CourierCustomer,
  type CourierDriver,
  callCreateCourierOrder,
  cleanupCourier,
  patchCourierSettings,
  seedCourierCustomer,
  seedCourierDriver,
  setCourierEnabled,
} from './helpers/local-db-courier.ts'

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

interface Fila {
  status: string
  driver_id: string | null
  payment_method: string | null
  transport_collected_at: string | null
  cancel_reason: string | null
  ready_in_min: number
  accepted_at: string | null
  picked_up_at: string | null
  delivered_at: string | null
}

async function leer(id: string): Promise<Fila> {
  const { data, error } = await localClient
    .from('courier_orders')
    .select(
      'status, driver_id, payment_method, transport_collected_at, cancel_reason, ready_in_min, accepted_at, picked_up_at, delivered_at',
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`leer(${id}) falló: ${error.message}`)
  return data as unknown as Fila
}

function paso(
  courierOrderId: string,
  driver: CourierDriver,
  step: string,
  extra: {
    payment?: 'cash' | 'yape'
    reason?: 'not_ready' | 'unreachable' | 'other' | 'no_driver'
  } = {},
) {
  return localClient.rpc('driver_courier_step', {
    p_courier_order_id: courierOrderId,
    p_actor_user_id: driver.userId,
    p_step: step,
    p_payment_method: extra.payment ?? (null as unknown as string),
    p_cancel_reason: extra.reason ?? (null as unknown as 'other'),
  })
}

describe('driver_courier_step', () => {
  let customer: CourierCustomer
  let driverA: CourierDriver
  let driverB: CourierDriver

  async function crear(payer: 'origin' | 'destination' = 'destination'): Promise<string> {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      payer,
    })
    if (error) throw new Error(`crear falló: ${error.message}`)
    return (data as { id: string }).id
  }

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driverA = await seedCourierDriver({ available: true })
    driverB = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
    await patchCourierSettings({ maxActivePerPhone: 10, maxActivePerDriver: 2 })
  })

  afterEach(async () => {
    await cleanupCourier({
      customerUserIds: [customer.userId],
      driverUserIds: [driverA.userId, driverB.userId],
    })
  })

  it('paga quien recibe: aceptar → recogido → entregado con Yape', async () => {
    const id = await crear('destination')
    expect((await paso(id, driverA, 'accept')).error).toBeNull()

    expect((await paso(id, driverA, 'pick_up')).error).toBeNull()
    const recogido = await leer(id)
    expect(recogido.status).toBe('picked_up')
    expect(recogido.transport_collected_at).toBeNull()

    const sinMetodo = await paso(id, driverA, 'deliver')
    expect(sinMetodo.error?.message).toContain('courier_payment_method_required')
    // La transacción no dejó nada a medias: sigue recogido, no «en camino».
    expect((await leer(id)).status).toBe('picked_up')

    expect((await paso(id, driverA, 'deliver', { payment: 'yape' })).error).toBeNull()
    const fin = await leer(id)
    expect(fin.status).toBe('delivered')
    expect(fin.payment_method).toBe('yape')
    expect(fin.transport_collected_at).not.toBeNull()
    expect(fin.accepted_at && fin.picked_up_at && fin.delivered_at).toBeTruthy()
  })

  it('paga quien entrega: «Recogido» exige el método y cobra en el mismo paso', async () => {
    const id = await crear('origin')
    await paso(id, driverA, 'accept')

    const sinMetodo = await paso(id, driverA, 'pick_up')
    expect(sinMetodo.error?.message).toContain('courier_payment_method_required')
    // Rollback completo: ni salió ni llegó.
    expect((await leer(id)).status).toBe('accepted')

    expect((await paso(id, driverA, 'pick_up', { payment: 'cash' })).error).toBeNull()
    const recogido = await leer(id)
    expect(recogido.status).toBe('picked_up')
    expect(recogido.payment_method).toBe('cash')

    // Al entregar ya no pide método: el cobro fue en el origen.
    expect((await paso(id, driverA, 'deliver')).error).toBeNull()
    expect((await leer(id)).status).toBe('delivered')
  })

  it('repetir un paso ya dado no falla ni cobra dos veces', async () => {
    const id = await crear('origin')
    await paso(id, driverA, 'accept')
    await paso(id, driverA, 'pick_up', { payment: 'yape' })
    const antes = await leer(id)

    const repetido = await paso(id, driverA, 'pick_up', { payment: 'cash' })
    expect(repetido.error).toBeNull()
    const despues = await leer(id)
    expect(despues.payment_method).toBe('yape')
    expect(despues.transport_collected_at).toBe(antes.transport_collected_at)

    expect((await paso(id, driverA, 'accept')).error).toBeNull()
    await paso(id, driverA, 'deliver')
    expect((await paso(id, driverA, 'deliver')).error).toBeNull()
  })

  it('tope por motorizado: la tercera aceptación se rechaza, también en simultáneo', async () => {
    const ids = [await crear(), await crear(), await crear()]
    const resultados = await Promise.all(ids.map((id) => paso(id, driverA, 'accept')))
    const ok = resultados.filter((r) => r.error === null)
    const llenos = resultados.filter((r) => r.error?.message.includes('courier_driver_full'))
    expect(ok).toHaveLength(2)
    expect(llenos).toHaveLength(1)

    // Otro motorizado sí puede tomar la que quedó.
    const libre = ids.find((_, i) => resultados[i]?.error !== null) as string
    expect((await paso(libre, driverB, 'accept')).error).toBeNull()
  })

  it('una entrega entregada libera cupo en el tope', async () => {
    await patchCourierSettings({ maxActivePerDriver: 1 })
    const a = await crear()
    const b = await crear()
    await paso(a, driverA, 'accept')
    expect((await paso(b, driverA, 'accept')).error?.message).toContain('courier_driver_full')
    await paso(a, driverA, 'pick_up')
    await paso(a, driverA, 'deliver', { payment: 'cash' })
    expect((await paso(b, driverA, 'accept')).error).toBeNull()
  })

  it('no se puede soltar una entrega ya cobrada', async () => {
    const id = await crear('destination')
    await paso(id, driverA, 'accept')
    expect((await paso(id, driverA, 'release')).error).toBeNull()
    expect((await leer(id)).status).toBe('requested')

    const otra = await crear('origin')
    await paso(otra, driverA, 'accept')
    await paso(otra, driverA, 'pick_up', { payment: 'cash' })
    const soltar = await paso(otra, driverA, 'release')
    expect(soltar.error?.message).toMatch(/courier_release_after_collect|courier_cannot_release/)
    expect((await leer(otra)).driver_id).not.toBeNull()
  })

  it('«No se pudo» exige un motivo del motorizado y cancela', async () => {
    const id = await crear()
    await paso(id, driverA, 'accept')
    const motivoAjeno = await paso(id, driverA, 'fail', { reason: 'no_driver' })
    expect(motivoAjeno.error?.message).toContain('courier_cancel_reason_required')

    expect((await paso(id, driverA, 'fail', { reason: 'not_ready' })).error).toBeNull()
    const fila = await leer(id)
    expect(fila.status).toBe('cancelled')
    expect(fila.cancel_reason).toBe('not_ready')
  })

  it('un motorizado no puede tocar la entrega de otro', async () => {
    const id = await crear()
    await paso(id, driverA, 'accept')
    for (const step of ['pick_up', 'deliver', 'fail', 'release']) {
      const r = await paso(id, driverB, step, { reason: 'other', payment: 'cash' })
      expect(r.error?.message, step).toContain('courier_not_found')
    }
    expect((await leer(id)).driver_id).not.toBeNull()
    expect((await leer(id)).status).toBe('accepted')
  })
})

describe('create_courier_order (0235)', () => {
  let customer: CourierCustomer
  let driver: CourierDriver

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driver = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
    await patchCourierSettings({ maxActivePerPhone: 1, unlimitedRequesterUserIds: [] })
  })

  afterEach(async () => {
    await cleanupCourier({ customerUserIds: [customer.userId], driverUserIds: [driver.userId] })
  })

  it('fuerza «listo ahora» aunque el cliente mande minutos', async () => {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      readyInMin: 45,
    })
    expect(error).toBeNull()
    expect((await leer((data as { id: string }).id)).ready_in_min).toBe(0)
  })

  it('la cuenta de WhatsApp de Jesús no tiene límite por teléfono; las demás sí', async () => {
    const primero = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(primero.error).toBeNull()
    const segundo = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(segundo.error?.message).toContain('courier_active_limit')

    await patchCourierSettings({ unlimitedRequesterUserIds: [customer.userId] })
    const tercero = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    expect(tercero.error).toBeNull()
  })
})

describe('0235 · correcciones de la auditoría', () => {
  let customer: CourierCustomer
  let driver: CourierDriver

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driver = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
    await patchCourierSettings({
      maxActivePerPhone: 1,
      maxActivePerDriver: 2,
      unlimitedRequesterUserIds: [],
    })
  })

  afterEach(async () => {
    await cleanupCourier({ customerUserIds: [customer.userId], driverUserIds: [driver.userId] })
  })

  it('dos solicitudes simultáneas del mismo celular: entra una sola', async () => {
    const [a, b] = await Promise.all([
      callCreateCourierOrder({ customerUserId: customer.userId, requesterPhone: customer.phone }),
      callCreateCourierOrder({ customerUserId: customer.userId, requesterPhone: customer.phone }),
    ])
    const ok = [a, b].filter((r) => r.error === null)
    const limit = [a, b].filter((r) => r.error?.message.includes('courier_active_limit'))
    expect(ok).toHaveLength(1)
    expect(limit).toHaveLength(1)
  })

  it('«Soltar» repetido tras perder la respuesta no da error', async () => {
    const { data } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
    })
    const id = (data as { id: string }).id
    await paso(id, driver, 'accept')
    expect((await paso(id, driver, 'release')).error).toBeNull()
    const repetido = await paso(id, driver, 'release')
    expect(repetido.error).toBeNull()
    expect((await leer(id)).status).toBe('requested')
  })
})
