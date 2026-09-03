/**
 * La nota al motorizado llega a `orders.customer_notes` (0199).
 *
 * QUÉ AMARRA. La 0127 mató `p_notes` porque el cuerpo de la función NUNCA lo
 * referenció: durante 47 migraciones el endpoint lo enviaba en cada llamada y
 * se descartaba en silencio — ni error, ni columna, ni log. Un parámetro que se
 * acepta y se tira es el peor de los fallos porque no se ve desde ningún lado.
 *
 * Estos tests existen para que eso no pueda repetirse: comprueban que lo que se
 * manda ESTÁ en la fila, no que la llamada no reviente.
 *
 * Y comprueban el saneo, que vive en la base a propósito (el navegador se puede
 * saltar): recorte, colapso de saltos de línea, vacío -> NULL y tope de 200.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const CUSTOMER_USER_ID = 'e2e00000-0000-4000-8000-000000000003'
const CUSTOMER_PHONE = '+51900000003'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'
const PIN = { lat: -9.151, lng: -78.28 }

/** El tope del `left(..., 200)` de la RPC, del Zod y de `CUSTOMER_NOTE_MAX`. */
const TOPE = 200

async function crearPedido(nota?: string): Promise<string | null> {
  const { data, error } = await db.rpc('create_customer_order', {
    p_customer_user_id: CUSTOMER_USER_ID,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'delivery',
    // Prepago: el primer pedido de un cliente lo exige, y el método de pago no
    // entra en nada de lo que se prueba aquí.
    p_payment_intent: 'prepaid',
    p_customer_name: 'Vecino con Nota',
    p_customer_phone: CUSTOMER_PHONE,
    p_delivery_address: 'Jr. Prueba 1',
    p_delivery_reference: 'Puerta azul',
    p_delivery_lat: PIN.lat,
    p_delivery_lng: PIN.lng,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    ...(nota === undefined ? {} : { p_customer_notes: nota }),
  })
  if (error) throw new Error(`create_customer_order: ${error.message}`)
  const { data: row } = await db
    .from('orders')
    .select('customer_notes')
    .eq('id', (data as { id: string }).id)
    .single()
  return (row as { customer_notes: string | null }).customer_notes
}

/** El guard de «un pedido activo por cliente y negocio» tumbaría el 2.º caso. */
async function limpiarPedidosDelCliente() {
  const { data } = await db
    .from('orders')
    .select('id')
    .eq('customer_user_id', CUSTOMER_USER_ID)
    .not('status', 'in', '("delivered","cancelled")')
  for (const o of data ?? []) {
    await db.from('domain_events').delete().eq('aggregate_id', o.id)
    await db.from('customer_order_items').delete().eq('order_id', o.id)
    await db.from('orders').delete().eq('id', o.id)
  }
}

describe('la nota al motorizado llega a la fila del pedido', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('id', BUSINESS_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
    await limpiarPedidosDelCliente()
  })

  afterEach(limpiarPedidosDelCliente)

  it('se guarda tal cual la escribió el cliente', async () => {
    expect(await crearPedido('Toca el timbre dos veces')).toBe('Toca el timbre dos veces')
  })

  // La red contra el fallo de `p_notes`: sin el parámetro, la llamada de 18
  // argumentos por nombre tiene que seguir resolviendo (no ambigua) y dejar la
  // columna en NULL, no en ''.
  it('sin nota, la columna queda en NULL y el pedido se crea igual', async () => {
    expect(await crearPedido()).toBeNull()
  })

  it('una nota en blanco es NULL, no cadena vacía', async () => {
    // Si guardara '', el motorizado vería la etiqueta «Nota del cliente:»
    // seguida de nada, porque su condición es `{order.customerNotes && ...}`.
    expect(await crearPedido('   \n  ')).toBeNull()
  })

  it('recorta los bordes y colapsa los saltos de línea', async () => {
    // El campo es un textarea; la ficha del motorizado la pinta en una línea.
    expect(await crearPedido('  casa azul\n\n  con reja  ')).toBe('casa azul con reja')
  })

  it('corta en el tope aunque el navegador no lo haya hecho', async () => {
    const larga = 'x'.repeat(TOPE + 150)
    const guardada = await crearPedido(larga)
    expect(guardada).toHaveLength(TOPE)
  })
})
