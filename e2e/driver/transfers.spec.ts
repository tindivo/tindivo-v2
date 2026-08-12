import { expect, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: helper de tests
const db = localClient as any

const MOTOS = 'http://localhost:3004'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Alfabeto sin I/O/0/1, 8 caracteres — la misma regla que la DB. */
function shortId(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/**
 * Marcador de propiedad: todo pedido que siembre este fichero lo lleva.
 *
 * Sin él, `wipe()` borraba «por negocio» y arrastraba lo de todo el mundo —la
 * misma trampa que `parkPending()` ya documentó en la suite de caja—.
 */
const TELEFONO_FIXTURE = '+51999004444'

/**
 * Borra SOLO lo que sembró este fichero, y GRITA si no puede.
 *
 * LAS DOS COSAS ERAN EL BUG, y llevaban al mismo sitio. La versión anterior
 * hacía `delete().eq('business_id', …)` sin mirar el error, y ese error existía:
 *
 *   violates foreign key constraint "business_charges_order_id_fkey"  (409)
 *
 * Los pedidos entregados del negocio e2e tienen cargos en `business_charges`
 * (FK sin CASCADE), así que la sentencia se abortaba ENTERA. No es que se
 * borrara de menos: no se borraba NADA, ni siquiera los pedidos de este fichero,
 * que no tienen cargos. Y como el error se descartaba, la limpieza llevaba
 * tiempo sin limpiar sin que nadie se enterara.
 *
 * Consecuencia medida el 2026-08-12: 4 copias de cada cliente de prueba
 * acumuladas, y `getByText('Cliente Expira')` reventando por modo estricto
 * («resolved to 2 elements», luego 3). El síntoma se leía como inestabilidad
 * —cada corrida fallaba en un test distinto, o en ninguno— y la causa era basura
 * creciendo, no una carrera.
 *
 * Acotar al marcador arregla las dos: estos pedidos nunca tienen cargos, así que
 * la FK ya no puede bloquear, y de paso el fichero deja de tocar lo ajeno.
 */
async function wipe(): Promise<void> {
  // Las solicitudes SÍ se barren enteras: una entrante de cualquier origen
  // levanta el modal a pantalla completa y rompe estos tests desde fuera.
  const { error: errReq } = await db
    .from('order_transfer_requests')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (errReq) throw new Error(`FALLÓ wipe de solicitudes: ${errReq.message}`)

  const { data: mios, error: errSel } = await db
    .from('orders')
    .select('id')
    .eq('business_id', E2E.BUSINESS_ID)
    .eq('customer_phone', TELEFONO_FIXTURE)
  if (errSel) throw new Error(`FALLÓ leer pedidos del fixture: ${errSel.message}`)

  const ids = (mios ?? []).map((o: { id: string }) => o.id)
  if (ids.length === 0) return

  await db.from('domain_events').delete().in('aggregate_id', ids)
  await db.from('order_event_log').delete().in('order_id', ids)
  const { error } = await db.from('orders').delete().in('id', ids)
  if (error) throw new Error(`FALLÓ wipe de pedidos: ${error.message}`)
}

/** Pedido MÍO, en estado transferible. */
async function seedMine(nombre: string): Promise<{ id: string; short: string }> {
  const short = shortId()
  expect(short).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: E2E.BUSINESS_ID,
      short_id: short,
      customer_name: nombre,
      customer_phone: TELEFONO_FIXTURE,
      delivery_method: 'delivery',
      delivery_reference: 'Jr. Traspaso 123',
      order_amount: 25,
      delivery_fee: 2,
      payment_intent: 'pending_cash',
      status: 'heading_to_restaurant',
      driver_id: E2E.DRIVER_ID,
    })
    .select('id')
    .single()
  if (error) throw new Error(`FALLÓ seed pedido: ${error.message}`)
  return { id: data.id, short }
}

/** Solicitud que me hace DRIVER_2 sobre un pedido mío. */
async function seedRequest(orderId: string, ttlSeconds: number): Promise<string> {
  const now = Date.now()
  const { data, error } = await db
    .from('order_transfer_requests')
    .insert({
      order_id: orderId,
      from_driver_id: E2E.DRIVER_ID,
      to_driver_id: E2E.DRIVER_2_ID,
      status: 'pending',
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + ttlSeconds * 1000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`FALLÓ seed solicitud: ${error.message}`)
  return data.id
}

test.describe.configure({ mode: 'serial' })

/**
 * Limpiar SIEMPRE, no solo al terminar bien.
 *
 * Los `await wipe()` del final de cada test no corren cuando el test falla, así
 * que el primer fallo dejaba sus pedidos y el siguiente los encontraba: un
 * fallo se convertía en varios, y el segundo culpaba a la pantalla de lo que
 * había hecho el primero. Por eso cada corrida acusaba a un test distinto.
 */
test.afterEach(wipe)

test('la pila muestra las DOS solicitudes entrantes', async ({ page }) => {
  await wipe()
  const a = await seedMine('Cliente A')
  const b = await seedMine('Cliente B')

  await page.goto(`${MOTOS}/`)
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })

  // Sembrar DESPUÉS de cargar: así llegan por realtime, que es como ocurre de
  // verdad. Sembrando antes, la ventana puede caducar durante el arranque.
  await seedRequest(a.id, 60)
  await seedRequest(b.id, 60)

  const tarjetas = page.getByText('Un motorizado quiere tomar tu pedido')
  await expect(tarjetas).toHaveCount(2, { timeout: 20_000 })
  console.log(`[T8-pila] tarjetas de solicitud apiladas: ${await tarjetas.count()}`)

  // Ambos códigos visibles: no es la misma tarjeta duplicada.
  // `.first()` porque cada código sale además en su tarjeta de "Míos": lo que
  // importa aquí es que aparezcan LOS DOS, no cuántas veces cada uno.
  await expect(page.getByText(new RegExp(a.short)).first()).toBeVisible()
  await expect(page.getByText(new RegExp(b.short)).first()).toBeVisible()
  console.log(`[T8-pila] códigos presentes: ${a.short} y ${b.short}`)

  await wipe()
})

test('el silencio TRANSFIERE el pedido: aviso, sale de Míos y cambia driver_id', async ({
  page,
}) => {
  await wipe()
  const o = await seedMine('Cliente Expira')

  await page.goto(`${MOTOS}/`)
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })

  // Ventana CORTA para que caduque sola mientras se mira.
  //
  // No se fuerza `expires_at` al pasado por SQL: ese UPDATE dispara realtime, el
  // endpoint filtra por `expires_at > now()` y la solicitud desaparece del
  // payload — el banner se desmontaría sin llegar a enseñar el aviso. La
  // expiración natural no cambia ninguna fila, así que el cliente la detecta con
  // su propio reloj y pinta el estado.
  // El pedido está en Míos ANTES de que llegue la solicitud: sin esto, "sale de
  // Míos" no probaría nada — podría no haber estado nunca.
  //
  // Se comprueba ANTES de sembrar, y no después, porque desde C1.1 el modal
  // ocupa la pantalla completa: con una solicitud viva no se puede cambiar de
  // pestaña, que es justo el comportamiento buscado.
  await page.getByRole('tab', { name: /Míos/ }).click()
  await expect(page.getByText('Cliente Expira')).toBeVisible({ timeout: 15_000 })
  console.log('[T8-exp] el pedido está en Míos antes de expirar')

  const reqId = await seedRequest(o.id, 8)
  await expect(page.getByText('Un motorizado quiere tomar tu pedido')).toBeVisible({
    timeout: 20_000,
  })

  await expect(page.getByText('Transferencia automática…')).toBeVisible({ timeout: 25_000 })
  console.log('[T8-exp] aviso "Transferencia automática" visible')

  const { data: expirados, error: expErr } = await db.rpc('expire_order_transfers')
  if (expErr) throw new Error(`FALLÓ expire_order_transfers: ${expErr.message}`)
  console.log(`[T8-exp] expire_order_transfers() procesó: ${expirados}`)
  expect(Number(expirados)).toBeGreaterThan(0)

  // Sale de Míos sin recargar.
  await expect(page.getByText('Cliente Expira')).toHaveCount(0, { timeout: 25_000 })
  console.log('[T8-exp] el pedido salió de Míos sin recargar')

  // ── LA ASERCIÓN QUE SOSTIENE TODO T3 ──────────────────────────────────────
  // El silencio no cancela: TRANSFIERE. Se comprueba en la fila, no en la UI.
  const { data: fila } = await db.from('orders').select('driver_id,status').eq('id', o.id).single()
  const { data: solicitud } = await db
    .from('order_transfer_requests')
    .select('status')
    .eq('id', reqId)
    .single()
  console.log(
    `[T8-exp] SELECT orders.driver_id=${fila.driver_id} status=${fila.status} · solicitud=${solicitud.status}`,
  )
  console.log(`[T8-exp] DRIVER_2_ID esperado = ${E2E.DRIVER_2_ID}`)
  expect(fila.driver_id).toBe(E2E.DRIVER_2_ID)

  await wipe()
})

test('expirar SIN capacidad: el pedido se queda y el evento lo explica', async ({ page }) => {
  await wipe()
  const o = await seedMine('Cliente SinHueco')

  // El SOLICITANTE llena su mochila: 3 slots ocupados.
  const { error: llenoErr } = await db.from('orders').insert({
    business_id: E2E.BUSINESS_ID,
    short_id: shortId(),
    customer_name: 'Mochila del compañero',
    // Con marcador: sin él este pedido sobrevivía a `wipe()` y le comía los
    // 3 slots al solicitante en las corridas siguientes.
    customer_phone: TELEFONO_FIXTURE,
    delivery_method: 'delivery',
    delivery_reference: 'Jr. Lleno 3',
    order_amount: 25,
    delivery_fee: 2,
    payment_intent: 'pending_cash',
    status: 'picked_up',
    driver_id: E2E.DRIVER_2_ID,
    occupancy_slots: 3,
  })
  if (llenoErr) throw new Error(`FALLÓ seed mochila: ${llenoErr.message}`)

  await page.goto(`${MOTOS}/`)
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })

  const reqId = await seedRequest(o.id, 60)
  await db
    .from('order_transfer_requests')
    .update({ expires_at: new Date(Date.now() - 5_000).toISOString() })
    .eq('id', reqId)

  const { data: procesadas } = await db.rpc('expire_order_transfers')
  console.log(`[T8-sinhueco] expire_order_transfers() procesó: ${procesadas}`)

  const { data: fila } = await db.from('orders').select('driver_id').eq('id', o.id).single()
  const { data: evento } = await db
    .from('order_event_log')
    .select('data')
    .eq('order_id', o.id)
    .eq('event_type', 'order.transfer_expired')
    .single()
  console.log(`[T8-sinhueco] SELECT orders.driver_id=${fila.driver_id} (DUEÑO=${E2E.DRIVER_ID})`)
  console.log(
    `[T8-sinhueco] evento transferred=${evento.data.transferred} reason=${evento.data.reason}`,
  )
  expect(fila.driver_id).toBe(E2E.DRIVER_ID)
  expect(evento.data.transferred).toBe(false)
  expect(evento.data.reason).toBe('requester_no_capacity')

  await wipe()
})

test('rechazo explícito: el pedido se queda con su dueño', async ({ page }) => {
  await wipe()
  const o = await seedMine('Cliente Rechazo')

  await page.goto(`${MOTOS}/`)
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })

  const reqId = await seedRequest(o.id, 60)
  await expect(page.getByText('Un motorizado quiere tomar tu pedido')).toBeVisible({
    timeout: 20_000,
  })

  // Rechazo por la vía real de la UI.
  await page.getByRole('button', { name: 'No, es mío' }).click()
  await expect(page.getByText('Un motorizado quiere tomar tu pedido')).toHaveCount(0, {
    timeout: 20_000,
  })

  const { data: fila } = await db.from('orders').select('driver_id').eq('id', o.id).single()
  const { data: solicitud } = await db
    .from('order_transfer_requests')
    .select('status')
    .eq('id', reqId)
    .single()
  console.log(
    `[T8-rechazo] SELECT orders.driver_id=${fila.driver_id} · solicitud=${solicitud.status}`,
  )
  expect(fila.driver_id).toBe(E2E.DRIVER_ID)
  expect(solicitud.status).toBe('rejected')

  await wipe()
})
