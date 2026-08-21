/**
 * Test de INTEGRACIÓN del límite de crédito y de la suspensión — migración 0179.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 *
 * QUÉ PROTEGE, Y POR QUÉ ES UN TEST "EN NEGATIVO"
 * La `0178` hizo que la deuda suspendiera al negocio sola al llegar a
 * `app_settings.debt_block_threshold`. La `0179` lo revirtió: en el piloto, un
 * corte automático significaba que un negocio podía quedarse sin vender un
 * viernes por la noche sin que ninguna persona lo hubiera decidido, y encima en
 * silencio, porque `dispatch_event` no convierte `BusinessBlocked` en push.
 *
 * Que el umbral NO haga nada es entonces una decisión, no un descuido. Este
 * fichero la fija: si alguien vuelve a conectar el saldo con la suspensión sin
 * darse cuenta, el primer test se pone rojo y obliga a la conversación. Para
 * reactivarlo a propósito, reaplica la 0178 — y mete `BusinessBlocked` en la
 * lista de eventos que viajan ANTES.
 *
 * Lo que sí se exige es lo segundo: que una suspensión decidida por una PERSONA
 * corte de verdad los pedidos. Eso era un agujero real —`create_customer_order`
 * no miraba el bloqueo del negocio, solo el del cliente, y la página se comparte
 * por slug desde la 0165— y lo tapa `trg_orders_business_not_blocked`, que la
 * 0179 conserva a propósito.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient, type SeededOrder, seedPrepaidOrder } from './helpers/local-db'

const UMBRAL = 600

interface EstadoNegocio {
  balance_due: number
  is_blocked: boolean
  blocked_for_debt: boolean
}

async function leerNegocio(businessId: string): Promise<EstadoNegocio> {
  const { data, error } = await localClient
    .from('businesses')
    .select('balance_due, is_blocked, blocked_for_debt')
    .eq('id', businessId)
    .single()
  if (error) throw new Error(`leerNegocio failed: ${error.message}`)
  const b = data as unknown as EstadoNegocio
  return { ...b, balance_due: Number(b.balance_due) }
}

async function cargar(businessId: string, amount: number, orderId: string): Promise<string> {
  const { data, error } = await localClient
    .from('business_charges')
    .insert({
      business_id: businessId,
      order_id: orderId,
      charge_type: 'commission',
      amount,
      status: 'pending',
      description: 'Cargo de prueba (0179)',
    })
    .select('id')
    .single()
  if (error) throw new Error(`cargar failed: ${error.message}`)
  return (data as { id: string }).id
}

function shortIdAleatorio(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += charset[Math.floor(Math.random() * charset.length)]
  return s
}

async function intentarPedido(businessId: string): Promise<{ error: { message: string } | null }> {
  const { data, error } = await localClient
    .from('orders')
    .insert({
      business_id: businessId,
      short_id: shortIdAleatorio(),
      customer_phone: '+51999000222',
      order_amount: 30,
      delivery_fee: 2,
      payment_intent: 'pending_cash',
      status: 'pending_acceptance',
    })
    .select('id')
    .maybeSingle()
  if (data)
    await localClient
      .from('orders')
      .delete()
      .eq('id', (data as { id: string }).id)
  return { error }
}

describe('límite de crédito y suspensión (integración)', () => {
  let seed: SeededOrder
  const cargos: string[] = []

  beforeAll(async () => {
    seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
  })

  afterAll(async () => {
    if (cargos.length > 0) await localClient.from('business_charges').delete().in('id', cargos)
    await cleanup(seed)
  })

  describe('el umbral es un cartel, no una regla', () => {
    it('pasarse del límite NO suspende al negocio', async () => {
      // La decisión de la 0179. Si esto se pone rojo, alguien reconectó el saldo
      // con la suspensión: mira la cabecera de este fichero antes de "arreglarlo".
      cargos.push(await cargar(seed.businessId, UMBRAL + 100, seed.orderId))
      const b = await leerNegocio(seed.businessId)
      expect(b.balance_due).toBe(UMBRAL + 100)
      expect(b.is_blocked).toBe(false)
      expect(b.blocked_for_debt).toBe(false)
    })

    it('y con la deuda por las nubes sigue recibiendo pedidos', async () => {
      const { error } = await intentarPedido(seed.businessId)
      expect(error).toBeNull()
    })

    it('el número que se le enseña sale de app_settings', async () => {
      // Lo consume la barra de «Límite de crédito» vía /business/account/summary.
      // Antes estaba escrito a mano en el front.
      const { data, error } = await localClient
        .from('app_settings')
        .select('value')
        .eq('key', 'debt_block_threshold')
        .single()
      expect(error).toBeNull()
      expect(Number((data as { value: number }).value)).toBe(UMBRAL)
    })
  })

  describe('la suspensión que decide una persona sí corta', () => {
    afterAll(async () => {
      await localClient
        .from('businesses')
        .update({ is_blocked: false, block_reason: null })
        .eq('id', seed.businessId)
    })

    it('un negocio suspendido no recibe pedidos, ni por enlace directo', async () => {
      // El agujero que tapa `trg_orders_business_not_blocked`, que la 0179
      // conserva. Se inserta en `orders` a pelo, que es donde acaba
      // `create_customer_order`: si el guard viviera solo dentro de esa RPC,
      // esta prueba pasaría sin probar nada.
      await localClient
        .from('businesses')
        .update({ is_blocked: true, block_reason: 'Suspendido por el admin' })
        .eq('id', seed.businessId)

      const { error } = await intentarPedido(seed.businessId)
      expect(error).not.toBeNull()
      expect(error?.message).toContain('no esta recibiendo pedidos')
    })

    it('y al levantarle la suspensión vuelve a poder', async () => {
      await localClient
        .from('businesses')
        .update({ is_blocked: false, block_reason: null })
        .eq('id', seed.businessId)

      const { error } = await intentarPedido(seed.businessId)
      expect(error).toBeNull()
    })
  })
})

/**
 * La marca «por deuda» de la suspensión (migración 0180).
 *
 * `blocked_for_debt` era una columna huérfana: se apagaba sola pero nadie la
 * encendía en producción. Eso dejaba inalcanzables dos comportamientos que ya
 * estaban escritos — el mensaje «suspendida por deuda acumulada» del panel del
 * negocio, y el desbloqueo automático al liquidar.
 */
describe('la suspensión sabe si es por deuda (integración)', () => {
  let seed: SeededOrder

  beforeAll(async () => {
    seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
  })

  afterAll(async () => {
    await localClient
      .from('businesses')
      .update({ is_blocked: false, blocked_for_debt: false, block_reason: null })
      .eq('id', seed.businessId)
    await cleanup(seed)
  })

  it('sin marcar, la suspensión NO es por deuda', async () => {
    // La firma de tres argumentos sigue viva: `p_for_debt` es opcional.
    const { error } = await localClient.rpc('block_business', {
      p_id: seed.businessId,
      p_reason: 'Fraude en revision',
      p_by: seed.userId,
      // biome-ignore lint/suspicious/noExplicitAny: database.types.ts aún no trae p_for_debt
    } as any)
    expect(error).toBeNull()

    const b = await leerNegocio(seed.businessId)
    expect(b.is_blocked).toBe(true)
    expect(b.blocked_for_debt).toBe(false)
  })

  it('marcándola, queda registrada como deuda', async () => {
    const { error } = await localClient.rpc('block_business', {
      p_id: seed.businessId,
      p_reason: 'Saldo pendiente',
      p_by: seed.userId,
      p_for_debt: true,
      // biome-ignore lint/suspicious/noExplicitAny: database.types.ts aún no trae p_for_debt
    } as any)
    expect(error).toBeNull()

    const b = await leerNegocio(seed.businessId)
    expect(b.is_blocked).toBe(true)
    expect(b.blocked_for_debt).toBe(true)
  })

  it('y suspendido tampoco recibe pedidos', async () => {
    const { error } = await intentarPedido(seed.businessId)
    expect(error).not.toBeNull()
  })
})
