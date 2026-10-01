/**
 * Tindivo Entregas — lugares (lista y mapa con chapas tocables) y el badge de
 * "Pedidos" reflejando una entrega en curso.
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

test('/entregas lista los lugares del pueblo y tocar uno en el mapa abre su ficha', async ({
  page,
}) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  // Los lugares son las referencias del pueblo (`map_landmarks`), no el
  // directorio de negocios. Se siembra una propia y se borra al final.
  const { data: lugar, error } = await db
    .from('map_landmarks')
    .insert({ name: 'Botica E2E Lugares', category: 'salud', lat: -9.1468, lng: -78.2786 })
    .select('id')
    .single()
  if (error) throw new Error(`sembrar lugar falló: ${error.message}`)

  try {
    await page.goto('/entregas')
    await expect(page.getByText('Lugares', { exact: true })).toBeVisible()
    await expect(page.getByText('Botica E2E Lugares')).toBeVisible()

    await page.getByRole('button', { name: 'Mapa' }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible()

    // Se acerca hasta que la chapa sale con su nombre, y se toca la chapa.
    const chapa = page.locator('.t-lm-badge').first()
    await expect(chapa).toBeVisible({ timeout: 15_000 })
    const box = await chapa.boundingBox()
    if (!box) throw new Error('la chapa no tiene caja')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    // Ficha anclada abajo, sin velo: el mapa sigue a la vista.
    const ficha = page.locator('[role="dialog"]')
    await expect(ficha).toBeVisible()
    await expect(ficha.getByRole('button', { name: /Recoger aquí/ })).toBeVisible()
    // `toBeVisible` no ve solapes: la ficha estuvo tapada por los panes de
    // Leaflet y seguía «visible». Un click de prueba sí falla si otro
    // elemento se lleva el puntero.
    await ficha.getByRole('button', { name: /Recoger aquí/ }).click({ trial: true, timeout: 3000 })
    await expect(page.locator('.leaflet-container')).toBeVisible()

    expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
  } finally {
    await db.from('map_landmarks').delete().eq('id', lugar.id)
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
