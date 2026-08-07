import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient, seedContraentregaOrder } from './helpers/local-db'

describe('settle_business_charges — verificación de liquidación de cargos de negocio', () => {
  let seedResult: SeedResult
  let businessId: string
  let adminUserId: string
  let chargeId: string
  const chargeAmount = 15.5

  beforeAll(async () => {
    // Seed: pedido y negocio
    seedResult = await seedContraentregaOrder()
    businessId = seedResult.businessId
    adminUserId = seedResult.driverUserId

    // Insertar un cargo de negocio pendiente en business_charges
    const { data: charge, error: chargeErr } = await localClient
      .from('business_charges')
      .insert({
        business_id: businessId,
        order_id: seedResult.orderId,
        charge_type: 'commission',
        amount: chargeAmount,
        status: 'pending',
        description: 'Cargo de prueba para liquidación',
      })
      .select('id')
      .single()

    if (chargeErr) throw new Error(`Error creando cargo de prueba: ${chargeErr.message}`)
    chargeId = charge.id
  })

  afterAll(async () => {
    if (seedResult) await cleanup(seedResult)
  })

  it('liquidación de cargo cambia status a settled y crea un registro en restaurant_payments', async () => {
    // Ejecutar RPC settle_business_charges
    const { data, error } = await localClient.rpc('settle_business_charges', {
      p_business_id: businessId,
      p_charge_ids: [chargeId],
      p_total_amount: chargeAmount,
      p_payment_method: 'yape',
      p_note: 'Pago de prueba Priamo',
      p_admin_user_id: adminUserId,
    })

    expect(error).toBeNull()
    expect(data).toBeDefined()

    // 1. Confirmar que el cargo en business_charges cambió a 'settled'
    const { data: updatedCharge, error: checkErr } = await localClient
      .from('business_charges')
      .select('status, payment_id')
      .eq('id', chargeId)
      .single()

    expect(checkErr).toBeNull()
    expect(updatedCharge.status).toBe('settled')
    expect(updatedCharge.payment_id).toBeDefined()

    // 2. Confirmar que se creó la entrada en restaurant_payments
    const { data: payment, error: payErr } = await localClient
      .from('restaurant_payments')
      .select('id, amount, payment_method, note')
      .eq('id', updatedCharge.payment_id)
      .single()

    expect(payErr).toBeNull()
    expect(Number(payment.amount)).toBe(chargeAmount)
    expect(payment.payment_method).toBe('yape')
    expect(payment.note).toBe('Pago de prueba Priamo')
  })
})
