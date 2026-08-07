import { describe, expect, it } from 'vitest'
import { cleanup, E2E, localClient, seedContraentregaOrder } from './helpers/local-db'

describe('Traspasos y Soltar Pedido (Release)', () => {
  it('T1 Expiración: al expirar la solicitud de traspaso, el pedido SE QUEDA con el dueño original', async () => {
    // 1. Crear un pedido en heading_to_restaurant asignado al driver 1
    const seeded = await seedContraentregaOrder(E2E.BUSINESS_ID)
    const orderId = seeded.orderId
    const supabase = localClient

    try {
      // Avanzar pedido a heading_to_restaurant con driver 1 (E2E.DRIVER_USER_ID)
      const { error: takeErr } = await supabase.rpc('advance_order', {
        p_order_id: orderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'take',
      })
      expect(takeErr).toBeNull()

      // Verificar driver_id original
      const { data: oBefore } = await supabase
        .from('orders')
        .select('driver_id, status')
        .eq('id', orderId)
        .single()
      expect(oBefore?.driver_id).toBe(E2E.DRIVER_ID)
      expect(oBefore?.status).toBe('heading_to_restaurant')

      // 2. Driver 2 (E2E.DRIVER_2_USER_ID) pide el traspaso del pedido
      const { data: xferRes, error: xferErr } = await supabase.rpc('request_order_transfer', {
        p_to_driver_user_id: E2E.DRIVER_2_USER_ID,
        p_order_id: orderId,
        p_reason: 'Por favor pásamelo',
      })
      expect(xferErr).toBeNull()
      const reqId = (xferRes as { id: string }).id
      expect(reqId).toBeTruthy()

      // Verificar solicitud pending
      const { data: reqPending } = await supabase
        .from('order_transfer_requests')
        .select('status, from_driver_id, to_driver_id')
        .eq('id', reqId)
        .single()
      expect(reqPending?.status).toBe('pending')
      expect(reqPending?.from_driver_id).toBe(E2E.DRIVER_ID)
      expect(reqPending?.to_driver_id).toBe(E2E.DRIVER_2_ID)

      // 3. Simular expiración de la solicitud
      const { data: reqRow } = await supabase
        .from('order_transfer_requests')
        .select('*')
        .eq('id', reqId)
        .single()

      const { error: expireErr } = await supabase.rpc('apply_order_transfer', {
        p_req: reqRow,
        p_final: 'expired',
      })
      expect(expireErr).toBeNull()

      // 4. Verificar que la solicitud pasó a 'expired' PERO el pedido SE QUEDÓ con el dueño original
      const { data: reqExpired } = await supabase
        .from('order_transfer_requests')
        .select('status')
        .eq('id', reqId)
        .single()
      expect(reqExpired?.status).toBe('expired')

      const { data: oAfter } = await supabase
        .from('orders')
        .select('driver_id')
        .eq('id', orderId)
        .single()
      expect(oAfter?.driver_id).toBe(E2E.DRIVER_ID)
    } finally {
      await cleanup(seeded)
    }
  })

  it('T2 Release: soltar pedido desasigna el driver, deja appears_in_queue_at intacto e invalida traspasos pendientes', async () => {
    const seeded = await seedContraentregaOrder(E2E.BUSINESS_ID)
    const testOrderId = seeded.orderId
    const supabase = localClient

    try {
      // Tomar pedido por driver 1
      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'take',
      })

      // Crear una solicitud de traspaso pendiente por driver 2
      const { data: xferRes } = await supabase.rpc('request_order_transfer', {
        p_to_driver_user_id: E2E.DRIVER_2_USER_ID,
        p_order_id: testOrderId,
        p_reason: 'Prueba soltar',
      })
      const reqId = (xferRes as { id: string }).id

      // Guardar aparece_in_queue_at antes de soltar
      const { data: beforeOrder } = await supabase
        .from('orders')
        .select('appears_in_queue_at, driver_id')
        .eq('id', testOrderId)
        .single()
      expect(beforeOrder?.driver_id).toBe(E2E.DRIVER_ID)

      // Intento A: Soltar sin motivo debe fallar
      const { error: errNoReason } = await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'release',
        p_params: {},
      })
      expect(errNoReason).not.toBeNull()
      expect(errNoReason?.message).toMatch(/Motivo de liberación es obligatorio/)

      // Intento B: Soltar con motivo válido 'averia'
      const { error: releaseErr } = await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'release',
        p_params: { reason: 'averia', note: 'Se me punzó la llanta' },
      })
      expect(releaseErr).toBeNull()

      // Verificar tras soltar:
      // - driver_id es NULL
      // - appears_in_queue_at no cambió
      // - solicitud de traspaso pasó a 'invalidated'
      const { data: afterOrder } = await supabase
        .from('orders')
        .select('driver_id, status, appears_in_queue_at')
        .eq('id', testOrderId)
        .single()

      expect(afterOrder?.driver_id).toBeNull()
      expect(afterOrder?.appears_in_queue_at).toBe(beforeOrder?.appears_in_queue_at)

      const { data: reqInv } = await supabase
        .from('order_transfer_requests')
        .select('status')
        .eq('id', reqId)
        .single()
      expect(reqInv?.status).toBe('invalidated')
    } finally {
      await cleanup(seeded)
    }
  })

  it('T2 Release Rechazado: no se permite soltar desde picked_up', async () => {
    const seeded = await seedContraentregaOrder(E2E.BUSINESS_ID)
    const testOrderId = seeded.orderId
    const supabase = localClient

    try {
      // Driver 1 toma, llega al local y recoge el pedido
      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'take',
      })
      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'arrived',
      })
      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'pickup',
        p_params: { band: 'near', slots: 1 },
      })

      // Intentar soltar en picked_up
      const { error: releaseErr } = await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'release',
        p_params: { reason: 'emergencia' },
      })

      expect(releaseErr).not.toBeNull()
      expect(releaseErr?.message).toMatch(/No puedes soltar un pedido que ya recogiste/)
    } finally {
      await cleanup(seeded)
    }
  })

  it('T3 Recorrido completo tras soltar: otro motorizado lo toma y entrega con cargos correctos', async () => {
    const seeded = await seedContraentregaOrder(E2E.BUSINESS_ID)
    const testOrderId = seeded.orderId
    const supabase = localClient

    try {
      // 1. Driver 1 toma y suelta
      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'take',
      })
      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'release',
        p_params: { reason: 'muy_lejos' },
      })

      // 2. Driver 2 lo toma del pool y completa la entrega
      const { error: take2Err } = await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_2_USER_ID,
        p_actor_role: 'driver',
        p_action: 'take',
      })
      expect(take2Err).toBeNull()

      await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_2_USER_ID,
        p_actor_role: 'driver',
        p_action: 'arrived',
      })

      const { error: pickupErr } = await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_2_USER_ID,
        p_actor_role: 'driver',
        p_action: 'pickup',
        p_params: { band: 'near', slots: 1 },
      })
      expect(pickupErr).toBeNull()

      const { error: deliverErr } = await supabase.rpc('advance_order', {
        p_order_id: testOrderId,
        p_actor_user_id: E2E.DRIVER_2_USER_ID,
        p_actor_role: 'driver',
        p_action: 'deliver',
        p_params: { paymentReal: 'paid_cash' },
      })
      expect(deliverErr).toBeNull()

      // 3. Verificar estado delivered y cargos correctos:
      // delivery_fee_charged = 2.00, commission_amount = 1.50, tindivo_commission = 3.50
      const { data: finalOrder } = await supabase
        .from('orders')
        .select('status, driver_id, tindivo_commission, commission_amount, delivery_fee_charged')
        .eq('id', testOrderId)
        .single()

      expect(finalOrder?.status).toBe('delivered')
      expect(finalOrder?.driver_id).toBe(E2E.DRIVER_2_ID)
      expect(Number(finalOrder?.delivery_fee_charged)).toBe(2.0)
      expect(Number(finalOrder?.commission_amount)).toBe(1.5)
      expect(Number(finalOrder?.tindivo_commission)).toBe(3.5)
    } finally {
      await cleanup(seeded)
    }
  })
})
