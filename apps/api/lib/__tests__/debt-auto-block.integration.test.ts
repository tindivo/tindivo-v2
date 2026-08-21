/**
 * Test de INTEGRACIÓN de la suspensión automática por deuda — migración 0178.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 *
 * QUÉ PROTEGE
 * Que el límite de crédito **haga algo**. Antes de la 0178 el número era un
 * adorno de la pantalla del negocio: `recalc_business_balance` solo volvía a
 * sumar el ledger, y suspender era siempre una decisión a mano del admin.
 *
 * Y sobre todo, que suspender IMPIDA PEDIR. Ese era el agujero de verdad:
 * `create_business_manual_order` sí rechazaba a un negocio suspendido, pero
 * `create_customer_order` no lo miraba siquiera — solo comprobaba el bloqueo del
 * cliente. Como la página del negocio se comparte por slug desde la `0165`,
 * cualquiera con el enlace guardado en WhatsApp seguía pudiendo pedirle a un
 * negocio suspendido. Un corte que no corta es peor que ninguno: da por
 * resuelto un riesgo que sigue abierto.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient, type SeededOrder, seedPrepaidOrder } from './helpers/local-db'

const UMBRAL = 600

interface EstadoNegocio {
  balance_due: number
  is_blocked: boolean
  blocked_for_debt: boolean
  block_reason: string | null
}

async function leerNegocio(businessId: string): Promise<EstadoNegocio> {
  const { data, error } = await localClient
    .from('businesses')
    .select('balance_due, is_blocked, blocked_for_debt, block_reason')
    .eq('id', businessId)
    .single()
  if (error) throw new Error(`leerNegocio failed: ${error.message}`)
  const b = data as unknown as EstadoNegocio
  return { ...b, balance_due: Number(b.balance_due) }
}

/** Un cargo pendiente cualquiera: es lo que mueve `balance_due` vía trigger. */
async function cargar(businessId: string, amount: number, orderId: string): Promise<string> {
  const { data, error } = await localClient
    .from('business_charges')
    .insert({
      business_id: businessId,
      order_id: orderId,
      charge_type: 'commission',
      amount,
      status: 'pending',
      description: 'Cargo de prueba (0178)',
    })
    .select('id')
    .single()
  if (error) throw new Error(`cargar failed: ${error.message}`)
  return (data as { id: string }).id
}

describe('suspensión automática por deuda (integración)', () => {
  let seed: SeededOrder
  const cargos: string[] = []

  beforeAll(async () => {
    seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
  })

  afterAll(async () => {
    if (cargos.length > 0) await localClient.from('business_charges').delete().in('id', cargos)
    await cleanup(seed)
  })

  it('por debajo del umbral el negocio sigue vendiendo', async () => {
    cargos.push(await cargar(seed.businessId, UMBRAL - 1, seed.orderId))
    const b = await leerNegocio(seed.businessId)
    expect(b.balance_due).toBe(UMBRAL - 1)
    expect(b.is_blocked).toBe(false)
  })

  it('AL ALCANZAR el umbral se suspende solo, con el motivo escrito', async () => {
    // El corte es en `>=`, no en `>`: 600 clavados ya suspende.
    cargos.push(await cargar(seed.businessId, 1, seed.orderId))
    const b = await leerNegocio(seed.businessId)
    expect(b.balance_due).toBe(UMBRAL)
    expect(b.is_blocked).toBe(true)
    expect(b.blocked_for_debt).toBe(true)
    expect(b.block_reason).toContain('Suspension automatica')
  })

  it('y suspendido NO se le puede pedir, ni con el enlace directo', async () => {
    // El agujero que tapa la 0178. Se inserta en `orders` a pelo, que es lo que
    // acaba haciendo `create_customer_order`: si el guard viviera solo dentro de
    // esa RPC, esta prueba pasaría igual y no probaría nada.
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let shortId = ''
    for (let i = 0; i < 8; i++) shortId += charset[Math.floor(Math.random() * charset.length)]

    const { error } = await localClient.from('orders').insert({
      business_id: seed.businessId,
      short_id: shortId,
      customer_phone: '+51999000222',
      order_amount: 30,
      delivery_fee: 2,
      payment_intent: 'pending_cash',
      status: 'pending_acceptance',
    })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('no esta recibiendo pedidos')
  })

  it('al bajar del umbral se levanta la suspensión sola', async () => {
    // Sin exigir que pague TODO. `settle_business_charges` desbloqueaba solo con
    // `balance_due <= 0`, que como regla manual valía; como regla automática
    // obligaría a pagar los 600 enteros para volver a vender, cuando lo que se
    // le anuncia al negocio es un límite de 600.
    const uno = cargos.pop()
    if (uno) await localClient.from('business_charges').delete().eq('id', uno)

    const b = await leerNegocio(seed.businessId)
    expect(b.balance_due).toBe(UMBRAL - 1)
    expect(b.is_blocked).toBe(false)
    expect(b.blocked_for_debt).toBe(false)
    expect(b.block_reason).toBeNull()
  })

  it('y vuelve a poder recibir pedidos', async () => {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let shortId = ''
    for (let i = 0; i < 8; i++) shortId += charset[Math.floor(Math.random() * charset.length)]

    const { data, error } = await localClient
      .from('orders')
      .insert({
        business_id: seed.businessId,
        short_id: shortId,
        customer_phone: '+51999000222',
        order_amount: 30,
        delivery_fee: 2,
        payment_intent: 'pending_cash',
        status: 'pending_acceptance',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    if (data)
      await localClient
        .from('orders')
        .delete()
        .eq('id', (data as { id: string }).id)
  })

  it('el umbral lo decide app_settings, no el código', async () => {
    // Mismo saldo de 599, umbral bajado a 100: si la función llevara el número
    // escrito a mano, el negocio seguiría vendiendo.
    const { data: previo } = await localClient
      .from('app_settings')
      .select('value')
      .eq('key', 'debt_block_threshold')
      .single()

    await localClient.from('app_settings').update({ value: 100 }).eq('key', 'debt_block_threshold')
    // El trigger solo corre al tocar un cargo: se fuerza con un no-op.
    await localClient
      .from('business_charges')
      .update({ description: 'Cargo de prueba (0178) · re-evaluado' })
      .eq('id', cargos[0])

    expect((await leerNegocio(seed.businessId)).is_blocked).toBe(true)

    await localClient
      .from('app_settings')
      .update({ value: (previo as { value: number } | null)?.value ?? UMBRAL })
      .eq('key', 'debt_block_threshold')
    await localClient
      .from('business_charges')
      .update({ description: 'Cargo de prueba (0178)' })
      .eq('id', cargos[0])
    expect((await leerNegocio(seed.businessId)).is_blocked).toBe(false)
  })

  it('no pisa una suspensión del admin por otro motivo', async () => {
    // Si el admin bloqueó por fraude, llegar al umbral no le cambia la razón, y
    // pagar la deuda no le levanta el castigo.
    await localClient
      .from('businesses')
      .update({ is_blocked: true, blocked_for_debt: false, block_reason: 'Fraude en revision' })
      .eq('id', seed.businessId)

    cargos.push(await cargar(seed.businessId, 200, seed.orderId))
    let b = await leerNegocio(seed.businessId)
    expect(b.balance_due).toBeGreaterThanOrEqual(UMBRAL)
    expect(b.block_reason).toBe('Fraude en revision')
    expect(b.blocked_for_debt).toBe(false)

    const ultimo = cargos.pop()
    if (ultimo) await localClient.from('business_charges').delete().eq('id', ultimo)
    b = await leerNegocio(seed.businessId)
    expect(b.is_blocked).toBe(true)
    expect(b.block_reason).toBe('Fraude en revision')

    await localClient
      .from('businesses')
      .update({ is_blocked: false, block_reason: null })
      .eq('id', seed.businessId)
  })
})
