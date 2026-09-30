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

test('el motorizado acepta, recoge y entrega una entrega cobrando por Yape', async ({ page }) => {
  await page.goto(MOTOS)
  await page.getByRole('tab', { name: /En espera/ }).click()

  const disponible = page.locator('article').filter({ hasText: descripcion })
  await expect(disponible).toBeVisible({ timeout: 30_000 })
  await expect(disponible.getByText('Está a nombre de María')).toBeVisible()
  await expect(disponible.getByText('Cobrar S/ 3.00 al entregar')).toBeVisible()
  // Una disponible no enseña a quién llamar: eso es solo para la suya.
  await expect(disponible.getByRole('link', { name: /Llamar/ })).toHaveCount(0)
  await disponible.getByRole('button', { name: 'Aceptar entrega' }).click()

  await page.getByRole('tab', { name: /Míos/ }).click()
  const mia = page.locator('article').filter({ hasText: descripcion })
  await expect(mia).toBeVisible({ timeout: 30_000 })
  await expect(mia.getByRole('link', { name: /Llamar a/ })).toHaveCount(2)

  await mia.getByRole('button', { name: 'Recogido' }).click()
  await expect(mia.getByRole('button', { name: 'Entregado' })).toBeVisible({ timeout: 15_000 })

  // Paga quien recibe: «Entregado» pregunta cómo le pagaron antes de cerrar.
  await mia.getByRole('button', { name: 'Entregado' }).click()
  await page.getByRole('button', { name: 'Yape' }).click()
  await expect(mia).toHaveCount(0, { timeout: 15_000 })

  const { data: fila } = await db
    .from('courier_orders')
    .select('status, payment_method, transport_collected_at, driver_id')
    .eq('id', courierOrderId)
    .single()
  expect(fila.status).toBe('delivered')
  expect(fila.payment_method).toBe('yape')
  expect(fila.transport_collected_at).not.toBeNull()
  expect(fila.driver_id).toBe(driverId)
})
