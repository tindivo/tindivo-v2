/**
 * Tindivo Entregas — la entrada única (`/entregas` = la tarjeta del inicio), los
 * atajos del pin (lupa, enlace de tienda, «Repetir») y el badge de "Pedidos"
 * reflejando una entrega en curso.
 *
 * Dos specs cortos, no uno largo: cada uno se entiende solo si falla.
 */
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const db = createClient(LOCAL_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const E2E = {
  PASSWORD: 'e2e-password-12345',
  CUSTOMER_EMAIL: 'cliente@e2e.local',
}

async function login(page: import('@playwright/test').Page) {
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })
}

/**
 * `tindivo.com/entregas` ya no es otra pantalla («Lugares»): abre el MISMO
 * flujo que la tarjeta del inicio (`Docs/Entregas/ux-entrada/`), y los atajos
 * viven dentro del pin: la lupa y «Repetir una entrega».
 */
async function sembrarLugar() {
  const { data, error } = await db
    .from('map_landmarks')
    .insert({ name: 'Botica E2E Lugares', category: 'salud', lat: -9.1468, lng: -78.2786 })
    .select('id')
    .single()
  if (error) throw new Error(`sembrar lugar falló: ${error.message}`)
  return data.id as string
}

test('/entregas abre el mismo flujo que la tarjeta, y la lupa lleva el pin a un lugar', async ({
  page,
}) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  await page.setViewportSize({ width: 390, height: 844 })
  const lugarId = await sembrarLugar()

  try {
    await login(page)
    await page.goto('/entregas')
    // Redirige al inicio, limpia la URL y abre el pin de A.
    await page.waitForURL((u) => u.pathname === '/' && !u.search.includes('entregas'))
    const pin = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
    await expect(pin.getByText('¿Dónde recogemos?')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Lugares', { exact: true })).toHaveCount(0)

    // Se escribe en la misma barra del pin: las coincidencias salen debajo, sin
    // tapar el mapa.
    await pin.getByRole('combobox', { name: 'Buscar un lugar' }).fill('botica e2e')
    const sugerencias = pin.getByRole('region', { name: 'Sugerencias' })
    await sugerencias.getByRole('button', { name: /Botica E2E Lugares/ }).click()

    // Elegir NO confirma: vuelve al mapa con la referencia escrita.
    await expect(sugerencias).toHaveCount(0)
    await expect(pin.getByLabel('Dirección y referencia')).toHaveValue('Botica E2E Lugares')
    await expect(pin.getByRole('button', { name: 'Confirmar recojo' })).toBeEnabled()

    expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
  } finally {
    await db.from('map_landmarks').delete().eq('id', lugarId)
  }
})

test('el enlace de una tienda (/entregas?lugar=) abre el pedido con el recojo ya puesto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const lugarId = await sembrarLugar()

  try {
    await login(page)
    await page.goto(`/entregas?lugar=${lugarId}`)
    const pin = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
    await expect(pin.getByText('¿Dónde entregamos?')).toBeVisible({ timeout: 20_000 })
    await expect(pin.getByText('Ubicación 2 de 2')).toBeVisible()
    // El globo del recojo lleva el nombre del lugar.
    await expect(
      page.locator('.t-route-pin-label', { hasText: 'Botica E2E Lugares' }),
    ).toBeVisible()
  } finally {
    await db.from('map_landmarks').delete().eq('id', lugarId)
  }
})

test('«Usar mi dirección» en el paso 2 llena el punto y a quien recibe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.goto('/entregas')
  const pin = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  await expect(pin.getByText('¿Dónde recogemos?')).toBeVisible({ timeout: 20_000 })
  await pin.getByLabel('Dirección y referencia').fill('Casa de prueba, frente al parque')
  // Sin GPS en el navegador de prueba: se asienta el pin arrastrando el mapa.
  const mapa = page.locator('.leaflet-container')
  const box = await mapa.boundingBox()
  if (!box) throw new Error('el mapa no tiene caja')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 5 })
  await page.mouse.up()
  await pin.getByRole('button', { name: 'Confirmar recojo' }).click()

  await expect(pin.getByText('¿Dónde entregamos?')).toBeVisible()
  await pin.getByRole('button', { name: 'Usar mi dirección' }).click()
  await pin.getByRole('button', { name: 'Confirmar entrega' }).click()

  const detalles = page.getByRole('dialog', { name: 'Detalles de la entrega' })
  await expect(detalles).toBeVisible()
  // Quien recibe es quien pide: llega completo y en una sola línea.
  await expect(
    detalles.getByRole('button', { name: 'Cambiar el contacto de quien recibe' }),
  ).toBeVisible()
  // El botón dice qué falta en lugar del precio.
  await expect(detalles.getByRole('button', { name: /Completar: qué llevamos/ })).toBeVisible()

  // «Soy yo» en la esquina está encendido; apagarlo abre el campo (no deja una
  // línea vacía y escondida).
  const soyYo = detalles.getByRole('button', { name: 'Soy yo' }).nth(1)
  await expect(soyYo).toHaveAttribute('aria-pressed', 'true')
  await soyYo.click()
  await expect(detalles.getByRole('textbox', { name: 'Celular de quien recibe' })).toBeVisible()

  // La flecha de Detalles vuelve al paso 2 CON su fila: número, flecha al
  // recojo y «Usar mi dirección» (antes, con los dos puntos completos, la fila
  // desaparecía entera).
  await detalles.getByRole('button', { name: 'Volver al mapa' }).click()
  await expect(pin.getByText('Ubicación 2 de 2')).toBeVisible()
  await expect(pin.getByRole('button', { name: 'Usar mi dirección' })).toBeVisible()
  await pin.getByRole('button', { name: 'Volver al recojo' }).click()
  await expect(pin.getByText('Ubicación 1 de 2')).toBeVisible()
})

test('«Mi ubicación» se puede tocar y devuelve el pin a donde estás', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -9.1488, longitude: -78.2806 })
  await login(page)
  await page.goto('/entregas')
  const pin = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  const boton = pin.getByRole('button', { name: 'Mi ubicación' })
  await expect(boton).toBeEnabled({ timeout: 20_000 })

  // Se aleja el mapa a mano…
  const box = await page.locator('.leaflet-container').boundingBox()
  if (!box) throw new Error('el mapa no tiene caja')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 60, { steps: 6 })
  await page.mouse.up()

  // …y el botón tiene que recibir el toque. Antes el toque lo atravesaba y le
  // llegaba al mapa (la capa del pin es `pointer-events-none`): Playwright no
  // deja hacer clic en un elemento tapado, así que esto falla si vuelve a pasar.
  await boton.click()
  await expect(pin.getByText('✓ Dentro de la zona de reparto')).toBeVisible()
  await expect(boton).toBeEnabled()

  // El mapa va detrás del panel: el crédito de OpenStreetMap (obligatorio por
  // la licencia) tiene que quedar encima del panel, no tapado por él.
  const credito = await page.locator('.leaflet-control-attribution').boundingBox()
  const titulo = await pin.getByText('¿Dónde recogemos?').boundingBox()
  if (!credito || !titulo) throw new Error('falta el crédito o el título')
  expect(credito.y + credito.height).toBeLessThan(titulo.y)
})

test('«Repetir» una entrega que llegó deja la ruta puesta y lleva a Detalles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)

  const { data: user } = await db.auth.admin.listUsers()
  const cliente = user.users.find((u) => u.email === E2E.CUSTOMER_EMAIL)
  if (!cliente) throw new Error('cliente@e2e.local no existe en el mundo sembrado')

  const { data: previa, error } = await db
    .from('courier_orders')
    .insert({
      short_id: 'REPITE01',
      customer_user_id: cliente.id,
      requester_name: 'Cliente E2E',
      requester_phone: '987654321',
      origin_name: 'Botica Repetida',
      origin_phone: '911111111',
      origin_lat: -9.146,
      origin_lng: -78.278,
      origin_reference_text: 'Botica Repetida, frente al parque',
      destination_name: 'Mamá E2E',
      destination_phone: '922222222',
      destination_lat: -9.1495,
      destination_lng: -78.2795,
      destination_reference_text: 'Casa de prueba, e2e',
      item_description: 'Medicinas',
      ready_in_min: 0,
      ready_at: new Date().toISOString(),
      fee_amount: 3,
      weight_confirmed: true,
      prepaid_confirmed: true,
      status: 'delivered',
      driver_id: 'e2e00000-0000-4000-8000-000000000050',
      payment_method: 'cash',
      transport_collected_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed courier_orders falló: ${error.message}`)

  try {
    await page.goto('/entregas')
    const pin = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
    // «Ver anteriores» va a la derecha del paso y abre una hoja aparte: el
    // panel del pin no crece.
    const ver = pin.getByRole('button', { name: /Ver anteriores/ })
    await expect(ver).toBeVisible({ timeout: 20_000 })
    await ver.click()
    const anteriores = page.getByRole('dialog', { name: 'Entregas anteriores' })
    await anteriores.getByRole('button', { name: /Botica Repetida → Mamá E2E/ }).click()
    await expect(anteriores).toHaveCount(0)

    const detalles = page.getByRole('dialog', { name: 'Detalles de la entrega' })
    await expect(detalles).toBeVisible()
    await expect(detalles.getByLabel('Qué llevamos')).toHaveValue('Medicinas')
  } finally {
    await db.from('courier_order_events').delete().eq('courier_order_id', previa.id)
    await db.from('courier_orders').delete().eq('id', previa.id)
  }
})

test('el badge de "Pedidos" y el banner del home reflejan una entrega en curso', async ({
  page,
}) => {
  // La BottomNav es `lg:hidden`: sin viewport móvil, el viewport de escritorio
  // por defecto de Playwright (1280×720) la esconde y el badge "existe" en el
  // DOM pero nunca es visible — no es el bug que parece, es el breakpoint.
  await page.setViewportSize({ width: 393, height: 844 })
  await login(page)

  const { data: user } = await db.auth.admin.listUsers()
  const cliente = user.users.find((u) => u.email === E2E.CUSTOMER_EMAIL)
  if (!cliente) throw new Error('cliente@e2e.local no existe en el mundo sembrado')

  const shortId = 'BADGE001'
  const { data: created, error } = await db
    .from('courier_orders')
    .insert({
      short_id: shortId,
      customer_user_id: cliente.id,
      requester_name: 'Cliente E2E',
      requester_phone: '987654321',
      origin_name: 'Elmer',
      origin_lat: -9.146,
      origin_lng: -78.278,
      origin_reference_text: 'Frente al parque, prueba e2e',
      destination_name: 'Cliente E2E',
      destination_lat: -9.1495,
      destination_lng: -78.2795,
      destination_reference_text: 'Casa de prueba, e2e',
      item_description: 'Prueba de badge',
      ready_in_min: 0,
      ready_at: new Date().toISOString(),
      fee_amount: 3,
      weight_confirmed: true,
      prepaid_confirmed: true,
      status: 'requested',
    })
    .select('id')
    .single()
  if (error) throw new Error(`seed courier_orders falló: ${error.message}`)

  try {
    await page.goto('/')
    await expect(page.getByText('Entrega en curso')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Buscando un motorizado…')).toBeVisible()

    // El badge de "Pedidos" en la barra inferior cuenta esta entrega.
    const badge = page.locator('a[href="/pedidos"]').getByText(/^[1-9]/)
    await expect(badge).toBeVisible({ timeout: 10_000 })

    // Con motorizado asignado, el banner tiene que traer su nombre — leído
    // como el CLIENTE (sesión real, no service_role): `drivers` tiene RLS
    // que solo deja pasar al admin y al propio motorizado, así que esto
    // prueba que `active-courier-orders.ts` lo trae por `get_courier_tracking`
    // (SECURITY DEFINER) y no por una lectura directa que la RLS bloquearía.
    const { error: updErr } = await db
      .from('courier_orders')
      .update({ status: 'accepted', driver_id: 'e2e00000-0000-4000-8000-000000000050' })
      .eq('id', created.id)
    if (updErr) throw new Error(`asignar motorizado falló: ${updErr.message}`)

    await page.reload()
    await expect(page.getByText('Motorizado E2E va a recoger en Elmer')).toBeVisible({
      timeout: 15_000,
    })

    // Tocar el banner abre el seguimiento — mapa persistente con los pines de
    // la ruta y el badge del motorizado sobre el pin de origen (Hito 3).
    await page.getByText('Motorizado E2E va a recoger en Elmer').click()
    await expect(page.locator('.t-route-pin-drop')).toHaveCount(2, { timeout: 15_000 })
    await expect(page.locator('.t-route-driver')).toBeVisible()
    await expect(page.locator('.t-route-driver-label')).toHaveText('Motorizado E2E')
  } finally {
    await db.from('courier_order_events').delete().eq('courier_order_id', created.id)
    await db.from('courier_orders').delete().eq('id', created.id)
  }
})
