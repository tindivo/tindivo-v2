/**
 * Test de INTEGRACIÓN del outbox de Tindivo Entregas (migración 0238): los
 * pasos de una entrega con destinatario humano llegan a `domain_events` como
 * `CourierStepped`, en la misma transacción, y los intermedios no.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
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

async function acciones(courierOrderId: string): Promise<string[]> {
  const { data, error } = await localClient
    .from('domain_events')
    .select('payload, occurred_at')
    .eq('aggregate_type', 'courier_order')
    .eq('aggregate_id', courierOrderId)
    .eq('event_type', 'CourierStepped')
    .order('occurred_at')
  if (error) throw new Error(`domain_events falló: ${error.message}`)
  return (data ?? []).map((r) => (r.payload as { action: string }).action)
}

describe('outbox de Tindivo Entregas', () => {
  let customer: CourierCustomer
  let driver: CourierDriver
  const creadas: string[] = []

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driver = await seedCourierDriver({ available: true })
    await setCourierEnabled(true)
    await patchCourierSettings({ maxActivePerPhone: 10, maxActivePerDriver: 2 })
  })

  afterEach(async () => {
    if (creadas.length) {
      await localClient.from('domain_events').delete().in('aggregate_id', creadas)
      creadas.length = 0
    }
    await cleanupCourier({
      customerUserIds: [customer.userId],
      driverUserIds: [driver.userId],
    })
  })

  async function crear(): Promise<string> {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      payer: 'destination',
    })
    if (error) throw new Error(`crear falló: ${error.message}`)
    const id = (data as { id: string }).id
    creadas.push(id)
    return id
  }

  function paso(id: string, step: string, payment?: 'cash' | 'yape') {
    return localClient.rpc('driver_courier_step', {
      p_courier_order_id: id,
      p_actor_user_id: driver.userId,
      p_step: step,
      p_payment_method: payment ?? (null as unknown as string),
      p_cancel_reason: null as unknown as 'other',
    })
  }

  it('el ciclo completo deja solo los pasos que alguien espera', async () => {
    const id = await crear()
    expect((await paso(id, 'accept')).error).toBeNull()
    expect((await paso(id, 'pick_up')).error).toBeNull()
    expect((await paso(id, 'deliver', 'cash')).error).toBeNull()

    // Sin `depart`/`arrive`/`depart_dropoff`/`collect_transport`: «Recogido»
    // y «Entregado» los disparan seguidos y serían pushes de más.
    expect(await acciones(id)).toEqual(['requested', 'accept', 'pick_up', 'deliver'])
  })

  it('soltar la entrega la vuelve a anunciar, con quién la soltó', async () => {
    const id = await crear()
    expect((await paso(id, 'accept')).error).toBeNull()
    expect((await paso(id, 'release')).error).toBeNull()

    expect(await acciones(id)).toEqual(['requested', 'accept', 'release'])
    const { data } = await localClient
      .from('domain_events')
      .select('payload')
      .eq('aggregate_id', id)
      .eq('event_type', 'CourierStepped')
      .eq('payload->>action', 'release')
      .single()
    expect((data?.payload as { actorUserId: string }).actorUserId).toBe(driver.userId)
  })

  it('un paso que falla no deja evento en el outbox', async () => {
    const id = await crear()
    expect((await paso(id, 'accept')).error).toBeNull()
    expect((await paso(id, 'pick_up')).error).toBeNull()
    // Paga quien recibe y no dice cómo: la transacción entera se deshace.
    expect((await paso(id, 'deliver')).error?.message).toContain('courier_payment_method_required')

    expect(await acciones(id)).toEqual(['requested', 'accept', 'pick_up'])
  })
})
