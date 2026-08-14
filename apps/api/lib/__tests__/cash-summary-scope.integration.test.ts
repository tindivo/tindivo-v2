/**
 * La pantalla de Efectivo enseña lo MISMO que la entrega va a mover, y NO se
 * vacía a medianoche.
 *
 * EL DESFASE QUE ESTO AMARRA. La rendición nunca miró la fecha —lo que define el
 * corte es el conjunto de pedidos sin cerrar, no el día (0141, y desde 0157 el
 * pedido suelto)— pero el GET de `/driver/cash-settlements` sí filtraba por el
 * día de Lima. Con efectivo de ayer sin rendir, las dos cifras dejaban de
 * coincidir: la pantalla mostraba solo lo de hoy, el RPC movía el total real, y
 * la diferencia le llegaba a la cajera como un faltante que nadie le había
 * mostrado. En el piloto eso es una llamada de veinte minutos por un descuadre
 * que no existe.
 *
 * LA OTRA MITAD, y es requisito explícito: un pedido ENTREGADO que la cajera no
 * confirmó ayer sigue pendiente hoy. La confirmación es humana y nada la fuerza
 * a las 24h (0112), así que ese dinero no puede desaparecer de ninguna de las
 * dos pantallas por el mero hecho de que cambie el día.
 *
 * Se llama al route handler real con un JWT real, como
 * `pilot-whitelist.integration.test.ts`: el filtro vivía en la consulta del
 * endpoint, así que probar el RPC por su cuenta no habría visto nada.
 */
import { createClient } from '@supabase/supabase-js'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  localClient as db,
  E2E,
  seedContraentregaOrder,
  TELEFONOS_FIXTURE,
} from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

import { GET as cashSummary } from '../../app/api/v1/driver/cash-settlements/route'

const DRIVER_EMAIL = 'motorizado@e2e.local'
const E2E_PASSWORD = 'e2e-password-12345'

/** El seeder crea 50 + 2 de envío. */
const TOTAL = 52

interface CashOrder {
  orderId: string
  shortId: string
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  breakdown?: { collected: number; advance: number }
  state: 'pending' | 'delivering' | 'disputed'
  settlementId: string | null
}

interface CashBusinessGroup {
  businessId: string
  businessName: string
  pendingTotal: number
  pendingCount: number
  deliveringTotal: number
  deliveringCount: number
  orders: CashOrder[]
}

let driverToken = ''

/** Deja un pedido entregado y sin rendir, con la fecha de entrega que se pida. */
async function deliveredAt(deliveredAt: Date) {
  const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
  await db
    .from('orders')
    .update({ driver_id: E2E.DRIVER_ID, status: 'picked_up' })
    .eq('id', orderId)

  const { error } = await db.rpc('advance_order', {
    p_order_id: orderId,
    p_actor_user_id: E2E.DRIVER_USER_ID,
    p_actor_role: 'driver',
    p_action: 'deliver',
    p_params: { paymentReal: 'paid_cash' },
  })
  if (error) throw new Error(`deliver failed: ${error.message}`)

  // El sello de entrega lo pone la propia transición; se reescribe DESPUÉS para
  // fabricar el pedido de ayer.
  await db.from('orders').update({ delivered_at: deliveredAt.toISOString() }).eq('id', orderId)
  return orderId
}

async function entregarEfectivo(orderId: string) {
  const { data, error } = await db.rpc('deliver_order_cash', {
    p_driver_user_id: E2E.DRIVER_USER_ID,
    p_order_id: orderId,
  })
  if (error) throw new Error(`deliver_order_cash failed: ${error.message}`)
  return data as { id: string; amount: number }
}

/**
 * Saca de en medio lo que hayan dejado otros tests del mismo par.
 *
 * El `.in('customer_phone', TELEFONOS_FIXTURE)` NO es cosmético. Sin él este
 * update saca de `delivered` a TODO pedido entregado del par e2e, y `delivered`
 * es terminal en el dominio (CLAUDE.md, invariante 8): las ocho funciones que
 * escriben `orders.status` lo respetan, y este `.update()` con service_role era
 * el único sitio del repo que lo pisaba. Se llevaba por delante el pedido de
 * historial del tablero de demo en cada corrida —medido el 2026-08-11: DEMZJJ23
 * pasó de `delivered` a `cancelled` con `cancel_reason` vacío, que es la firma
 * de que no lo canceló ninguna RPC— y dejaba al negocio con un porcentaje de
 * cancelados inventado. El filtro lo acota a lo que sembró un test.
 */
async function parkPending() {
  await db
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('driver_id', E2E.DRIVER_ID)
    .eq('business_id', E2E.BUSINESS_ID)
    .eq('status', 'delivered')
    .is('cash_settlement_id', null)
    .in('customer_phone', TELEFONOS_FIXTURE)

  // Los ciclos abiertos del par también estorban: sus pedidos siguen saliendo en
  // la pantalla como `delivering`. Se cierran, que es el estado terminal normal.
  await db
    .from('cash_settlements')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('driver_id', E2E.DRIVER_ID)
    .eq('business_id', E2E.BUSINESS_ID)
    .in('status', ['pending_confirmation', 'disputed'])
}

async function grupo(): Promise<CashBusinessGroup | undefined> {
  const res = await cashSummary(
    new Request('http://localhost:3001/api/v1/driver/cash-settlements', {
      headers: { authorization: `Bearer ${driverToken}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: { businesses: CashBusinessGroup[] } }
  return body.data.businesses.find((b) => b.businessId === E2E.BUSINESS_ID)
}

describe('lo que la pantalla enseña es lo que la entrega mueve', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('drivers')
      .select('id', { count: 'exact', head: true })
      .eq('id', E2E.DRIVER_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')

    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.auth.signInWithPassword({
      email: DRIVER_EMAIL,
      password: E2E_PASSWORD,
    })
    if (error || !data.session) throw new Error(`login motorizado falló: ${error?.message}`)
    driverToken = data.session.access_token
  })

  beforeEach(parkPending)

  it('el efectivo de ayer sin rendir sigue en la pantalla', async () => {
    const ayer = new Date(Date.now() - 26 * 60 * 60 * 1000)
    const id = await deliveredAt(ayer)

    const g = await grupo()
    expect(g).toBeDefined()
    expect(Number(g?.pendingTotal)).toBe(TOTAL)
    expect(g?.orders.find((o) => o.orderId === id)?.state).toBe('pending')
  })

  // EL TEST QUE IMPORTA. Los dos números tienen que ser el mismo, porque el
  // motorizado lee el de la pantalla en voz alta y la cajera cuenta contra el
  // que la RPC acaba de mover.
  it('el importe de cada línea es el que la RPC mueve', async () => {
    const ayer = await deliveredAt(new Date(Date.now() - 26 * 60 * 60 * 1000))
    const hoy = await deliveredAt(new Date())

    const g = await grupo()
    expect(Number(g?.pendingTotal)).toBe(TOTAL * 2)
    expect(g?.pendingCount).toBe(2)

    for (const orderId of [ayer, hoy]) {
      const enPantalla = g?.orders.find((o) => o.orderId === orderId)
      const movido = await entregarEfectivo(orderId)
      expect(Number(movido.amount)).toBe(Number(enPantalla?.cashOwed))
    }
  })

  // REQUISITO EXPLÍCITO: lo entregado y sin confirmar no se evapora a
  // medianoche. Ese dinero sigue sin cerrar y el motorizado tiene que verlo.
  it('un pedido entregado ayer y sin confirmar sigue visible hoy', async () => {
    const id = await deliveredAt(new Date(Date.now() - 26 * 60 * 60 * 1000))
    const s = await entregarEfectivo(id)

    // Se envejece la liquidación: entregada ayer, aún sin confirmar.
    await db
      .from('cash_settlements')
      .update({
        settlement_date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString().slice(0, 10),
        delivered_at_ts: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', s.id)

    const g = await grupo()
    const linea = g?.orders.find((o) => o.orderId === id)
    expect(linea?.state).toBe('delivering')
    expect(linea?.settlementId).toBe(s.id)
    // Y ya no cuenta como dinero encima: lo entregó.
    expect(Number(g?.deliveringTotal)).toBe(TOTAL)
    expect(Number(g?.pendingTotal)).toBe(0)
  })

  it('una liquidación en disputa se marca como tal, no desaparece', async () => {
    const id = await deliveredAt(new Date())
    const s = await entregarEfectivo(id)
    const { error } = await db.rpc('dispute_cash_settlement', {
      p_id: s.id,
      p_business_user_id: E2E.BUSINESS_USER_ID,
      p_reported_amount: 10,
      p_note: 'faltaba plata',
    })
    if (error) throw new Error(`dispute failed: ${error.message}`)

    const g = await grupo()
    expect(g?.orders.find((o) => o.orderId === id)?.state).toBe('disputed')
  })

  // Lo confirmado sale de la pantalla: ese dinero ya no es problema de nadie, y
  // arrastrarlo por la lista es lo que hace difícil ver lo que falta.
  it('lo confirmado ya no aparece', async () => {
    const id = await deliveredAt(new Date())
    const s = await entregarEfectivo(id)
    await db.rpc('confirm_order_cash', {
      p_settlement_id: s.id,
      p_business_user_id: E2E.BUSINESS_USER_ID,
    })

    const g = await grupo()
    expect(g?.orders.find((o) => o.orderId === id)).toBeUndefined()
  })

  describe('el desglose por pedido', () => {
    it('lista cada pedido con nombre, hora e importe', async () => {
      const id = await deliveredAt(new Date())
      await db.from('orders').update({ customer_name: 'Carmen' }).eq('id', id)

      const g = await grupo()
      const order = g?.orders.find((o) => o.orderId === id)
      expect(order).toBeDefined()
      expect(order?.customerName).toBe('Carmen')
      expect(order?.deliveredAt).toBeTruthy()
      expect(order?.cashOwed).toBe(TOTAL)
    })

    it('el nombre puede faltar: la pantalla cae al código', async () => {
      const id = await deliveredAt(new Date())
      const g = await grupo()
      expect(g?.orders.find((o) => o.orderId === id)?.customerName).toBeNull()
      expect(g?.orders.find((o) => o.orderId === id)?.shortId).toHaveLength(8)
    })

    // LA PREGUNTA QUE EL DESGLOSE VIENE A RESPONDER: "¿por qué debo S/ 8 de un
    // pedido que se pagó por Yape?". Sin esto, el número no se puede explicar.
    it('con adelanto trae el desglose; sin adelanto no lo trae', async () => {
      const { orderId: yapeId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
      await db
        .from('orders')
        .update({
          driver_id: E2E.DRIVER_ID,
          status: 'picked_up',
          client_pays_with: 60,
          change_to_give: 8,
        })
        .eq('id', yapeId)
      const { error } = await db.rpc('advance_order', {
        p_order_id: yapeId,
        p_actor_user_id: E2E.DRIVER_USER_ID,
        p_actor_role: 'driver',
        p_action: 'deliver',
        p_params: { paymentReal: 'paid_yape' },
      })
      if (error) throw new Error(`deliver failed: ${error.message}`)

      const sinAdelanto = await deliveredAt(new Date())

      const g = await grupo()
      const conAdelanto = g?.orders.find((o) => o.orderId === yapeId)
      expect(conAdelanto?.cashOwed).toBe(8)
      expect(conAdelanto?.breakdown).toEqual({ collected: 0, advance: 8 })

      expect(g?.orders.find((o) => o.orderId === sinAdelanto)?.breakdown).toBeUndefined()
    })

    // El desglose tiene que sumar el total, o la pantalla se contradice sola.
    it('los pedidos suman exactamente el total del negocio', async () => {
      await deliveredAt(new Date())
      await deliveredAt(new Date())

      const g = await grupo()
      const pendientes = g?.orders.filter((o) => o.state === 'pending') ?? []
      expect(pendientes.reduce((s, o) => s + o.cashOwed, 0)).toBe(g?.pendingTotal)
      expect(pendientes.length).toBe(g?.pendingCount)
    })
  })
})
