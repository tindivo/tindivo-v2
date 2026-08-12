/**
 * El vecino que NO da GPS y paga por adelantado puede pedir. (Migración 0148)
 *
 * EL FALLO QUE ESTO AMARRA. `create_customer_order` exigía coordenadas a todo
 * método de GPS distinto de `'failed'`, y el canal B2C manda
 * `'manual_skip_prepaid'` SIN coordenadas a propósito: es el valor que significa
 * "no tengo posición y lo compenso pagando por adelantado". El pedido moría con
 * `422 Coordenadas GPS del cliente incompletas`.
 *
 * Lo grave era DÓNDE aparecía. `GeoBlockView` es la pantalla que sale cuando el
 * GPS falló, se denegó o quedó fuera de zona, y su botón de salida
 * (`checkout/page.tsx:42` → `placeOrder({ paymentIntent: 'prepaid', skipGps:
 * true })`) llevaba justo a ese 422: la recuperación del bloqueo por GPS estaba
 * rota. En San Jacinto —teléfonos baratos, señal irregular— ese no es el camino
 * raro.
 *
 * La contradicción vivía dentro de la propia función: doce líneas más abajo del
 * guard, `if p_customer_gps_method in ('failed', 'manual_skip_prepaid')` ya
 * contaba con el valor para marcar `gpsFallbackPrepaid`.
 *
 * El tercer caso NO es de adorno: sin él, «arreglar» el bug borrando el guard
 * entero también pasaría, y el guard protege algo real (un método que dice
 * haber medido, sin medida).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const CUSTOMER_USER_ID = 'e2e00000-0000-4000-8000-000000000003'
const CUSTOMER_PHONE = '+51900000003'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

/** Verificadas dentro del polígono de cobertura (ver `e2e-fixtures.ts`). */
const LAT = -9.151
const LNG = -78.28

const creados: string[] = []

async function crear(gps: Record<string, unknown>) {
  return db.rpc('create_customer_order', {
    p_customer_user_id: CUSTOMER_USER_ID,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: 'prepaid',
    p_customer_name: 'Vecino Sin GPS',
    p_customer_phone: CUSTOMER_PHONE,
    p_delivery_address: 'Jr. Los Pinos 123',
    p_delivery_reference: 'Portón azul, frente al parque',
    p_delivery_lat: LAT,
    p_delivery_lng: LNG,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    ...gps,
  })
}

/**
 * El guard de "un pedido activo por cliente y negocio" haría fallar al SEGUNDO
 * test por un motivo que no es el suyo. Cada caso arranca con el cliente libre.
 */
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

describe('0148 · sin GPS y prepagado, el pedido entra', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('id', BUSINESS_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
  })

  afterEach(async () => {
    for (const id of creados.splice(0)) {
      await db.from('domain_events').delete().eq('aggregate_id', id)
      await db.from('customer_order_items').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
  })

  it('`manual_skip_prepaid` sin coordenadas CREA el pedido y lo marca de riesgo', async () => {
    await limpiarPedidosDelCliente()
    const { data, error } = await crear({ p_customer_gps_method: 'manual_skip_prepaid' })

    expect(error, `el pedido no debería fallar: ${error?.message}`).toBeNull()
    const id = (data as { id: string }).id
    creados.push(id)

    const { data: fila } = await db
      .from('orders')
      .select('status, risk_flags, customer_gps_lat')
      .eq('id', id)
      .single()

    // La bandera es el punto: el pedido entra, pero queda señalado para que la
    // cajera sepa que nadie confirmó dónde vive este cliente.
    expect(fila?.risk_flags).toMatchObject({ gpsFallbackPrepaid: true })
    expect(fila?.customer_gps_lat).toBeNull()
    expect(fila?.status).toBe('pending_acceptance')
  })

  it('`failed` sin coordenadas sigue entrando, como antes', async () => {
    await limpiarPedidosDelCliente()
    const { data, error } = await crear({ p_customer_gps_method: 'failed' })

    expect(error).toBeNull()
    const id = (data as { id: string }).id
    creados.push(id)

    const { data: fila } = await db.from('orders').select('risk_flags').eq('id', id).single()
    expect(fila?.risk_flags).toMatchObject({ gpsFallbackPrepaid: true })
  })

  it('un método que AFIRMA haber medido sigue exigiendo coordenadas', async () => {
    await limpiarPedidosDelCliente()
    const { error } = await crear({ p_customer_gps_method: 'gps_high_accuracy' })

    expect(error?.message).toContain('Coordenadas GPS del cliente incompletas')
  })
})
