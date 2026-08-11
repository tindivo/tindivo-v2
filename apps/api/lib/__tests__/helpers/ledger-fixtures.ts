/**
 * Fixtures para los tests de la cadena del pedido (Parte A del spec de fase 2).
 *
 * POR QUÉ UN MUNDO AISLADO POR TEST, Y NO EL SEED E2E
 *   `release-and-transfer` reusa `E2E.BUSINESS_ID` y sus dos motorizados. Vitest
 *   corre los ARCHIVOS en paralelo, así que si estos tests usaran los mismos
 *   motorizados competirían por `occupancy_slots` y por el guard de pedido
 *   activo. Cada test de aquí crea su propio negocio y su propio motorizado, y
 *   los borra al terminar.
 *
 * QUÉ HACE FALTA PARA LLEVAR UN PEDIDO A `delivered` — MEDIDO, NO SUPUESTO
 *   Desde la 0128, `advance_order` SÍ valida `driver_restaurants` en `take`: el
 *   motorizado tiene que estar autorizado en el negocio del pedido. Por eso
 *   `seedLedgerWorld` inserta esa fila; sin ella todos estos tests rebotan con
 *   P0001 'No estas autorizado para este negocio'.
 *
 *   Lo que la 0128 sigue SIN validar en `take` (verificado contra la definición
 *   viva, no supuesto): `driver_availability`. No hace falta marcar el
 *   motorizado como disponible para tomar un pedido.
 *
 *   La otra guarda de la 0128, `appears_in_queue_at`, no afecta a estos tests:
 *   solo aplica a pedidos en `preparing`, y `seedOrder` los crea directamente en
 *   `waiting_driver`, que pasa sin condición de tiempo.
 *
 * DÓNDE SE CALCULA EL DINERO
 *   El trigger `generate_delivery_charges` NO calcula nada: lee
 *   `commission_amount` y `delivery_fee_charged` que ya escribió `advance_order`
 *   en la acción `pickup`. Por eso los casos de banda y de override tienen que
 *   pasar por el RPC completo; no basta con voltear `status` a `delivered`.
 */
import { localClient } from './local-db'

// ── El alfabeto de short_id excluye I, O, 0 y 1 (invariante 1 de CLAUDE.md) ────
// Un short_id inválido rompe el INSERT antes de probar nada. Ya mordió cuatro
// veces en este repo; el generador lo hace imposible.
const SHORT_ID_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomShortId(): string {
  let out = ''
  for (let i = 0; i < 8; i++) {
    out += SHORT_ID_CHARSET[Math.floor(Math.random() * SHORT_ID_CHARSET.length)]
  }
  return out
}

/**
 * Overrides por negocio. Desde la migración 0125 la comisión NO depende de la
 * banda: `commission_override_near` pasó a `commission_override_delivery` y
 * `commission_override_far` se eliminó.
 */
export interface CommissionOverrides {
  pickup?: number
  delivery?: number
}

export interface LedgerWorld {
  businessUserId: string
  driverUserId: string
  businessId: string
  driverId: string
  orderIds: string[]
}

/** Crea negocio + motorizado propios. `overrides` va a `businesses.commission_override_*`. */
export async function seedLedgerWorld(overrides: CommissionOverrides = {}): Promise<LedgerWorld> {
  const tag = crypto.randomUUID().slice(0, 8)

  const { data: bizUser, error: bizUserErr } = await localClient.auth.admin.createUser({
    email: `ledger-biz-${tag}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Ledger Test Owner' },
  })
  if (bizUserErr) throw new Error(`seed auth.users (negocio) failed: ${bizUserErr.message}`)

  const { data: drvUser, error: drvUserErr } = await localClient.auth.admin.createUser({
    email: `ledger-drv-${tag}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Ledger Test Driver' },
  })
  if (drvUserErr) throw new Error(`seed auth.users (motorizado) failed: ${drvUserErr.message}`)

  const { data: biz, error: bizErr } = await localClient
    .from('businesses')
    .insert({
      user_id: bizUser.user.id,
      name: `Ledger Test ${tag}`,
      balance_due: 0,
      commission_override_pickup: overrides.pickup ?? null,
      commission_override_delivery: overrides.delivery ?? null,
    })
    .select('id')
    .single()
  if (bizErr) throw new Error(`seed businesses failed: ${bizErr.message}`)

  const { data: drv, error: drvErr } = await localClient
    .from('drivers')
    .insert({
      user_id: drvUser.user.id,
      full_name: `Ledger Driver ${tag}`,
      phone: '987000111',
    })
    .select('id')
    .single()
  if (drvErr) throw new Error(`seed drivers failed: ${drvErr.message}`)

  // 0128: `take` exige que el motorizado esté autorizado en el negocio. Sin esta
  // fila, el primer `advance_order('take')` de la cadena rebota con P0001 y todos
  // los tests de ledger fallan antes de llegar al dinero, que es lo que miden.
  // No necesita cleanup propio: `driver_restaurants.driver_id` cascadea al borrar
  // el motorizado en `cleanupLedgerWorld`.
  //
  // Va como upsert y no como insert porque desde la 0133 el vínculo YA existe
  // cuando llegamos aquí: el negocio se creó unas líneas más arriba y el INSERT
  // en `drivers` dispara `trg_drivers_link_businesses`, que engancha al recién
  // llegado con todos los negocios activos. Un `insert` a secas choca contra la
  // PK y tumba los trece tests del ledger antes de su primera aserción. Lo que
  // esta línea garantiza es el ESTADO ("existe el vínculo"), no el acto de
  // crearlo, así que quién lo creó da igual.
  const { error: authErr } = await localClient
    .from('driver_restaurants')
    .upsert({ driver_id: drv.id, business_id: biz.id }, { ignoreDuplicates: true })
  if (authErr) throw new Error(`seed driver_restaurants failed: ${authErr.message}`)

  return {
    businessUserId: bizUser.user.id,
    driverUserId: drvUser.user.id,
    businessId: biz.id,
    driverId: drv.id,
    orderIds: [],
  }
}

export interface OrderOptions {
  deliveryMethod?: 'delivery' | 'pickup'
  orderAmount?: number
  deliveryFee?: number
}

/** Pedido en `waiting_driver`, listo para que el motorizado lo tome. */
export async function seedOrder(world: LedgerWorld, opts: OrderOptions = {}): Promise<string> {
  const { deliveryMethod = 'delivery', orderAmount = 40.0, deliveryFee = 2.0 } = opts

  const { data, error } = await localClient
    .from('orders')
    .insert({
      business_id: world.businessId,
      short_id: randomShortId(),
      customer_phone: '+51999000333',
      delivery_method: deliveryMethod,
      order_amount: orderAmount,
      delivery_fee: deliveryMethod === 'pickup' ? 0 : deliveryFee,
      payment_intent: 'pending_cash',
      status: 'waiting_driver',
      appears_in_queue_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed orders failed: ${error.message}`)

  world.orderIds.push(data.id)
  return data.id
}

/**
 * Recorre take → arrived → pickup → deliver.
 * `band` solo aplica a pedidos `delivery`; en `pickup` la banda no existe.
 * Al llegar a `delivered` dispara `generate_delivery_charges`.
 */
export async function deliverOrder(
  world: LedgerWorld,
  orderId: string,
  band: 'near' | 'far' | null = 'near',
): Promise<void> {
  const call = async (action: string, params?: Record<string, unknown>) => {
    const { error } = await localClient.rpc('advance_order', {
      p_order_id: orderId,
      p_actor_user_id: world.driverUserId,
      p_actor_role: 'driver',
      p_action: action,
      ...(params ? { p_params: params } : {}),
    })
    if (error) throw new Error(`advance_order(${action}) failed: ${error.message}`)
  }

  await call('take')
  await call('arrived')
  await call('pickup', band ? { band, slots: 1 } : { slots: 1 })
  await call('deliver', { paymentReal: 'paid_cash' })
}

// ── Lecturas ──────────────────────────────────────────────────────────────────

export interface ChargeRow {
  id: string
  charge_type: string
  amount: number
  status: string
  // `settlement_id` se retiró en la migración 0124 junto con la tabla
  // `settlements`, que se borró por cero uso verificado.
  payment_id: string | null
}

export async function readCharges(orderId: string): Promise<ChargeRow[]> {
  const { data, error } = await localClient
    .from('business_charges')
    .select('id, charge_type, amount, status, payment_id')
    .eq('order_id', orderId)
    .order('charge_type')
  if (error) throw new Error(`readCharges failed: ${error.message}`)
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as ChargeRow[]
}

export async function readBusinessCharges(businessId: string): Promise<ChargeRow[]> {
  const { data, error } = await localClient
    .from('business_charges')
    .select('id, charge_type, amount, status, payment_id')
    .eq('business_id', businessId)
    .order('created_at')
  if (error) throw new Error(`readBusinessCharges failed: ${error.message}`)
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })) as ChargeRow[]
}

export interface OrderMoney {
  status: string
  delivery_distance_band: string | null
  delivery_fee_charged: number | null
  commission_amount: number | null
  tindivo_commission: number | null
}

export async function readOrderMoney(orderId: string): Promise<OrderMoney> {
  const { data, error } = await localClient
    .from('orders')
    .select(
      'status, delivery_distance_band, delivery_fee_charged, commission_amount, tindivo_commission',
    )
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`readOrderMoney failed: ${error.message}`)
  return {
    status: data.status as string,
    delivery_distance_band: data.delivery_distance_band as string | null,
    delivery_fee_charged:
      data.delivery_fee_charged === null ? null : Number(data.delivery_fee_charged),
    commission_amount: data.commission_amount === null ? null : Number(data.commission_amount),
    tindivo_commission: data.tindivo_commission === null ? null : Number(data.tindivo_commission),
  }
}

export async function readBalanceDue(businessId: string): Promise<number> {
  const { data, error } = await localClient
    .from('businesses')
    .select('balance_due')
    .eq('id', businessId)
    .single()
  if (error) throw new Error(`readBalanceDue failed: ${error.message}`)
  return Number(data.balance_due)
}

export async function readBlockState(
  businessId: string,
): Promise<{ is_blocked: boolean; blocked_for_debt: boolean; block_reason: string | null }> {
  const { data, error } = await localClient
    .from('businesses')
    .select('is_blocked, blocked_for_debt, block_reason')
    .eq('id', businessId)
    .single()
  if (error) throw new Error(`readBlockState failed: ${error.message}`)
  return data as { is_blocked: boolean; blocked_for_debt: boolean; block_reason: string | null }
}

// ── El modelo vigente, leído de app_settings ─────────────────────────────────
// No se hardcodean montos: si mañana cambian las tarifas, estos tests siguen
// midiendo el MODELO y no un número concreto.

export interface MoneyConfig {
  /** 0125: la comisión es plana. `delivery` vale igual para `near` y para `far`. */
  commissions: { pickup: number; delivery: number }
  bands: { near: number; far: number }
}

export async function readMoneyConfig(): Promise<MoneyConfig> {
  const { data, error } = await localClient
    .from('app_settings')
    .select('key, value')
    .in('key', ['commissions', 'delivery_bands'])
  if (error) throw new Error(`readMoneyConfig failed: ${error.message}`)

  const byKey = new Map((data ?? []).map((r) => [r.key, r.value as Record<string, number>]))
  const commissions = byKey.get('commissions')
  const bands = byKey.get('delivery_bands')
  if (!commissions || !bands) throw new Error('app_settings sin commissions o delivery_bands')

  return {
    commissions: {
      pickup: Number(commissions.pickup),
      delivery: Number(commissions.delivery),
    },
    bands: { near: Number(bands.near), far: Number(bands.far) },
  }
}

/**
 * Réplica de lo que hace `advance_order` en la acción `pickup`, para calcular lo
 * ESPERADO sin hardcodear montos.
 *
 * OJO con el envío: sale de `orders.delivery_fee` —lo que el cliente pagó— y NO
 * de `delivery_bands[banda]`. Es la decisión de `0110`: "una entrega lejana
 * cuesta al negocio lo mismo que una cercana", porque el cliente paga igual vaya
 * donde vaya. Mientras eso siga así, `far` y `near` producen cargos idénticos.
 *
 * DESDE LA 0125 LA COMISIÓN YA NO SE RESTA. Antes, `commissions.near` era el
 * TOTAL (comisión + envío) y había que restarle el envío para obtener la
 * comisión sola. Ahora `commissions.delivery` ES la comisión sola, así que se
 * usa tal cual. `band` sigue siendo parámetro porque `advance_order` la sigue
 * escribiendo en `orders.delivery_distance_band`, pero ya NO decide el monto:
 * pasar 'near' o 'far' da exactamente lo mismo. Que eso siga siendo verdad es
 * justo lo que mide A1.2.
 */
export function expectedMoney(args: {
  cfg: MoneyConfig
  deliveryMethod: 'delivery' | 'pickup'
  band: 'near' | 'far' | null
  orderDeliveryFee: number
  overrides?: CommissionOverrides
}): { fee: number; commission: number; total: number } {
  const { cfg, deliveryMethod, orderDeliveryFee, overrides = {} } = args

  const fee = deliveryMethod === 'pickup' ? 0 : (orderDeliveryFee ?? cfg.bands.near)

  const commission =
    deliveryMethod === 'pickup'
      ? (overrides.pickup ?? cfg.commissions.pickup)
      : (overrides.delivery ?? cfg.commissions.delivery)

  return { fee: round2(fee), commission: round2(commission), total: round2(commission + fee) }
}

/** Los montos son numeric(10,2); sumarlos como float arrastra error binario. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
// Orden FK-seguro. `domain_events` referencia el pedido por `aggregate_id` SIN
// foreign key, así que no cae por cascada: hay que borrarlo a mano o cada corrida
// deja huérfanos (mismo motivo documentado en local-db.ts:315-317).
export async function cleanupLedgerWorld(world: LedgerWorld): Promise<void> {
  for (const orderId of world.orderIds) {
    await localClient.from('business_charges').delete().eq('order_id', orderId)
    await localClient.from('domain_events').delete().eq('aggregate_id', orderId)
    await localClient.from('order_event_log').delete().eq('order_id', orderId)
    await localClient.from('orders').delete().eq('id', orderId)
  }
  await localClient.from('business_charges').delete().eq('business_id', world.businessId)
  await localClient.from('restaurant_payments').delete().eq('business_id', world.businessId)
  await localClient.from('drivers').delete().eq('id', world.driverId)
  await localClient.from('businesses').delete().eq('id', world.businessId)
  await localClient.from('users').delete().eq('id', world.businessUserId)
  await localClient.from('users').delete().eq('id', world.driverUserId)
  await localClient.auth.admin.deleteUser(world.businessUserId)
  await localClient.auth.admin.deleteUser(world.driverUserId)
}
