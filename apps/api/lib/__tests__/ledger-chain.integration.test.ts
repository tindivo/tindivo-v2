/**
 * A.2 · Test de INTEGRACIÓN de la cadena completa: entrega → ledger → liquidación.
 *
 * Cubre `settle_business_charges`, que hasta ahora solo tenía un test que
 * insertaba el cargo a mano y no miraba `balance_due` ni pasaba por el trigger.
 * Aquí los cargos los genera `generate_delivery_charges` de verdad.
 *
 * Corre contra la DB LOCAL (127.0.0.1:54321). Mundo aislado por test.
 *
 * DOS COSAS QUE CONVIENE SABER LEYENDO ESTO
 *
 * 1. Un pedido `delivery` produce DOS cargos (`delivery_fee` y `commission`),
 *    no uno. Un pedido `pickup` produce uno solo. Donde el caso habla de "3
 *    cargos" se usan pedidos `pickup`, para que la cuenta de pedidos y la de
 *    cargos coincidan 1:1 y el test diga lo que parece decir.
 *
 * 2. `business_charges` NO tiene trigger que mantenga `balance_due`. Las
 *    funciones que insertan cargos fuera del trigger de entrega —
 *    `resolve_fraud_claim`, `register_appeal_refund`— hacen las dos cosas a
 *    mano: insertan el cargo y suman a `balance_due`. A2.5 replica ese par
 *    exacto; si solo insertara el cargo, el escenario no sería el real.
 */
import { describe, expect, it } from 'vitest'
import {
  cleanupLedgerWorld,
  deliverOrder,
  type LedgerWorld,
  readBalanceDue,
  readBlockState,
  readBusinessCharges,
  round2,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'
import { localClient } from './helpers/local-db'
import { requirePresent } from './helpers/require-present'

/** Liquida los cargos indicados. Devuelve el error crudo del RPC, si lo hubo. */
async function liquidar(
  world: LedgerWorld,
  chargeIds: string[],
  totalAmount: number,
): Promise<{ error: { code?: string; message: string } | null }> {
  const { error } = await localClient.rpc('settle_business_charges', {
    p_business_id: world.businessId,
    p_charge_ids: chargeIds,
    p_total_amount: totalAmount,
    p_payment_method: 'yape',
    p_note: 'Liquidación de test de integración',
    p_admin_user_id: world.businessUserId,
  })
  return { error: error as { code?: string; message: string } | null }
}

describe('cadena del ledger — entrega, cargos y liquidación', () => {
  // ── A2.1 ────────────────────────────────────────────────────────────────────
  it('A2.1 tres pedidos entregados y liquidados dejan balance_due en 0 y todo settled', async () => {
    const world = await seedLedgerWorld()
    try {
      for (let i = 0; i < 3; i++) {
        const orderId = await seedOrder(world, { deliveryFee: 2.0 })
        await deliverOrder(world, orderId, 'near')
      }

      const cargos = await readBusinessCharges(world.businessId)
      // 3 pedidos `delivery` = 6 cargos (delivery_fee + commission por pedido).
      expect(cargos).toHaveLength(6)
      expect(cargos.every((c) => c.status === 'pending')).toBe(true)

      const total = round2(cargos.reduce((s, c) => s + c.amount, 0))
      expect(await readBalanceDue(world.businessId)).toBe(total)

      const { error } = await liquidar(
        world,
        cargos.map((c) => c.id),
        total,
      )
      expect(error).toBeNull()

      const despues = await readBusinessCharges(world.businessId)
      expect(despues.every((c) => c.status === 'settled')).toBe(true)
      expect(despues.every((c) => c.payment_id !== null)).toBe(true)
      expect(await readBalanceDue(world.businessId)).toBe(0)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A2.2 ────────────────────────────────────────────────────────────────────
  // Pedidos `pickup` a propósito: uno por cargo, así "liquidar 2 de 3" se lee
  // igual en pedidos que en cargos.
  it('A2.2 liquidar 2 de 3 cargos deja el tercero pending y el saldo en su monto', async () => {
    const world = await seedLedgerWorld()
    try {
      for (let i = 0; i < 3; i++) {
        const orderId = await seedOrder(world, { deliveryMethod: 'pickup' })
        await deliverOrder(world, orderId, null)
      }

      const cargos = await readBusinessCharges(world.businessId)
      expect(cargos).toHaveLength(3)

      // FIFO: los dos más antiguos. `readBusinessCharges` ordena por created_at.
      const aLiquidar = cargos.slice(0, 2)
      const restante = cargos[2]
      const totalParcial = round2(aLiquidar.reduce((s, c) => s + c.amount, 0))

      const { error } = await liquidar(
        world,
        aLiquidar.map((c) => c.id),
        totalParcial,
      )
      expect(error).toBeNull()

      const despues = await readBusinessCharges(world.businessId)
      const settled = despues.filter((c) => c.status === 'settled')
      const pending = despues.filter((c) => c.status === 'pending')

      expect(settled).toHaveLength(2)
      expect(pending).toHaveLength(1)
      expect(pending[0].id).toBe(restante.id)
      expect(await readBalanceDue(world.businessId)).toBe(restante.amount)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A2.3 ────────────────────────────────────────────────────────────────────
  // La RPC exige que el total declarado cuadre con la suma de los cargos
  // seleccionados, con tolerancia de 0.005 para el redondeo de numeric(10,2).
  it('A2.3 una liquidación cuyo monto no cuadra REBOTA con P0001', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'near')

      const cargos = await readBusinessCharges(world.businessId)
      const totalReal = round2(cargos.reduce((s, c) => s + c.amount, 0))
      const totalMentiroso = round2(totalReal + 10)

      const { error } = await liquidar(
        world,
        cargos.map((c) => c.id),
        totalMentiroso,
      )

      const fallo = requirePresent(error, 'el error del RPC al liquidar con un total que no cuadra')
      expect(fallo.code).toBe('P0001')
      expect(fallo.message).toMatch(/no coincide con la suma de los cargos/)

      // Y no dejó nada a medias: los cargos siguen pending y el saldo intacto.
      const despues = await readBusinessCharges(world.businessId)
      expect(despues.every((c) => c.status === 'pending')).toBe(true)
      expect(await readBalanceDue(world.businessId)).toBe(totalReal)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A2.4 ────────────────────────────────────────────────────────────────────
  // El desbloqueo por mora es una REGLA DE NEGOCIO que hoy depende de
  // `balance_due <= 0` (campo deprecado por AGENTS.md §2.2). Ver R-L1 en
  // Docs/RIESGOS-LEDGER.md: este test fija el comportamiento actual para que la
  // Parte B pueda cambiarlo sin romperlo en silencio.
  it('A2.4 tras liquidar todo, el negocio bloqueado por mora queda desbloqueado', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'near')

      const { error: blockErr } = await localClient
        .from('businesses')
        .update({ is_blocked: true, blocked_for_debt: true, block_reason: 'Mora de prueba' })
        .eq('id', world.businessId)
      expect(blockErr).toBeNull()

      const bloqueado = await readBlockState(world.businessId)
      expect(bloqueado.is_blocked).toBe(true)
      expect(bloqueado.blocked_for_debt).toBe(true)

      const cargos = await readBusinessCharges(world.businessId)
      const total = round2(cargos.reduce((s, c) => s + c.amount, 0))
      const { error } = await liquidar(
        world,
        cargos.map((c) => c.id),
        total,
      )
      expect(error).toBeNull()

      const despues = await readBlockState(world.businessId)
      expect(despues.is_blocked).toBe(false)
      expect(despues.blocked_for_debt).toBe(false)
      expect(despues.block_reason).toBeNull()
      expect(await readBalanceDue(world.businessId)).toBe(0)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A2.5 ────────────────────────────────────────────────────────────────────
  // El flujo real: el cliente hizo Yape, no recibió la comida, Tindivo le
  // devolvió y se lo carga al restaurante. Ese `refund_charge` tiene que
  // liquidarse junto con las comisiones, no aparte.
  //
  // Se replica el par exacto que hacen `resolve_fraud_claim` y
  // `register_appeal_refund`: INSERT del cargo + UPDATE de `balance_due`.
  // `business_charges` no tiene trigger que lo haga solo.
  it('A2.5 un refund_charge se liquida en el mismo lote que los cargos del pedido', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'near')

      const saldoPrevio = await readBalanceDue(world.businessId)
      const montoDevolucion = 42.0
      const { error: chargeErr } = await localClient.from('business_charges').insert({
        business_id: world.businessId,
        order_id: orderId,
        charge_type: 'refund_charge',
        amount: montoDevolucion,
        description: 'Devolución al cliente — prepago no entregado',
        status: 'pending',
      })
      expect(chargeErr).toBeNull()

      // Desde 0124 el saldo lo mantiene `trg_business_charges_recalc_balance`:
      // el INSERT de arriba ya lo recalculó. Antes había aquí un UPDATE manual
      // de `balance_due` que replicaba lo que hacían las RPC; con el trigger
      // ese par duplicaría.
      expect(await readBalanceDue(world.businessId)).toBe(round2(saldoPrevio + montoDevolucion))

      const cargos = await readBusinessCharges(world.businessId)
      expect(cargos).toHaveLength(3)
      expect(cargos.filter((c) => c.charge_type === 'refund_charge')).toHaveLength(1)

      const total = round2(cargos.reduce((s, c) => s + c.amount, 0))
      expect(await readBalanceDue(world.businessId)).toBe(total)

      // Se liquida TODO junto: la RPC no filtra por charge_type.
      const { error } = await liquidar(
        world,
        cargos.map((c) => c.id),
        total,
      )
      expect(error).toBeNull()

      const despues = await readBusinessCharges(world.businessId)
      expect(despues.every((c) => c.status === 'settled')).toBe(true)

      const devolucion = requirePresent(
        despues.find((c) => c.charge_type === 'refund_charge'),
        'el cargo refund_charge tras liquidar',
      )
      expect(devolucion.status).toBe('settled')
      expect(devolucion.payment_id).not.toBeNull()
      expect(await readBalanceDue(world.businessId)).toBe(0)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })
})
