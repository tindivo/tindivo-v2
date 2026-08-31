/**
 * Test de INTEGRACIÓN: invariante contable de resolve_fraud_claim.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 *
 * El assert (A) —que `contingency_advances` registrara actor_charged =
 * 'restaurante'— se eliminó en la migración 0123: esa tabla ya no existe y
 * `resolve_fraud_claim` escribe solo en el ledger. Con él se va la nota de
 * "DEBE SALIR ROJO", que además llevaba obsoleta desde 0102 (el FIX #5 ya
 * estaba aplicado y el test pasaba en verde). Ver M-4 en Docs/RIESGOS-LEDGER.md.
 *
 * Asserts:
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
  type SeedResult,
  seedFraudClaim,
  sumPendingLedgerDebt,
} from './helpers/local-db'
import { requirePresent } from './helpers/require-present'

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

  // ── Assert (B): business_charges tiene el refund_charge correcto ────────────
  it('(B) business_charges registra refund_charge con monto correcto', async () => {
    const { data, error } = await localClient
      .from('business_charges')
      .select('charge_type, amount, status, business_id')
      .eq('order_id', seed.orderId)
      .eq('charge_type', 'refund_charge')

    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const cargo = requirePresent(data?.[0], 'el refund_charge del pedido del claim')
    expect(cargo.charge_type).toBe('refund_charge')
    expect(Number(cargo.amount)).toBe(seed.amount)
    expect(cargo.status).toBe('pending')
    expect(cargo.business_id).toBe(seed.businessId)
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
    const balanceAfter = Number(requirePresent(bizAfter, 'el negocio del claim').balance_due)
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
