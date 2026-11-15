/**
 * Test de INTEGRACIÓN: la cancelación automática escribe en el outbox — migración 0287.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321), bajo el candado (`pnpm db:cycle`).
 *
 * QUÉ PROTEGE
 * `cancel_expired_prepay_orders()` cancelaba con un UPDATE y no escribía en `domain_events`
 * (invariante 4): sin push al cliente cuando el pg_cron ganaba a `expire_order`. Ahora cada
 * pedido cancelado emite UN `OrderExpired` con `{ reason }`, en la misma transacción.
 *
 * Los asserts miran solo los pedidos que siembra este fichero (la función barre toda la tabla).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  backdateTimestamp,
  cleanup,
  localClient,
  type SeededOrder,
  seedPrepaidOrder,
} from './helpers/local-db'

async function barrer(): Promise<void> {
  const { error } = await localClient.rpc('cancel_expired_prepay_orders')
  if (error) throw new Error(`cancel_expired_prepay_orders failed: ${error.message}`)
}

async function estado(orderId: string): Promise<{ status: string; cancel_reason: string | null }> {
  const { data, error } = await localClient
    .from('orders')
    .select('status, cancel_reason')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`estado failed: ${error.message}`)
  return data
}

async function eventos(orderId: string) {
  const { data, error } = await localClient
    .from('domain_events')
    .select('event_type, aggregate_type, payload')
    .eq('aggregate_id', orderId)
  if (error) throw new Error(`eventos failed: ${error.message}`)
  return data ?? []
}

async function envejecer(orderId: string, columna: string, minutos: number): Promise<void> {
  const { data, error } = await localClient
    .from('orders')
    .select(columna)
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`envejecer failed: ${error.message}`)
  const marca = (data as unknown as Record<string, string | null>)[columna]
  if (!marca) throw new Error(`la columna ${columna} vino NULL`)
  await backdateTimestamp(orderId, columna, marca, minutos)
}

describe('cancel_expired_prepay_orders — emite OrderExpired (integración)', () => {
  let impago: SeededOrder
  let sinAceptar: SeededOrder
  let vigente: SeededOrder

  beforeAll(async () => {
    impago = await seedPrepaidOrder({ status: 'awaiting_payment' })
    await envejecer(impago.orderId, 'awaiting_payment_at', 60)
    sinAceptar = await seedPrepaidOrder({ status: 'pending_acceptance' })
    await envejecer(sinAceptar.orderId, 'pending_acceptance_at', 60)
    vigente = await seedPrepaidOrder({ status: 'awaiting_payment' })
    await barrer()
  })

  afterAll(async () => {
    await cleanup(impago)
    await cleanup(sinAceptar)
    await cleanup(vigente)
  })

  it('un prepago sin pagar vencido queda cancelado y emite exactamente un OrderExpired', async () => {
    expect(await estado(impago.orderId)).toEqual({
      status: 'cancelled',
      cancel_reason: 'prepay_timeout',
    })
    const ev = await eventos(impago.orderId)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.event_type).toBe('OrderExpired')
    expect(ev[0]?.aggregate_type).toBe('order')
    expect(ev[0]?.payload).toEqual({ reason: 'prepay_timeout' })
  })

  it('el bloque de aceptación también emite, con su motivo', async () => {
    expect((await estado(sinAceptar.orderId)).status).toBe('cancelled')
    const ev = await eventos(sinAceptar.orderId)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.payload).toEqual({ reason: 'pending_acceptance_timeout' })
  })

  it('un pedido vigente no se toca y no emite nada', async () => {
    expect((await estado(vigente.orderId)).status).toBe('awaiting_payment')
    expect(await eventos(vigente.orderId)).toHaveLength(0)
  })

  it('una segunda pasada no repite el evento', async () => {
    await barrer()
    expect(await eventos(impago.orderId)).toHaveLength(1)
    expect(await eventos(sinAceptar.orderId)).toHaveLength(1)
    expect(await eventos(vigente.orderId)).toHaveLength(0)
  })
})
