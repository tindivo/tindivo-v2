/**
 * Test de INTEGRACIÓN de la deuda de Entregas con Tindivo (migración 0237):
 * el motorizado rinde lo que cobró por cada entrega (`driver_remit_courier_fee`)
 * y Jesús, el admin, lo confirma (`admin_confirm_courier_remittance`).
 *
 * El mismo camino que el efectivo de la comida —el motorizado toca
 * «Entregar» y otro lo confirma—, pero aquí cuenta TODO lo cobrado, también
 * lo de Yape: el Yape entra al QR del motorizado, así que también lo debe.
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

interface Fila {
  remitted_at: string | null
  remittance_confirmed_at: string | null
  remittance_confirmed_by: string | null
}

async function leer(id: string): Promise<Fila> {
  const { data, error } = await localClient
    .from('courier_orders')
    .select('remitted_at, remittance_confirmed_at, remittance_confirmed_by')
    .eq('id', id)
    .single()
  if (error) throw new Error(`leer(${id}) falló: ${error.message}`)
  return data as unknown as Fila
}

function paso(id: string, driver: CourierDriver, step: string, payment?: 'cash' | 'yape') {
  return localClient.rpc('driver_courier_step', {
    p_courier_order_id: id,
    p_actor_user_id: driver.userId,
    p_step: step,
    p_payment_method: payment ?? (null as unknown as string),
    p_cancel_reason: null as unknown as 'other',
  })
}

function rendir(id: string, driver: CourierDriver) {
  return localClient.rpc('driver_remit_courier_fee', {
    p_courier_order_id: id,
    p_actor_user_id: driver.userId,
  })
}

function confirmar(id: string, actorUserId: string) {
  return localClient.rpc('admin_confirm_courier_remittance', {
    p_courier_order_id: id,
    p_actor_user_id: actorUserId,
  })
}

async function seedAdmin(): Promise<string> {
  const { data, error } = await localClient.auth.admin.createUser({
    email: `courier-admin-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Jesús Test' },
  })
  if (error) throw new Error(`seed admin falló: ${error.message}`)
  const { error: roleErr } = await localClient
    .from('user_roles')
    .insert({ user_id: data.user.id, role: 'admin' })
  if (roleErr) throw new Error(`seed admin rol falló: ${roleErr.message}`)
  return data.user.id
}

describe('deuda de Entregas con Tindivo', () => {
  let customer: CourierCustomer
  let driverA: CourierDriver
  let driverB: CourierDriver
  let adminId: string

  async function entregada(payment: 'cash' | 'yape' = 'yape'): Promise<string> {
    const { data, error } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      payer: 'destination',
    })
    if (error) throw new Error(`crear falló: ${error.message}`)
    const id = (data as { id: string }).id
    await paso(id, driverA, 'accept')
    await paso(id, driverA, 'pick_up')
    const fin = await paso(id, driverA, 'deliver', payment)
    if (fin.error) throw new Error(`entregar falló: ${fin.error.message}`)
    return id
  }

  beforeEach(async () => {
    customer = await seedCourierCustomer()
    driverA = await seedCourierDriver({ available: true })
    driverB = await seedCourierDriver({ available: true })
    adminId = await seedAdmin()
    await setCourierEnabled(true)
    await patchCourierSettings({ maxActivePerPhone: 10, maxActivePerDriver: 2 })
  })

  afterEach(async () => {
    await cleanupCourier({
      customerUserIds: [customer.userId],
      driverUserIds: [driverA.userId, driverB.userId],
    })
    await localClient.from('users').delete().eq('id', adminId)
    await localClient.auth.admin.deleteUser(adminId)
  })

  it('lo cobrado por Yape también se rinde, y Jesús lo confirma', async () => {
    const id = await entregada('yape')

    expect((await rendir(id, driverA)).error).toBeNull()
    const rendida = await leer(id)
    expect(rendida.remitted_at).not.toBeNull()
    expect(rendida.remittance_confirmed_at).toBeNull()

    expect((await confirmar(id, adminId)).error).toBeNull()
    const confirmada = await leer(id)
    expect(confirmada.remittance_confirmed_at).not.toBeNull()
    expect(confirmada.remittance_confirmed_by).toBe(adminId)
  })

  it('repetir «Entregar» o «Confirmar» no falla ni mueve las horas', async () => {
    const id = await entregada('cash')
    await rendir(id, driverA)
    const antes = await leer(id)
    expect((await rendir(id, driverA)).error).toBeNull()
    expect((await leer(id)).remitted_at).toBe(antes.remitted_at)

    await confirmar(id, adminId)
    const confirmada = await leer(id)
    expect((await confirmar(id, adminId)).error).toBeNull()
    expect((await leer(id)).remittance_confirmed_at).toBe(confirmada.remittance_confirmed_at)
  })

  it('no se rinde lo que no se cobró', async () => {
    const { data } = await callCreateCourierOrder({
      customerUserId: customer.userId,
      requesterPhone: customer.phone,
      payer: 'destination',
    })
    const id = (data as { id: string }).id
    await paso(id, driverA, 'accept')
    const r = await rendir(id, driverA)
    expect(r.error?.message).toContain('courier_not_collected')
  })

  it('un motorizado no puede rendir la entrega de otro', async () => {
    const id = await entregada('yape')
    const r = await rendir(id, driverB)
    expect(r.error?.message).toContain('courier_not_found')
    expect((await leer(id)).remitted_at).toBeNull()
  })

  it('Jesús no confirma lo que el motorizado aún no entregó', async () => {
    const id = await entregada('yape')
    const r = await confirmar(id, adminId)
    expect(r.error?.message).toContain('courier_not_remitted')
  })

  it('solo un admin confirma', async () => {
    const id = await entregada('yape')
    await rendir(id, driverA)
    const r = await confirmar(id, driverA.userId)
    expect(r.error?.message).toContain('courier_not_admin')
    expect((await leer(id)).remittance_confirmed_at).toBeNull()
  })
})
