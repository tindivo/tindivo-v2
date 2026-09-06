/**
 * Test de INTEGRACIÓN de `admin_correct_delivery_band` (migración 0213).
 *
 * Cierra la deuda que dejó escrita la cabecera de la 0190 y el spec
 * `Docs/spec/spec-edicion-pedido-manual.md` §3.2: la banda de un pedido manual
 * la elige la cajera al crear, pero si la marcó mal (todo "Cerca" por apuro)
 * hasta ahora NO había forma de corregirla — "lo corrige un admin" era una
 * frase sin código detrás.
 *
 * Corre contra la DB LOCAL. Mismo patrón de mundo aislado por test que
 * `delivery-charges.integration.test.ts`: cada test crea su propio negocio y
 * lo borra en `finally`.
 *
 * NO SE HARDCODEAN MONTOS: la diferencia esperada sale de
 * `app_settings.delivery_bands` (`readMoneyConfig`), no de un número fijo.
 */
import { describe, expect, it } from 'vitest'
import {
  cleanupLedgerWorld,
  deliverOrder,
  type MoneyConfig,
  readBalanceDue,
  readCharges,
  readMoneyConfig,
  readOrderMoney,
  round2,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'
import { localClient } from './helpers/local-db'
import { requirePresent } from './helpers/require-present'

const findCharge = (
  cargos: Awaited<ReturnType<typeof readCharges>>,
  type: 'delivery_fee' | 'commission',
) =>
  requirePresent(
    cargos.find((c) => c.charge_type === type),
    `el cargo ${type} del pedido`,
  )

async function correctBand(orderId: string, adminUserId: string, band: 'near' | 'far') {
  return localClient.rpc('admin_correct_delivery_band', {
    p_order_id: orderId,
    p_admin_user_id: adminUserId,
    p_new_band: band,
  })
}

describe('admin_correct_delivery_band — el admin corrige la banda de un pedido entregado', () => {
  it('sube el cargo delivery_fee y el balance_due al corregir near -> far, sin tocar la comisión', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: cfg.bands.near })
      await deliverOrder(world, orderId, 'near')

      const balanceAntes = await readBalanceDue(world.businessId)
      const cargosAntes = await readCharges(orderId)
      const comisionAntes = findCharge(cargosAntes, 'commission').amount

      const { data, error } = await correctBand(orderId, world.businessUserId, 'far')
      expect(error).toBeNull()
      expect(data.band).toBe('far')
      expect(data.unchanged).toBe(false)

      const diferencia = round2(cfg.bands.far - cfg.bands.near)

      const money = await readOrderMoney(orderId)
      expect(money.delivery_distance_band).toBe('far')
      expect(money.delivery_fee_charged).toBe(round2(cfg.bands.far))

      const cargosDespues = await readCharges(orderId)
      expect(findCharge(cargosDespues, 'delivery_fee').amount).toBe(round2(cfg.bands.far))
      // La comisión es plana desde la 0125: no la toca una corrección de banda.
      expect(findCharge(cargosDespues, 'commission').amount).toBe(comisionAntes)

      const balanceDespues = await readBalanceDue(world.businessId)
      expect(round2(balanceDespues - balanceAntes)).toBe(diferencia)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  it('es simétrico: volver a near restaura el monto original', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: cfg.bands.near })
      await deliverOrder(world, orderId, 'near')
      const balanceOriginal = await readBalanceDue(world.businessId)

      await correctBand(orderId, world.businessUserId, 'far')
      const { error } = await correctBand(orderId, world.businessUserId, 'near')
      expect(error).toBeNull()

      const money = await readOrderMoney(orderId)
      expect(money.delivery_fee_charged).toBe(round2(cfg.bands.near))

      const balanceFinal = await readBalanceDue(world.businessId)
      expect(balanceFinal).toBe(balanceOriginal)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  it('pedir la misma banda que ya tiene es un no-op idempotente', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world)
      await deliverOrder(world, orderId, 'near')
      const balanceAntes = await readBalanceDue(world.businessId)

      const { data, error } = await correctBand(orderId, world.businessUserId, 'near')
      expect(error).toBeNull()
      expect(data.unchanged).toBe(true)

      const balanceDespues = await readBalanceDue(world.businessId)
      expect(balanceDespues).toBe(balanceAntes)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  it('rechaza corregir un cargo delivery_fee ya liquidado', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world)
      await deliverOrder(world, orderId, 'near')

      const cargos = await readCharges(orderId)
      const cargoEnvio = findCharge(cargos, 'delivery_fee')
      const { error: settleErr } = await localClient
        .from('business_charges')
        .update({ status: 'settled', settled_at: new Date().toISOString() })
        .eq('id', cargoEnvio.id)
      expect(settleErr).toBeNull()

      const { error } = await correctBand(orderId, world.businessUserId, 'far')
      expect(error).not.toBeNull()
      expect(error?.code).toBe('P0001')
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  it('rechaza pedidos pickup: no tienen banda', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryMethod: 'pickup' })
      await deliverOrder(world, orderId, null)

      const { error } = await correctBand(orderId, world.businessUserId, 'far')
      expect(error).not.toBeNull()
      expect(error?.code).toBe('P0001')
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  it('rechaza pedidos que no están delivered', async () => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world)
      // seedOrder deja el pedido en waiting_driver, nunca llega a delivered.

      const { error } = await correctBand(orderId, world.businessUserId, 'far')
      expect(error).not.toBeNull()
      expect(error?.code).toBe('P0001')
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  it('no cambia lo que el cliente pagó (order_amount + delivery_fee)', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { orderAmount: 40, deliveryFee: cfg.bands.near })
      await deliverOrder(world, orderId, 'near')

      const { data: antes } = await localClient
        .from('orders')
        .select('order_amount, delivery_fee')
        .eq('id', orderId)
        .single()
      const totalAntes = round2(Number(antes.order_amount) + Number(antes.delivery_fee))

      const { error } = await correctBand(orderId, world.businessUserId, 'far')
      expect(error).toBeNull()

      const { data: despues } = await localClient
        .from('orders')
        .select('order_amount, delivery_fee')
        .eq('id', orderId)
        .single()
      const totalDespues = round2(Number(despues.order_amount) + Number(despues.delivery_fee))

      expect(totalDespues).toBe(totalAntes)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })
})
