import { expect, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'

// biome-ignore lint/suspicious/noExplicitAny: helper de tests
const db = localClient as any

/**
 * El QR de repuesto, en la puerta del cliente (0184).
 *
 * Este es el momento que justifica toda la feature: el motorizado está parado
 * en la puerta, el QR impreso no escanea y no hay segunda oportunidad. Con una
 * sola cuenta le tocaba dictar nueve dígitos; con las pestañas cambia de cuenta
 * en un toque.
 *
 * Lo que se verifica no es que las pestañas existan, sino que **cambian la
 * cuenta de verdad**: número, titular y QR. Unas pestañas que solo cambian el
 * rótulo serían peor que no tenerlas — el cliente pagaría a la cuenta
 * equivocada creyendo que hizo lo correcto.
 */

const MOTOS = 'http://localhost:3004'

test('el motorizado puede saltar a la cuenta de repuesto', async ({ page }) => {
  // Un pedido suyo que se cobre por billetera. No se fija por id: el seed de
  // demo los regenera, y un id clavado convierte este test en una bomba de
  // relojería que estalla la próxima vez que alguien resiembre.
  const { data: orders } = await db
    .from('orders')
    .select('id')
    .in('payment_intent', ['pending_yape', 'pending_mixed'])
    .not('driver_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  const orderId = orders?.[0]?.id
  test.skip(!orderId, 'sin pedido por billetera sembrado: corre `pnpm db:seed:demo`')

  await page.goto(`${MOTOS}/pedido/${orderId}`)
  await page.waitForLoadState('networkidle')

  const tarjeta = page
    .locator('section')
    .filter({ hasText: /al cliente/i })
    .first()
  await tarjeta.waitFor({ timeout: 30_000 })

  // La principal manda: es la que sale sin tocar nada.
  await expect(tarjeta.getByText('+51 900 000 001')).toBeVisible()
  await expect(tarjeta.getByText('La Florencia E2E')).toBeVisible()
  const qrPrincipal = await tarjeta.locator('img').first().getAttribute('src')

  // Y la de repuesto está a un toque.
  await tarjeta.getByRole('button', { name: 'Plin' }).click()
  await expect(tarjeta.getByText('+51 955 512 345')).toBeVisible()

  // La imagen cambia con ella. Sin esto, el test pasaría aunque las pestañas
  // solo movieran el texto y dejaran el QR de la otra cuenta en pantalla.
  await expect.poll(() => tarjeta.locator('img').first().getAttribute('src')).not.toBe(qrPrincipal)
})
