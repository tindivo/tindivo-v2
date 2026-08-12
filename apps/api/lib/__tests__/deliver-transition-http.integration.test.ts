/**
 * El cobro real ATRAVESANDO LA CAPA HTTP, no solo el RPC.
 *
 * POR QUÉ EXISTE ESTE FICHERO.
 * `deliver-payment.integration.test.ts` llama a `advance_order` directamente, y
 * eso deja sin cubrir el tramo que va del cuerpo JSON a `p_params`: el esquema
 * zod y el reenvío de claves. Un error ahí no falla ruidosamente — los importes
 * simplemente NO llegarían, `advance_order` caería a la división planeada y el
 * corte de caja saldría mal en silencio. Justo el tipo de fallo que estas dos
 * migraciones venían a eliminar.
 *
 * Se ejerce `handleOrderTransition` con un `Request` real y un JWT real del
 * motorizado del mundo e2e: es lo que corre en producción salvo el enrutado.
 */
import { createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import { handleOrderTransition } from '../http/order-transition'
import { localClient as db, E2E, seedContraentregaOrder } from './helpers/local-db'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const TOTAL = 52

/**
 * El handler construye su propio cliente desde el entorno, y vitest no lo trae.
 * Los demás tests de integración no se enteran porque usan el cliente del
 * helper con las llaves ya puestas; este sí, porque el objetivo es ejercer la
 * capa HTTP tal como corre. Se apuntan a la MISMA base local.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= LOCAL_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= LOCAL_ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY ??= LOCAL_SERVICE_ROLE_KEY

let accessToken = ''

async function pickedUp(overrides: Record<string, unknown> = {}) {
  const { orderId } = await seedContraentregaOrder(E2E.BUSINESS_ID)
  await db
    .from('orders')
    .update({ driver_id: E2E.DRIVER_ID, status: 'picked_up', ...overrides })
    .eq('id', orderId)
  return orderId
}

function deliverRequest(body: Record<string, unknown>) {
  return new Request(`${LOCAL_URL}/api/v1/driver/orders/x/transition`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'deliver', ...body }),
  })
}

async function read(orderId: string) {
  const { data } = await db
    .from('orders')
    .select('payment_real,cash_owed_at_delivery,cash_amount,yape_amount,change_to_give')
    .eq('id', orderId)
    .single()
  return data
}

describe('deliver por HTTP: los importes llegan hasta la base', () => {
  beforeAll(async () => {
    // CLIENTE APARTE, y no `localClient`: `signInWithPassword` sustituye la
    // sesión del cliente sobre el que se llama, así que hacerlo en el
    // compartido lo degradaría de `service_role` a la del motorizado — y todos
    // los `insert` del seed pasarían a chocar con RLS.
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anon.auth.signInWithPassword({
      email: 'motorizado@e2e.local',
      password: 'e2e-password-12345',
    })
    if (error || !data.session) {
      throw new Error(
        `No se pudo autenticar el motorizado e2e: ${error?.message}. Corre \`pnpm db:seed:e2e\`.`,
      )
    }
    accessToken = data.session.access_token
  })

  // EL TRAMO QUE NO ESTABA CUBIERTO. Si una clave se llamara distinto en el
  // esquema o en el reenvío, esto pasaría igual de "verde" con la division
  // PLANEADA — por eso se comprueban los importes, no solo el 200.
  it('un mixto editado llega con SU división, no con la planeada', async () => {
    const orderId = await pickedUp({
      payment_intent: 'pending_mixed',
      cash_amount: 40, // lo planeado
      yape_amount: 12,
    })

    const res = await handleOrderTransition(
      deliverRequest({
        paymentReal: 'paid_mixed',
        cashAmount: 25, // lo que de verdad pasó
        yapeAmount: 27,
        clientPaysWith: 50,
      }),
      'driver',
      orderId,
    )
    expect(res.status).toBe(200)

    const o = await read(orderId)
    expect(o?.payment_real).toBe('paid_mixed')
    expect(Number(o?.cash_amount)).toBe(25)
    expect(Number(o?.yape_amount)).toBe(27)
    // Lo que decide el corte de caja: 25, no los 40 planeados.
    expect(Number(o?.cash_owed_at_delivery)).toBe(25)
    expect(Number(o?.change_to_give)).toBe(25)
  })

  it('un cambio a efectivo llega con el billete y calcula el vuelto', async () => {
    const orderId = await pickedUp({ payment_intent: 'pending_yape' })

    const res = await handleOrderTransition(
      deliverRequest({ paymentReal: 'paid_cash', clientPaysWith: 100 }),
      'driver',
      orderId,
    )
    expect(res.status).toBe(200)

    const o = await read(orderId)
    expect(o?.payment_real).toBe('paid_cash')
    expect(Number(o?.cash_owed_at_delivery)).toBe(TOTAL)
    expect(Number(o?.change_to_give)).toBe(100 - TOTAL)
  })

  it('el camino de siempre sigue funcionando sin importes', async () => {
    const orderId = await pickedUp()
    const res = await handleOrderTransition(
      deliverRequest({ paymentReal: 'paid_cash' }),
      'driver',
      orderId,
    )
    expect(res.status).toBe(200)
    expect(Number((await read(orderId))?.cash_owed_at_delivery)).toBe(TOTAL)
  })

  // La validación de dinero vive en la base, y tiene que seguir viva cuando se
  // entra por HTTP: el esquema zod solo mira la FORMA.
  it('una división que no suma se rechaza, y el pedido NO queda entregado', async () => {
    const orderId = await pickedUp()
    const res = await handleOrderTransition(
      deliverRequest({ paymentReal: 'paid_mixed', cashAmount: 5, yapeAmount: 5 }),
      'driver',
      orderId,
    )
    expect(res.status).toBeGreaterThanOrEqual(400)

    const o = await read(orderId)
    expect(o?.payment_real).toBeNull()
    expect(o?.cash_owed_at_delivery).toBeNull()
  })

  it('un importe con forma inválida lo corta el esquema antes de la base', async () => {
    const orderId = await pickedUp()
    const res = await handleOrderTransition(
      deliverRequest({ paymentReal: 'paid_cash', clientPaysWith: -5 }),
      'driver',
      orderId,
    )
    expect(res.status).toBe(422)
    expect((await read(orderId))?.payment_real).toBeNull()
  })
})
