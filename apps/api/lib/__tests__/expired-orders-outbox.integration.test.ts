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

describe('cancel_expired_prepay_orders — bloques 3 y 4 emiten OrderExpired (integración)', () => {
  let contraentrega: SeededOrder
  let contraentregaVigente: SeededOrder
  let conComprobante: SeededOrder
  let conComprobanteVigente: SeededOrder

  beforeAll(async () => {
    // Bloque 3: contraentrega en validación antifraude, vencida (> 5 min).
    contraentrega = await seedPrepaidOrder({
      status: 'validando',
      paymentIntent: 'pending_cash',
      validationContext: 'antifraud',
    })
    await envejecer(contraentrega.orderId, 'validating_at', 60)
    contraentregaVigente = await seedPrepaidOrder({
      status: 'validando',
      paymentIntent: 'pending_cash',
      validationContext: 'antifraud',
    })
    // Bloque 4: prepago con comprobante pendiente de revisar, vencido (> 10 min).
    conComprobante = await seedPrepaidOrder({
      status: 'validando',
      validationContext: 'proof',
      proofAttempt: 1,
      paymentProofStatus: 'pending',
    })
    await envejecer(conComprobante.orderId, 'validating_at', 60)
    conComprobanteVigente = await seedPrepaidOrder({
      status: 'validando',
      validationContext: 'proof',
      proofAttempt: 1,
      paymentProofStatus: 'pending',
    })
    await barrer()
  })

  afterAll(async () => {
    await cleanup(contraentrega)
    await cleanup(contraentregaVigente)
    await cleanup(conComprobante)
    await cleanup(conComprobanteVigente)
  })

  it('bloque 3: contraentrega sin validar queda cancelada y emite un OrderExpired validation_timeout', async () => {
    expect(await estado(contraentrega.orderId)).toEqual({
      status: 'cancelled',
      cancel_reason: 'validation_timeout',
    })
    const ev = await eventos(contraentrega.orderId)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.event_type).toBe('OrderExpired')
    expect(ev[0]?.aggregate_type).toBe('order')
    expect(ev[0]?.payload).toEqual({ reason: 'validation_timeout' })
  })

  it('bloque 4: comprobante sin revisar queda cancelado y emite un OrderExpired prepay_timeout', async () => {
    expect(await estado(conComprobante.orderId)).toEqual({
      status: 'cancelled',
      cancel_reason: 'prepay_timeout',
    })
    const ev = await eventos(conComprobante.orderId)
    expect(ev).toHaveLength(1)
    expect(ev[0]?.event_type).toBe('OrderExpired')
    expect(ev[0]?.aggregate_type).toBe('order')
    expect(ev[0]?.payload).toEqual({ reason: 'prepay_timeout' })
  })

  it('los controles vigentes de ambos bloques no se tocan y no emiten nada', async () => {
    expect((await estado(contraentregaVigente.orderId)).status).toBe('validando')
    expect(await eventos(contraentregaVigente.orderId)).toHaveLength(0)
    expect((await estado(conComprobanteVigente.orderId)).status).toBe('validando')
    expect(await eventos(conComprobanteVigente.orderId)).toHaveLength(0)
  })

  it('una segunda pasada no emite nada nuevo en ninguno de los cuatro', async () => {
    await barrer()
    expect(await eventos(contraentrega.orderId)).toHaveLength(1)
    expect(await eventos(conComprobante.orderId)).toHaveLength(1)
    expect(await eventos(contraentregaVigente.orderId)).toHaveLength(0)
    expect(await eventos(conComprobanteVigente.orderId)).toHaveLength(0)
  })
})
