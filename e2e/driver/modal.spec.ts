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

async function wipe(): Promise<void> {
  await db
    .from('order_transfer_requests')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('orders').delete().eq('business_id', E2E.BUSINESS_ID)
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
