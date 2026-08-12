/**
 * La pantalla de Efectivo enseña lo MISMO que la liquidación va a cobrar.
 *
 * EL DESFASE QUE ESTO AMARRA. `create_cash_settlement` liquida todos los
 * pedidos sin rendir de ese par motorizado-negocio, sin mirar la fecha ("es el
 * conjunto que define la rendición: no la fecha", 0141). El GET de
 * `/driver/cash-settlements` sí filtraba por el día de Lima.
 *
 * Con efectivo de ayer sin rendir, las dos cifras dejaban de coincidir: la
 * pantalla mostraba solo lo de hoy y pre-rellenaba el formulario con ese
 * número, el RPC guardaba el total real en `total_cash`, y la diferencia le
 * llegaba a la cajera como un faltante de dinero que nadie le había mostrado.
 * En el piloto eso es una llamada de veinte minutos por un descuadre que no
 * existe.
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

interface SettlementOrder {
  orderId: string
  shortId: string
  customerName: string | null
  deliveredAt: string | null
  cashOwed: number
  breakdown?: { collected: number; advance: number }
}

interface TodayRow {
  businessId: string
  expected: number
  orderCount: number
  kind: 'pending' | 'awaiting'
  orders: SettlementOrder[]
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
}

async function pendingRow(): Promise<TodayRow | undefined> {
  const res = await cashSummary(
    new Request('http://localhost:3001/api/v1/driver/cash-settlements', {
      headers: { authorization: `Bearer ${driverToken}` },
    }),
  )
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: { today: TodayRow[] } }
  return body.data.today.find((r) => r.kind === 'pending' && r.businessId === E2E.BUSINESS_ID)
}

describe('lo que la pantalla enseña es lo que la rendición cobra', () => {
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
    await deliveredAt(ayer)

    const row = await pendingRow()
    expect(row).toBeDefined()
    expect(Number(row?.expected)).toBe(TOTAL)
  })

  // EL TEST QUE IMPORTA. Los dos números tienen que ser el mismo, porque el
  // motorizado confirma el de la pantalla y la cajera cuenta contra el del RPC.
  it('el total de la pantalla coincide con el que liquida el RPC', async () => {
    await deliveredAt(new Date(Date.now() - 26 * 60 * 60 * 1000)) // ayer
    await deliveredAt(new Date()) // hoy

    const row = await pendingRow()
    expect(Number(row?.expected)).toBe(TOTAL * 2)
    expect(row?.orderCount).toBe(2)

    const { data, error } = await db.rpc('create_cash_settlement', {
      p_driver_user_id: E2E.DRIVER_USER_ID,
      p_business_id: E2E.BUSINESS_ID,
      p_settlement_date: new Date().toISOString().slice(0, 10),
    })
    if (error) throw new Error(`settle failed: ${error.message}`)
    const settlement = data as { expected: number; orderCount: number }

    expect(Number(settlement.expected)).toBe(Number(row?.expected))
    expect(settlement.orderCount).toBe(row?.orderCount)
  })

  // Un ciclo que la cajera no confirmó no se evapora a medianoche: ese dinero
  // sigue sin cerrar y el motorizado tiene que verlo.
  it('un ciclo abierto de ayer sigue visible hoy', async () => {
    await deliveredAt(new Date())
    const { error } = await db.rpc('create_cash_settlement', {
      p_driver_user_id: E2E.DRIVER_USER_ID,
      p_business_id: E2E.BUSINESS_ID,
      p_settlement_date: new Date().toISOString().slice(0, 10),
    })
    if (error) throw new Error(`settle failed: ${error.message}`)

    // Se envejece el ciclo: entregado ayer, aún sin confirmar.
    await db
      .from('cash_settlements')
      .update({
        settlement_date: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString().slice(0, 10),
      })
      .eq('driver_id', E2E.DRIVER_ID)
      .eq('business_id', E2E.BUSINESS_ID)
      .eq('status', 'pending_confirmation')

    const res = await cashSummary(
      new Request('http://localhost:3001/api/v1/driver/cash-settlements', {
        headers: { authorization: `Bearer ${driverToken}` },
      }),
    )
    const body = (await res.json()) as { data: { today: TodayRow[] } }
    const awaiting = body.data.today.filter(
      (r) => r.kind === 'awaiting' && r.businessId === E2E.BUSINESS_ID,
    )
    expect(awaiting.length).toBeGreaterThan(0)
    // El desglose sobrevive a declarar la entrega: es lo que permite señalar
    // CUÁL pedido no cuadra cuando la cajera cuenta el fajo.
    expect(awaiting[0]?.orders.length).toBeGreaterThan(0)
  })

  describe('el desglose por pedido', () => {
    it('lista cada pedido con nombre, hora e importe', async () => {
      const id = await deliveredAt(new Date())
      await db.from('orders').update({ customer_name: 'Carmen' }).eq('id', id)

      const row = await pendingRow()
      const order = row?.orders.find((o) => o.orderId === id)
      expect(order).toBeDefined()
      expect(order?.customerName).toBe('Carmen')
      expect(order?.deliveredAt).toBeTruthy()
      expect(order?.cashOwed).toBe(TOTAL)
    })

    it('el nombre puede faltar: la pantalla cae al código', async () => {
      const id = await deliveredAt(new Date())
      const row = await pendingRow()
      expect(row?.orders.find((o) => o.orderId === id)?.customerName).toBeNull()
      expect(row?.orders.find((o) => o.orderId === id)?.shortId).toHaveLength(8)
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

      const row = await pendingRow()
      const conAdelanto = row?.orders.find((o) => o.orderId === yapeId)
      expect(conAdelanto?.cashOwed).toBe(8)
      expect(conAdelanto?.breakdown).toEqual({ collected: 0, advance: 8 })

      expect(row?.orders.find((o) => o.orderId === sinAdelanto)?.breakdown).toBeUndefined()
    })

    // El desglose tiene que sumar el total, o la pantalla se contradice sola.
    it('los pedidos suman exactamente el total del negocio', async () => {
      await deliveredAt(new Date())
      await deliveredAt(new Date())

      const row = await pendingRow()
      const suma = row?.orders.reduce((s, o) => s + o.cashOwed, 0)
      expect(suma).toBe(row?.expected)
      expect(row?.orders.length).toBe(row?.orderCount)
    })
  })
})
