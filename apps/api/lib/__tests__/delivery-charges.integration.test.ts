/**
 * A.1 · Test de INTEGRACIÓN de `generate_delivery_charges`.
 *
 * El trigger que alimenta el ledger. Hasta ahora sin ninguna cobertura: el T3 de
 * `release-and-transfer` lo atraviesa y no mira ni un `business_charge`.
 *
 * Corre contra la DB LOCAL (127.0.0.1:54321). Cada test crea su propio negocio y
 * su propio motorizado, y los borra en `finally` — ver `helpers/ledger-fixtures.ts`.
 *
 * NO SE HARDCODEAN MONTOS. Todo lo esperado se calcula desde `app_settings`
 * (`commissions`, `delivery_bands`) con `expectedMoney()`, que replica la rama
 * `pickup` de `advance_order`. Si mañana cambian las tarifas, estos tests siguen
 * midiendo el modelo en vez de romperse por un número.
 */
import { describe, expect, it } from 'vitest'
import {
  cleanupLedgerWorld,
  deliverOrder,
  expectedMoney,
  type MoneyConfig,
  readBalanceDue,
  readCharges,
  readMoneyConfig,
  readOrderMoney,
  round2,
  seedLedgerWorld,
  seedOrder,
} from './helpers/ledger-fixtures'

describe('generate_delivery_charges — el trigger que alimenta el ledger', () => {
  // ── A1.1 ────────────────────────────────────────────────────────────────────
  it('A1.1 pedido near entregado deja delivery_fee y commission, ambas pending', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'near')

      const esperado = expectedMoney({
        cfg,
        deliveryMethod: 'delivery',
        band: 'near',
        orderDeliveryFee: 2.0,
      })

      const cargos = await readCharges(orderId)
      expect(cargos).toHaveLength(2)

      const fee = cargos.find((c) => c.charge_type === 'delivery_fee')
      const com = cargos.find((c) => c.charge_type === 'commission')

      expect(fee).toBeDefined()
      expect(com).toBeDefined()
      expect(fee!.amount).toBe(esperado.fee)
      expect(com!.amount).toBe(esperado.commission)
      expect(fee!.status).toBe('pending')
      expect(com!.status).toBe('pending')
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A1.2 ────────────────────────────────────────────────────────────────────
  // El modelo vigente NO cobra más por una entrega lejana: el envío sale de
  // `orders.delivery_fee` (lo que el cliente pagó), no de `delivery_bands.far`.
  // Es la decisión de la migración 0110. Este test lo fija por escrito: si
  // alguien reintroduce el recargo por banda sin tocar el lado del cliente,
  // rompe aquí.
  it('A1.2 pedido far entregado cobra según el modelo vigente, no según la banda', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'far')

      const esperado = expectedMoney({
        cfg,
        deliveryMethod: 'delivery',
        band: 'far',
        orderDeliveryFee: 2.0,
      })

      const money = await readOrderMoney(orderId)
      expect(money.delivery_distance_band).toBe('far')

      const cargos = await readCharges(orderId)
      const fee = cargos.find((c) => c.charge_type === 'delivery_fee')
      const com = cargos.find((c) => c.charge_type === 'commission')

      expect(fee!.amount).toBe(esperado.fee)
      expect(com!.amount).toBe(esperado.commission)

      // El envío cobrado es el del pedido, NO `delivery_bands.far`.
      expect(fee!.amount).toBe(2.0)
      expect(fee!.amount).not.toBe(cfg.bands.far)

      // Y desde la 0125, la comisión es PLANA: `far` cobra exactamente el mismo
      // `commissions.delivery` que `near`. Es la prueba de que el modelo nuevo
      // no reintrodujo diferencia por banda. Si la Parte D vuelve a cobrar más
      // por las lejanas, este es el test que tiene que cambiar a propósito.
      expect(com!.amount).toBe(cfg.commissions.delivery)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A1.3 ────────────────────────────────────────────────────────────────────
  it('A1.3 pedido pickup entregado deja UNA sola fila de commission, sin delivery_fee', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryMethod: 'pickup' })
      await deliverOrder(world, orderId, null)

      const esperado = expectedMoney({
        cfg,
        deliveryMethod: 'pickup',
        band: null,
        orderDeliveryFee: 0,
      })

      const cargos = await readCharges(orderId)

      // Una sola fila, y explícitamente NINGUNA de delivery_fee: el trigger
      // guarda `IF v_delivery_fee > 0`, así que un envío de 0 no genera cargo.
      expect(cargos).toHaveLength(1)
      expect(cargos[0].charge_type).toBe('commission')
      expect(cargos[0].amount).toBe(esperado.commission)
      expect(cargos.some((c) => c.charge_type === 'delivery_fee')).toBe(false)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A1.4 · EL INVARIANTE MÁS IMPORTANTE DE LA SUITE ─────────────────────────
  // Reconciliación acotada al pedido: la suma de sus cargos en el ledger tiene
  // que ser exactamente `orders.tindivo_commission`. Cuadra siempre, sin
  // depender de liquidaciones, ajustes ni del estado de otros pedidos.
  // Se comprueba sobre los tres caminos, no sobre uno.
  it.each([
    { nombre: 'near', method: 'delivery' as const, band: 'near' as const, fee: 2.0 },
    { nombre: 'far', method: 'delivery' as const, band: 'far' as const, fee: 2.0 },
    { nombre: 'pickup', method: 'pickup' as const, band: null, fee: 0 },
  ])('A1.4 [$nombre] SUM(business_charges del pedido) = orders.tindivo_commission', async ({
    method,
    band,
  }) => {
    const world = await seedLedgerWorld()
    try {
      const orderId = await seedOrder(world, { deliveryMethod: method })
      await deliverOrder(world, orderId, band)

      const cargos = await readCharges(orderId)
      const sumaLedger = round2(cargos.reduce((s, c) => s + c.amount, 0))
      const money = await readOrderMoney(orderId)

      expect(money.status).toBe('delivered')
      expect(money.tindivo_commission).not.toBeNull()
      expect(sumaLedger).toBe(money.tindivo_commission)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A1.5 ────────────────────────────────────────────────────────────────────
  it('A1.5 balance_due sube exactamente el monto de los cargos generados', async () => {
    const world = await seedLedgerWorld()
    try {
      const antes = await readBalanceDue(world.businessId)

      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'near')

      const cargos = await readCharges(orderId)
      const sumaLedger = round2(cargos.reduce((s, c) => s + c.amount, 0))
      const despues = await readBalanceDue(world.businessId)

      expect(round2(despues - antes)).toBe(sumaLedger)

      // Y coincide con el total del pedido, cerrando el círculo con A1.4.
      const money = await readOrderMoney(orderId)
      expect(round2(despues - antes)).toBe(money.tindivo_commission)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })

  // ── A1.6 ────────────────────────────────────────────────────────────────────
  // `advance_order` resuelve la comisión con
  // COALESCE(businesses.commission_override_delivery, app_settings.commissions.delivery, 1.50).
  // Desde la 0125 ya no hay una columna por banda: es una sola.
  // El override se pone deliberadamente MAYOR que el valor global para que el
  // test distinga cuál ganó: si mandara app_settings, la comisión sería otra.
  it('A1.6 commission_override_delivery gana sobre app_settings.commissions', async () => {
    const cfg: MoneyConfig = await readMoneyConfig()
    const override = round2(cfg.commissions.delivery + 1.5)
    const world = await seedLedgerWorld({ delivery: override })
    try {
      const orderId = await seedOrder(world, { deliveryFee: 2.0 })
      await deliverOrder(world, orderId, 'near')

      const conOverride = expectedMoney({
        cfg,
        deliveryMethod: 'delivery',
        band: 'near',
        orderDeliveryFee: 2.0,
        overrides: { delivery: override },
      })
      const sinOverride = expectedMoney({
        cfg,
        deliveryMethod: 'delivery',
        band: 'near',
        orderDeliveryFee: 2.0,
      })

      const cargos = await readCharges(orderId)
      const com = cargos.find((c) => c.charge_type === 'commission')

      expect(com!.amount).toBe(conOverride.commission)
      expect(com!.amount).not.toBe(sinOverride.commission)

      // El envío no lo toca el override: sigue saliendo del pedido.
      const fee = cargos.find((c) => c.charge_type === 'delivery_fee')
      expect(fee!.amount).toBe(conOverride.fee)

      // Y A1.4 sigue cuadrando con el override puesto.
      const money = await readOrderMoney(orderId)
      const sumaLedger = round2(cargos.reduce((s, c) => s + c.amount, 0))
      expect(sumaLedger).toBe(money.tindivo_commission)
    } finally {
      await cleanupLedgerWorld(world)
    }
  })
})
