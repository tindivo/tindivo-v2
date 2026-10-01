import { expect, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: helper de tests
const db = localClient as any

/**
 * Tindivo Entregas del lado del motorizado (MVP, 0235): los tres botones.
 *
 * Una solicitud entra, el motorizado la acepta desde «En espera», la marca
 * recogida y entregada desde «Míos», y al entregar dice cómo cobró. Lo que
 * se comprueba al final está en la base, no en la pantalla: que quedó
 * entregada y que el cobro se guardó con su método, porque de eso sale el
 * cuadre de la noche.
 */

const MOTOS = 'http://localhost:3004'

let settingsAntes: Record<string, unknown> | null = null
let disponibleAntes: boolean | null = null
let driverId: string | null = null
let courierOrderId: string | null = null
const descripcion = `Útiles e2e ${Date.now()}`

test.beforeAll(async () => {
  const { data: s } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  settingsAntes = s?.value ?? null
  await db
    .from('app_settings')
    .update({
      value: {
        ...(settingsAntes ?? {}),
        enabled: true,
        hours: { start: '00:00', end: '23:59' },
        maxActivePerPhone: 10,
        maxActivePerDriver: 2,
      },
    })
    .eq('key', 'courier')

  const { data: d } = await db
    .from('drivers')
    .select('id')
    .eq('user_id', E2E.DRIVER_USER_ID)
    .single()
  driverId = d.id
  const { data: av } = await db
    .from('driver_availability')
    .select('is_available')
    .eq('driver_id', driverId)
    .maybeSingle()
  disponibleAntes = av?.is_available ?? null
  await db.from('driver_availability').update({ is_available: true }).eq('driver_id', driverId)

  const { data, error } = await db.rpc('create_courier_order', {
    p_customer_user_id: E2E.CUSTOMER_USER_ID,
    p_requester_name: 'María E2E',
    p_requester_phone: '+51911111111',
    p_directory_business_id: null,
    p_origin_name: 'Botica E2E',
    p_origin_phone: '+51922222222',
    p_origin_lat: -9.146,
    p_origin_lng: -78.278,
    p_origin_reference_text: 'Frente a la plaza, puerta verde',
    p_destination_name: 'María E2E',
    p_destination_phone: '+51911111111',
    p_destination_lat: -9.1495,
    p_destination_lng: -78.2795,
    p_destination_reference_text: 'Casa celeste, segundo piso',
    p_item_description: descripcion,
    p_is_fragile: false,
    p_ready_in_min: 0,
    p_payer: 'destination',
    p_weight_confirmed: true,
    p_prepaid_confirmed: true,
    p_driver_note: 'Está a nombre de María. Cuidado, es frágil.',
  })
  if (error) throw new Error(`no se pudo sembrar la entrega: ${error.message}`)
  courierOrderId = data.id
})

test.afterAll(async () => {
  if (courierOrderId) await db.from('courier_orders').delete().eq('id', courierOrderId)
  if (settingsAntes) {
    await db.from('app_settings').update({ value: settingsAntes }).eq('key', 'courier')
  }
  if (driverId && disponibleAntes !== null) {
    await db
      .from('driver_availability')
      .update({ is_available: disponibleAntes })
      .eq('driver_id', driverId)
  }
})

test('el motorizado acepta, recoge, entrega cobrando por Yape y le rinde a Tindivo', async ({
  page,
}) => {
  await page.goto(MOTOS)
  await page.getByRole('tab', { name: /En espera/ }).click()

  const disponible = page.locator('article').filter({ hasText: descripcion })
  await expect(disponible).toBeVisible({ timeout: 30_000 })
  await expect(disponible.getByText('Con indicaciones')).toBeVisible()
  await expect(disponible.getByText('Cobrar al entregar')).toBeVisible()
  // Una disponible no enseña a quién llamar: eso es solo para la suya.
  await expect(disponible.getByRole('link', { name: /Llamar/ })).toHaveCount(0)

  // Tocar la tarjeta abre la ficha, una página como la de la comida.
  await disponible.getByRole('button', { name: /Ver entrega de/ }).click()
  await expect(page).toHaveURL(/\/entrega\//)
  await expect(page.getByText('Está a nombre de María')).toBeVisible()
  await expect(page.getByRole('link', { name: /Llamar/ })).toHaveCount(0)

  // «Ver mapa» abre primero el mapa en una hoja, con el salto a Google Maps.
  await page.getByRole('button', { name: 'Ver mapa' }).first().click()
  const mapa = page.getByRole('dialog', { name: /Recoger en/ })
  await expect(mapa.getByRole('link', { name: /Google Maps/ })).toBeVisible()
  await mapa.getByRole('button', { name: 'Cerrar mapa' }).click()

  await page.getByRole('button', { name: 'Aceptar entrega' }).click()
  // Ya es suya: aparecen los dos celulares.
  await expect(page.getByRole('link', { name: /Llamar a/ })).toHaveCount(2, { timeout: 15_000 })

  // WhatsApp con plantillas: a quien recibe (paga él) se le avisa del cobro.
  await page.getByRole('button', { name: 'WhatsApp a María E2E' }).click()
  const wa = page.getByRole('dialog', { name: 'Avisar a quien recibe' })
  await expect(wa.getByText('Ya estoy afuera', { exact: true })).toBeVisible()
  await expect(wa.getByText(/Son S\/ 3\.00 del transporte/).first()).toBeVisible()
  await wa.getByRole('button', { name: 'Cerrar' }).click()

  await page.getByRole('button', { name: 'Ya recogí' }).click()
  await expect(page.getByRole('button', { name: 'Entregado' })).toBeVisible({ timeout: 15_000 })

  // Paga quien recibe: «Entregado» pregunta cómo le pagaron antes de cerrar.
  await page.getByRole('button', { name: 'Entregado' }).click()
  await page.getByRole('button', { name: 'Yape' }).click()
  // Entregada, vuelve al tablero.
  await expect(page).toHaveURL(/localhost:3004\/?$/, { timeout: 15_000 })

  const { data: fila } = await db
    .from('courier_orders')
    .select('status, payment_method, transport_collected_at, driver_id')
    .eq('id', courierOrderId)
    .single()
  expect(fila.status).toBe('delivered')
  expect(fila.payment_method).toBe('yape')
  expect(fila.transport_collected_at).not.toBeNull()
  expect(fila.driver_id).toBe(driverId)

  // ── Historial: la entrega aparece junto a la comida entregada hoy.
  await page.getByRole('link', { name: 'Historial' }).click()
  await expect(page.locator('article').filter({ hasText: descripcion })).toBeVisible({
    timeout: 15_000,
  })

  // ── Deuda: lo cobrado por Yape se le debe a Tindivo. «Entregar» y Jesús confirma.
  await page.getByRole('link', { name: /Deuda/ }).click()
  await page.getByRole('tab', { name: /Tindivo/ }).click()
  const linea = page.locator('li').filter({ hasText: 'María E2E' }).filter({ hasText: 'Yape' })
  await expect(linea).toBeVisible({ timeout: 15_000 })
  await expect(linea.getByText('S/ 3.00')).toBeVisible()
  await linea.getByRole('button', { name: 'Entregar' }).click()
  await expect(linea.getByText('Entregando…')).toBeVisible({ timeout: 15_000 })

  const { data: rendida } = await db
    .from('courier_orders')
    .select('remitted_at, remittance_confirmed_at')
    .eq('id', courierOrderId)
    .single()
  expect(rendida.remitted_at).not.toBeNull()
  expect(rendida.remittance_confirmed_at).toBeNull()

  // Jesús confirma desde admin (aquí, por la RPC con su usuario).
  const { error: confirmErr } = await db.rpc('admin_confirm_courier_remittance', {
    p_courier_order_id: courierOrderId,
    p_actor_user_id: E2E.ADMIN_USER_ID,
  })
  expect(confirmErr).toBeNull()
  await page.reload()
  await page.getByRole('tab', { name: /Tindivo/ }).click()
  await expect(linea).toHaveCount(0, { timeout: 15_000 })
})
