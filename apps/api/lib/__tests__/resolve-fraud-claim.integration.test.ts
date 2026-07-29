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
 *   (C) balance_due DESPUÉS = balance_due ANTES + amount  [campo DEPRECADO]
 *   (D) deuda agregada del ledger DESPUÉS = ANTES + amount  ← fuente de verdad (§2.2)
 *
 * (C) y (D) miden lo mismo por dos vías distintas mientras `balance_due` siga
 * existiendo. (D) es el que sobrevive cuando se retire el campo deprecado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  cleanup,
  localClient,
  seedFraudClaim,
  sumPendingLedgerDebt,
  type SeedResult,
} from './helpers/local-db'

describe('resolve_fraud_claim — invariante contable (integración)', () => {
  let seed: SeedResult
  let balanceBefore: number
  let ledgerDebtBefore: number
  let ledgerDebtAfter: number

  beforeAll(async () => {
    // Seed: business + order + claim pending (monto 20.00)
    seed = await seedFraudClaim(20.0)

    // Capturar balance_due ANTES de aprobar (campo deprecado, ver assert C)
    const { data: bizBefore, error: bizErr } = await localClient
      .from('businesses')
      .select('balance_due')
      .eq('id', seed.businessId)
      .single()
    if (bizErr) throw new Error(`read balance_due before: ${bizErr.message}`)
    balanceBefore = Number(bizBefore.balance_due)

    // Capturar la deuda agregada desde el LEDGER ANTES de aprobar (fuente de verdad)
    ledgerDebtBefore = await sumPendingLedgerDebt(seed.businessId)

    // Aprobar el claim via RPC
    const { error: rpcErr } = await localClient.rpc('resolve_fraud_claim', {
      p_claim_id: seed.claimId,
      p_resolver: seed.userId,
      p_approve: true,
      p_note: 'Aprobado en test de integración',
    })
    if (rpcErr) throw new Error(`resolve_fraud_claim RPC failed: ${rpcErr.message}`)

    // Recalcular la deuda agregada DESPUÉS de aprobar
    ledgerDebtAfter = await sumPendingLedgerDebt(seed.businessId)
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
  // ⚠️  `balance_due` está DEPRECADO (AGENTS.md §2.2): la fuente de verdad de la
  //     deuda es el ledger `business_charges`, no este campo. Se mantiene el assert
  //     mientras la columna siga viva y la RPC siga escribiéndola, para que una
  //     regresión no pase inadvertida. El invariante real lo cubre el assert (D):
  //     si algún día se retira `balance_due`, este assert se borra y (D) se queda.
  it('(C) balance_due sube exactamente en el monto del claim [campo deprecado]', async () => {
    const { data: bizAfter, error } = await localClient
      .from('businesses')
      .select('balance_due')
      .eq('id', seed.businessId)
      .single()

    expect(error).toBeNull()
    const balanceAfter = Number(bizAfter!.balance_due)
    expect(balanceAfter).toBe(balanceBefore + seed.amount)
  })

  // ── Assert (D): la deuda agregada del LEDGER subió exactamente el monto ─────
  // Fuente de verdad según AGENTS.md §2.2. Mide la deuda como la mide
  // `settle_business_charges`: sum(amount) sobre business_charges del negocio con
  // status='pending' (sin filtrar por charge_type). Es el invariante que sobrevive
  // aunque `balance_due` desaparezca.
  it('(D) la deuda agregada del ledger sube exactamente en el monto del claim', () => {
    expect(ledgerDebtAfter).toBe(ledgerDebtBefore + seed.amount)
  })
})
