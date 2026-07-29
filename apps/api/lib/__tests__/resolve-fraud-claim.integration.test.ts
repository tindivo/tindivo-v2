/**
 * Test de INTEGRACIÓN: invariante contable de resolve_fraud_claim.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 * DEBE SALIR ROJO con el código actual: la RPC inserta contingency_advances
 * con actor_charged='tindivo', pero el invariante correcto es 'restaurante'.
 *
 * Asserts:
 *   (A) contingency_advances tiene 1 fila con actor_charged = 'restaurante'  ← FALLA HOY
 *   (B) business_charges tiene 1 fila con charge_type = 'refund_charge', amount correcto
 *   (C) balance_due DESPUÉS = balance_due ANTES + amount (sube exactamente una vez)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient, seedFraudClaim, type SeedResult } from './helpers/local-db'

describe('resolve_fraud_claim — invariante contable (integración)', () => {
  let seed: SeedResult
  let balanceBefore: number

  beforeAll(async () => {
    // Seed: business + order + claim pending (monto 20.00)
    seed = await seedFraudClaim(20.0)

    // Capturar balance_due ANTES de aprobar
    const { data: bizBefore, error: bizErr } = await localClient
      .from('businesses')
      .select('balance_due')
      .eq('id', seed.businessId)
      .single()
    if (bizErr) throw new Error(`read balance_due before: ${bizErr.message}`)
    balanceBefore = Number(bizBefore.balance_due)

    // Aprobar el claim via RPC
    const { error: rpcErr } = await localClient.rpc('resolve_fraud_claim', {
      p_claim_id: seed.claimId,
      p_resolver: seed.userId,
      p_approve: true,
      p_note: 'Aprobado en test de integración',
    })
    if (rpcErr) throw new Error(`resolve_fraud_claim RPC failed: ${rpcErr.message}`)
  })

  afterAll(async () => {
    if (seed) await cleanup(seed)
  })

  // ── Assert (A): contingency_advances usa actor_charged = 'restaurante' ──────
  // ESTE TEST DEBE FALLAR con el código actual (inserta 'tindivo').
  it('(A) contingency_advances registra actor_charged = restaurante', async () => {
    const { data, error } = await localClient
      .from('contingency_advances')
      .select('actor_charged, amount, status')
      .eq('order_id', seed.orderId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].actor_charged).toBe('restaurante')
    expect(Number(data![0].amount)).toBe(seed.amount)
    expect(data![0].status).toBe('activo')
  })

  // ── Assert (B): business_charges tiene el refund_charge correcto ────────────
  it('(B) business_charges registra refund_charge con monto correcto', async () => {
    const { data, error } = await localClient
      .from('business_charges')
      .select('charge_type, amount, status, business_id')
      .eq('order_id', seed.orderId)
      .eq('charge_type', 'refund_charge')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].charge_type).toBe('refund_charge')
    expect(Number(data![0].amount)).toBe(seed.amount)
    expect(data![0].status).toBe('pending')
    expect(data![0].business_id).toBe(seed.businessId)
  })

  // ── Assert (C): balance_due subió exactamente una vez ───────────────────────
  it('(C) balance_due sube exactamente en el monto del claim', async () => {
    const { data: bizAfter, error } = await localClient
      .from('businesses')
      .select('balance_due')
      .eq('id', seed.businessId)
      .single()

    expect(error).toBeNull()
    const balanceAfter = Number(bizAfter!.balance_due)
    expect(balanceAfter).toBe(balanceBefore + seed.amount)
  })
})
