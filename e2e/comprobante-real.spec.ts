/**
 * EL COMPROBANTE DE PAGO, por el camino real y sin atajos (P0.7).
 *
 * Complementa a `viaje-pedido-online.spec.ts`, que sube el comprobante por la
 * pantalla del cliente. Aquí se prueban los bordes del mismo camino con HTTP
 * real contra `apps/api` (:3001) y Storage real, con la sesión del cliente:
 *
 *   1. Pedido cancelado + comprobante → 409 `invalid_state_transition`, el
 *      pedido SIGUE cancelado y no queda rastro del comprobante (C2).
 *   2. Un comprobante registrado no se puede cambiar ni sobrescribir (0249,
 *      0258): otra ruta → 409; subir encima de la misma ruta → Storage lo niega.
 *
 * NINGÚN `UPDATE` simula el pago ni el estado del pedido: lo único que se
 * siembra es la fila inicial `awaiting_payment` (el pedido ya aceptado) y se
 * retrasa su plazo para que el cron REAL (`cancel_expired_prepay_orders`) lo
 * cancele. Todo lo demás lo hacen la sesión del cliente, la ruta y la RPC.
 *
 * Requiere, como el resto: Supabase local, apps/customer y apps/api levantadas
 * y el mundo e2e sembrado (`pnpm db:seed:e2e`).
 */
import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'
const API = 'http://localhost:3001/api/v1'
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const CUSTOMER_USER_ID = 'e2e00000-0000-4000-8000-000000000003'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
/** Teléfono-marcador de los fixtures: lo barren las suites de integración. */
const TELEFONO_FIXTURE = '+51999000222'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(LOCAL_URL, SERVICE_KEY, opts)

let cliente: SupabaseClient
let token = ''
const sembrados: string[] = []

async function pedidoEsperandoPago(): Promise<string> {
  // El cliente solo puede tener un pedido abierto por negocio: se despeja.
  const { data: vivos } = await admin
    .from('orders')
    .select('id')
    .eq('customer_user_id', CUSTOMER_USER_ID)
    .eq('customer_phone', TELEFONO_FIXTURE)
  for (const o of vivos ?? []) await borrar(o.id)

  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let shortId = ''
  for (let i = 0; i < 8; i++) shortId += charset[Math.floor(Math.random() * charset.length)]
  const { data, error } = await admin
    .from('orders')
    .insert({
      business_id: BUSINESS_ID,
      customer_user_id: CUSTOMER_USER_ID,
      short_id: shortId,
      customer_phone: TELEFONO_FIXTURE,
      order_amount: 50,
      delivery_fee: 3,
      payment_intent: 'prepaid',
      status: 'awaiting_payment',
      validation_context: 'proof',
      proof_attempt: 0,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`no se pudo sembrar el pedido: ${error?.message}`)
  sembrados.push(data.id)
  return data.id
}

async function borrar(orderId: string) {
  const carpeta = `${CUSTOMER_USER_ID}/${orderId}`
  const { data: objetos } = await admin.storage.from('payment-proofs').list(carpeta)
  const rutas = (objetos ?? []).map((o) => `${carpeta}/${o.name}`)
  if (rutas.length) await admin.storage.from('payment-proofs').remove(rutas)
  await admin.from('domain_events').delete().eq('aggregate_id', orderId)
  await admin.from('order_event_log').delete().eq('order_id', orderId)
  await admin.from('orders').delete().eq('id', orderId)
}

/** Sube con la sesión del CLIENTE (RLS de Storage), no con service role. */
function subir(orderId: string, tag: string, opciones?: { upsert: boolean }) {
  const path = `${CUSTOMER_USER_ID}/${orderId}/attempt-1-${tag}.png`
  return {
    path,
    resultado: cliente.storage
      .from('payment-proofs')
      .upload(path, PNG_1X1, { contentType: 'image/png', ...opciones }),
  }
}

async function leer(orderId: string) {
  const { data } = await admin
    .from('orders')
    .select('status, proof_attempt, comprobante_prepago_url, cancel_reason')
    .eq('id', orderId)
    .single()
  return data
}

test.describe('comprobante de pago: camino real', () => {
  test.beforeAll(async () => {
    cliente = createClient(LOCAL_URL, ANON_KEY, opts)
    const { data, error } = await cliente.auth.signInWithPassword({
      email: 'cliente@e2e.local',
      password: 'e2e-password-12345',
    })
    if (error || !data.session) {
      throw new Error(`no se pudo autenticar al cliente e2e: ${error?.message}`)
    }
    token = data.session.access_token
  })

  test.afterEach(async () => {
    while (sembrados.length) {
      const id = sembrados.pop()
      if (id) await borrar(id)
    }
  })

  function registrar(
    request: import('@playwright/test').APIRequestContext,
    id: string,
    path: string,
  ) {
    return request.post(`${API}/customer/orders/${id}/prepay-proof`, {
      headers: { authorization: `Bearer ${token}` },
      data: { path },
    })
  }

  test('pedido cancelado + comprobante: 409 y el pedido sigue cancelado', async ({ request }) => {
    const id = await pedidoEsperandoPago()

    // El cliente ya subió su captura a Storage (con su sesión)...
    const { path, resultado } = subir(id, 'tarde')
    const { error: errSubida } = await resultado
    expect(errSubida, `la subida con la sesión del cliente falló: ${errSubida?.message}`).toBeNull()

    // ...pero el plazo de pago venció y el cron REAL cancela el pedido.
    const { error: errPlazo } = await admin
      .from('orders')
      .update({ awaiting_payment_at: new Date(Date.now() - 60 * 60_000).toISOString() })
      .eq('id', id)
    expect(errPlazo).toBeNull()
    const { error: errCron } = await admin.rpc('cancel_expired_prepay_orders')
    expect(errCron).toBeNull()
    expect((await leer(id))?.status).toBe('cancelled')

    // El comprobante llega tarde por la ruta real.
    const res = await registrar(request, id, path)
    expect(res.status(), await res.text()).toBe(409)
    expect((await res.json()).code).toBe('invalid_state_transition')

    // Sigue cancelado, sin intento gastado ni comprobante registrado.
    const o = await leer(id)
    expect(o?.status).toBe('cancelled')
    expect(o?.cancel_reason).toBe('prepay_timeout')
    expect(o?.proof_attempt).toBe(0)
    expect(o?.comprobante_prepago_url).toBeNull()
    const { data: ev } = await admin
      .from('domain_events')
      .select('id')
      .eq('aggregate_id', id)
      .eq('event_type', 'OrderPrepayProofUploaded')
    expect(ev).toHaveLength(0)
  })

  test('el comprobante registrado no se cambia ni se sobrescribe', async ({ request }) => {
    const id = await pedidoEsperandoPago()
    const { path, resultado } = subir(id, 'uno')
    expect((await resultado).error).toBeNull()

    // Camino feliz: SOLO la ruta lo pasa a `validando`.
    expect((await leer(id))?.status).toBe('awaiting_payment')
    const ok = await registrar(request, id, path)
    expect(ok.status(), await ok.text()).toBe(200)
    const registrado = await leer(id)
    expect(registrado?.status).toBe('validando')
    expect(registrado?.comprobante_prepago_url).toBe(path)
    expect(registrado?.proof_attempt).toBe(1)

    // Otro archivo sobre el mismo pedido: 409, nada cambia.
    const otro = subir(id, 'dos')
    expect((await otro.resultado).error).toBeNull()
    const cambio = await registrar(request, id, otro.path)
    expect(cambio.status(), await cambio.text()).toBe(409)
    expect((await leer(id))?.comprobante_prepago_url).toBe(path)

    // Y el archivo registrado no se puede pisar desde Storage (0258).
    const { error: errPisar } = await cliente.storage
      .from('payment-proofs')
      .upload(path, Buffer.from('otra imagen'), { contentType: 'image/png', upsert: true })
    expect(errPisar, 'Storage dejó sobrescribir el comprobante registrado').not.toBeNull()
    const { data: intacto } = await admin.storage.from('payment-proofs').download(path)
    expect(Buffer.from(await (intacto as Blob).arrayBuffer()).equals(PNG_1X1)).toBe(true)
  })
})
