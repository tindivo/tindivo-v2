import { expect, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: helper de tests
const db = localClient as any

const MOTOS = 'http://localhost:3004'
const OUT = 'test-results/gate-c11'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function shortId(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

/** Los pedidos que ha sembrado este spec. Solo se borra lo propio. */
const sembrados: string[] = []

/**
 * Limpieza de lo que sembró ESTE spec, y solo eso.
 *
 * ANTES BORRABA TODOS LOS PEDIDOS DEL NEGOCIO Y NO BORRABA NINGUNO. PostgREST
 * manda ese `delete` como UNA sentencia, así que basta con que una fila no se
 * pueda borrar para que se caiga entera y no se borre nada:
 *
 *   ERROR: update or delete on table "orders" violates foreign key constraint
 *          "business_charges_order_id_fkey" on table "business_charges"
 *
 * Y siempre hay alguna: `delivered` es terminal, los entregados del historial
 * llevan su cargo colgando y nadie los limpia. Como el error no se miraba, la
 * limpieza parecía correr.
 *
 * LO QUE COSTABA, que no se veía aquí sino dos ficheros más allá: los tres
 * pedidos que este spec deja en `heading_to_restaurant` siguen asignados al
 * motorizado E2E y le llenan la mochila (tope 3 de `assignment_rules`). El
 * siguiente spec del proyecto por orden alfabético es `transfers`, y su caso
 * del silencio pide capacidad al que recibe: sin ella la transferencia se
 * niega —correctamente— y el rojo sale ahí, señalando a un código que no tiene
 * nada que ver. Medido: «Mochila sobrecargada: 4/3» en la captura del fallo.
 *
 * `transfers.spec.ts` ya había aprendido esto y lo dejó escrito en su cabecera;
 * aquí faltaba aplicarlo.
 */
async function wipe(): Promise<void> {
  const ids = sembrados.splice(0)
  if (!ids.length) return
  await db.from('order_transfer_requests').delete().in('order_id', ids)
  await db.from('domain_events').delete().in('aggregate_id', ids)
  await db.from('order_event_log').delete().in('order_id', ids)
  const { error } = await db.from('orders').delete().in('id', ids)
  // Se mira, y revienta: una limpieza que falla en silencio no deja un test
  // rojo, deja rojo al siguiente.
  if (error) throw new Error(`FALLÓ la limpieza del spec: ${error.message}`)
}

async function seedMine(nombre: string, referencia: string): Promise<string> {
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: E2E.BUSINESS_ID,
      short_id: shortId(),
      customer_name: nombre,
      customer_phone: '+51999005555',
      delivery_method: 'delivery',
      delivery_reference: referencia,
      order_amount: 25,
      delivery_fee: 2,
      payment_intent: 'pending_cash',
      status: 'heading_to_restaurant',
      driver_id: E2E.DRIVER_ID,
    })
    .select('id')
    .single()
  if (error) throw new Error(`FALLÓ seed: ${error.message}`)
  sembrados.push(data.id)
  return data.id
}

async function seedRequest(orderId: string, ttl = 60): Promise<void> {
  const now = Date.now()
  const { error } = await db.from('order_transfer_requests').insert({
    order_id: orderId,
    from_driver_id: E2E.DRIVER_ID,
    to_driver_id: E2E.DRIVER_2_ID,
    status: 'pending',
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl * 1000).toISOString(),
  })
  if (error) throw new Error(`FALLÓ seed solicitud: ${error.message}`)
}

test.describe.configure({ mode: 'serial' })

/*
 * En `afterEach` y no solo al final de cada test: el `await wipe()` de la última
 * línea NO corre cuando el test falla, que es exactamente cuando queda basura.
 * Así, un rojo aquí sigue siendo un rojo aquí y no se convierte en un rojo de
 * `transfers` media hora después.
 */
test.afterEach(wipe)

test('C1.1: modal a pantalla completa con countdown', async ({ page }) => {
  await wipe()
  const id = await seedMine('Cliente Modal', 'Jr. Los Pinos 123 — casa azul')

  await page.goto(`${MOTOS}/`)
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })
  await seedRequest(id, 60)

  await expect(page.getByText('Un motorizado quiere tomar tu pedido')).toBeVisible({
    timeout: 20_000,
  })

  // Todo lo que el gate exige que se vea, acotado AL MODAL: la referencia sale
  // también en la tarjeta de "Míos" que queda detrás.
  const modal = page.locator('.z-\\[90\\]')
  await expect(modal.getByText('Jr. Los Pinos 123 — casa azul')).toBeVisible()
  await expect(modal.getByText(/te lo está pidiendo/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sí, dáselo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'No, es mío' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cerrar y quedarme el pedido' })).toBeVisible()

  const reloj = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('span')).find((s) =>
      /^\d{2}:\d{2}$/.test((s.textContent ?? '').trim()),
    )
    return el?.textContent?.trim()
  })
  console.log(`[C1.1] countdown en el modal: ${reloj}`)
  expect(reloj).toMatch(/^\d{2}:\d{2}$/)

  await page.screenshot({ path: `${OUT}/1-modal-una-solicitud.png` })
  await wipe()
})

test('C1.1: dos solicitudes se APILAN, sin cola', async ({ page }) => {
  await wipe()
  const a = await seedMine('Cliente A', 'Jr. Primero 1')
  const b = await seedMine('Cliente B', 'Jr. Segundo 2')

  await page.goto(`${MOTOS}/`)
  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })
  await seedRequest(a, 60)
  await seedRequest(b, 60)

  const titulos = page.getByText('Un motorizado quiere tomar tu pedido')
  await expect(titulos).toHaveCount(2, { timeout: 20_000 })
  console.log(`[C1.1] modales apilados: ${await titulos.count()}`)

  // Las DOS referencias visibles: se apilan, no se encolan.
  const modal = page.locator('.z-\\[90\\]')
  await expect(modal.getByText('Jr. Primero 1')).toBeVisible()
  await expect(modal.getByText('Jr. Segundo 2')).toBeVisible()
  console.log('[C1.1] ambas referencias visibles simultáneamente')

  await page.screenshot({ path: `${OUT}/2-dos-solicitudes-apiladas.png` })
  await wipe()
})
