/**
 * Tindivo Entregas — flujo mapa primero (sin negocio) de punta a punta.
 *
 * El buscador de negocio (`RouteSheet`/`ConfirmSheet`) se ocultó del flujo por
 * defecto (inspirado en inDrive): el botón "Tindivo Entregas" del home ya no
 * abre un buscador ni una hoja de formulario, abre directo el mapa para fijar
 * el punto A (recojo), con su referencia en el mismo panel; al confirmarlo
 * sigue el punto B (entrega) y luego "Detalles de la entrega".
 * El primer test de este archivo, que ejercitaba justo ese buscador, queda
 * `test.skip` — el camino sigue existiendo en el código pero no hay ya ningún
 * botón de la UI que lleve ahí.
 *
 * Entra como el cliente sembrado de e2e (`cliente@e2e.local`), abre "Pedir
 * entrega" desde el banner del home, fija el punto A (recojo) y el punto B
 * (entrega) uno a la vez en el mapa, llena la única pantalla de detalles (qué
 * llevamos, contactos, quién paga, indicaciones), y comprueba que la solicitud llega a
 * "Buscando motorizado". Requiere `app_settings.courier.enabled = true`,
 * horario que cubra la hora de la corrida y al menos un motorizado
 * `is_available` — lo deja así el propio test en `beforeAll`, y lo devuelve a
 * como estaba en `afterAll` para no dejar Tindivo Entregas encendida en el
 * mundo compartido.
 */
import { expect, type Page, test } from '@playwright/test'
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

let previousCourierSettings: Record<string, unknown> | null = null
let createdOrderIds: string[] = []

test.beforeAll(async () => {
  const { data } = await db.from('app_settings').select('value').eq('key', 'courier').single()
  previousCourierSettings = data?.value ?? null
  await db
    .from('app_settings')
    .update({
      value: { ...(data?.value ?? {}), enabled: true, hours: { start: '00:00', end: '23:59' } },
    })
    .eq('key', 'courier')

  await db.from('driver_availability').upsert({
    driver_id: 'e2e00000-0000-4000-8000-000000000050',
    is_available: true,
  })
})

// Después de CADA test, no solo al final: el cliente sembrado es el mismo en
// los dos tests de este archivo, y una entrega recién creada por el primero
// queda "activa" para el segundo — `CourierEntryBanner` cambia entonces de la
// tarjeta "Pedir entrega" a "Entrega en curso", y el segundo test ya no
// encuentra el botón que busca. Limpiarlo entre tests, no solo al terminar el
// archivo, es lo que evita que se contaminen entre sí.
test.afterEach(async () => {
  if (createdOrderIds.length > 0) {
    await db.from('courier_order_events').delete().in('courier_order_id', createdOrderIds)
    await db.from('courier_orders').delete().in('id', createdOrderIds)
    createdOrderIds = []
  }
})

test.afterAll(async () => {
  if (previousCourierSettings) {
    await db.from('app_settings').update({ value: previousCourierSettings }).eq('key', 'courier')
  }
})

async function loginAsCustomer(page: Page) {
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })
}

/**
 * Fija UN punto en la pantalla del mapa: espera el diálogo, arrastra el mapa
 * (habilita "Confirmar"), escribe la referencia en el panel de abajo y confirma.
 * `confirmar` es el rótulo del botón de ese paso ("Confirmar recojo" o
 * "Confirmar entrega"); vale la misma pantalla para A y para B.
 */
async function fijarPunto(page: Page, referencia: string, confirmar: RegExp) {
  const pinDrop = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  await expect(pinDrop).toBeVisible({ timeout: 10_000 })

  const caja = await page.locator('.leaflet-container').boundingBox()
  expect(caja, 'el mapa tiene que tener caja para poder arrastrarlo').not.toBeNull()
  if (caja) {
    const cx = caja.x + caja.width / 2
    const cy = caja.y + caja.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 25, cy + 15, { steps: 10 })
    await page.mouse.up()
  }

  await pinDrop.getByRole('textbox', { name: 'Dirección y referencia' }).fill(referencia)
  const boton = pinDrop.getByRole('button', { name: confirmar })
  await expect(boton).toBeEnabled({ timeout: 10_000 })
  await boton.click()
}

test.skip('el buscador de negocio queda oculto: sin botón en la UI que lleve a route/confirm', async () => {
  // Camino de negocio (`RouteSheet` → `ConfirmSheet`) intacto en el código
  // pero fuera del flujo por defecto — se retoma cuando "negocio" vuelva a
  // la ecuación de Tindivo Entregas. Ver `trip-sheet.tsx` y `store.ts`.
})

test('pedir entrega fijando A y B en el mapa llega a "Buscando motorizado"', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))
  const descripcion = `Encargo e2e tu ruta ${Date.now()}`

  await loginAsCustomer(page)
  await page.goto('/')

  // ── Banner → abre directo el mapa del punto A (sin hoja ni instrucciones) ─
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()
  await expect(page.getByText('¿Dónde recogemos?')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Entendido' })).toHaveCount(0)

  // ── Punto A: recogemos en ─────────────────────────────────────────────────
  await fijarPunto(page, 'Frente al mercado, puerta azul', /Confirmar recojo/)

  // ── Punto B: entregamos en (mismo mapa, siguiente paso) ───────────────────
  await expect(page.getByText('¿Dónde entregamos?')).toBeVisible({ timeout: 10_000 })
  await fijarPunto(page, 'Casa celeste, segundo piso', /Confirmar entrega/)

  // ── Detalles de la entrega: la ÚNICA pantalla después de los mapas ─────────
  // Qué llevamos, de quién a quién, quién paga y «Pedir». Nada viene relleno por
  // su cuenta: en un pedido puedes ser quien entrega, quien recibe o ninguno.
  // «Pedir» incompleto no se apaga en silencio: dice qué falta y lleva ahí.
  const detalles = page.getByRole('dialog', { name: 'Detalles de la entrega' })
  await expect(detalles).toBeVisible({ timeout: 10_000 })
  const recibeNombre = detalles.getByPlaceholder('Nombre de quien recibe (opcional)')
  await expect(recibeNombre).toHaveValue('')
  // `dispatchEvent`: Playwright no hace clic en aria-disabled, y aquí justo se prueba ese clic.
  await detalles.getByRole('button', { name: /Pedir entrega/ }).dispatchEvent('click')
  await expect(detalles.getByText('Falta decir qué llevamos')).toBeVisible()
  await expect(detalles.getByRole('textbox', { name: 'Qué llevamos' })).toBeFocused()

  // Un chip rellena la descripción; se puede reescribir encima.
  await detalles.getByRole('button', { name: 'Documentos' }).click()
  await expect(detalles.getByRole('textbox', { name: 'Qué llevamos' })).toHaveValue('Documentos')
  await detalles.getByRole('textbox', { name: 'Qué llevamos' }).fill(descripcion)

  // «Soy yo» completa nombre y celular; volver a tocarlo lo apaga.
  const soyYoRecibe = detalles.getByRole('button', { name: 'Soy yo' }).nth(1)
  await soyYoRecibe.click()
  await expect(soyYoRecibe).toHaveAttribute('aria-pressed', 'true')
  await expect(recibeNombre).not.toHaveValue('')
  await soyYoRecibe.click()
  await expect(soyYoRecibe).toHaveAttribute('aria-pressed', 'false')
  await expect(recibeNombre).toHaveValue('')
  await soyYoRecibe.click()

  // El nombre de quien entrega es opcional: basta el celular.
  const celular = detalles.getByRole('textbox', { name: 'Celular de quien entrega' })
  await celular.pressSequentially('98765432199', { delay: 20 })
  // No admite más de 9 dígitos: los sobrantes se descartan al teclear.
  await expect(celular).toHaveValue('987654321')

  // Indicaciones: plegadas hasta que se piden.
  await detalles.getByRole('button', { name: /Agregar indicaciones/ }).click()
  await detalles.getByPlaceholder(/Está a nombre de María/).fill('Está a nombre de Rosa')

  await detalles.getByRole('checkbox', { name: /Ya está listo y pagado/ }).check()

  const submit = page.getByRole('button', { name: /Pedir entrega/ })
  await expect(submit).toBeEnabled({ timeout: 10_000 })
  await submit.click()

  // ── Seguir-1: buscando motorizado ─────────────────────────────────────────
  await expect(page.getByText('Buscando motorizado')).toBeVisible({ timeout: 20_000 })

  const { data: rows } = await db
    .from('courier_orders')
    .select('id, driver_note')
    .eq('item_description', descripcion)
    .order('created_at', { ascending: false })
    .limit(1)
  createdOrderIds = (rows ?? []).map((r) => r.id)
  expect(createdOrderIds.length, 'la solicitud tiene que haber quedado en la base').toBe(1)
  expect(rows?.[0]?.driver_note).toBe('Está a nombre de Rosa')

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})

test('sin referencia el punto no avanza y dice por qué', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  await loginAsCustomer(page)
  await page.goto('/')
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()

  const pinDrop = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  await expect(pinDrop).toBeVisible({ timeout: 10_000 })
  const caja = await page.locator('.leaflet-container').boundingBox()
  if (caja) {
    const cx = caja.x + caja.width / 2
    const cy = caja.y + caja.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 25, cy + 15, { steps: 10 })
    await page.mouse.up()
  }

  const boton = pinDrop.getByRole('button', { name: /Confirmar recojo/ })
  await expect(boton).toBeEnabled({ timeout: 10_000 })
  await boton.click()

  await expect(pinDrop.getByRole('alert')).toContainText('al menos')
  await expect(page.getByText('¿Dónde recogemos?')).toBeVisible()

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})

test('cambiar la ubicación desde "Detalles de la entrega" reabre el mapa con su referencia', async ({
  page,
}) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  await loginAsCustomer(page)
  await page.goto('/')

  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()

  await fijarPunto(page, 'Frente al mercado, puerta azul', /Confirmar recojo/)
  await fijarPunto(page, 'Casa celeste, segundo piso', /Confirmar entrega/)
  const tripDetails = page.getByRole('dialog', { name: 'Detalles de la entrega' })
  await expect(tripDetails).toBeVisible({ timeout: 10_000 })

  // "Cambiar" de la primera tarjeta (Dónde recogemos). Acotado al diálogo: el
  // home tiene su propia barra de dirección con un botón "Cambiar dirección de
  // entrega" que, sin acotar, gana por orden en el DOM.
  await tripDetails.getByRole('button', { name: 'Cambiar' }).first().click()

  // Reabre el mapa sobre ese punto, con la referencia ya escrita y sin popup de
  // "¿Estás seguro?": corregirla es escribir encima, no empezar de cero.
  const pinDrop = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  await expect(pinDrop).toBeVisible({ timeout: 10_000 })
  await expect(pinDrop.getByRole('textbox', { name: 'Dirección y referencia' })).toHaveValue(
    'Frente al mercado, puerta azul',
  )
  await expect(page.getByText('¿Estás seguro?')).toHaveCount(0)

  // El punto ya estaba fijado: se puede confirmar sin volver a arrastrar.
  const confirmar = pinDrop.getByRole('button', { name: /Confirmar/ })
  await expect(confirmar).toBeEnabled({ timeout: 10_000 })
  await confirmar.click()

  await expect(tripDetails).toBeVisible({ timeout: 10_000 })
  await expect(
    tripDetails.getByRole('textbox', { name: 'Referencia de recogemos de' }),
  ).toHaveValue('Frente al mercado, puerta azul')
  await expect(
    tripDetails.getByRole('textbox', { name: 'Referencia de entregamos a' }),
  ).toHaveValue('Casa celeste, segundo piso')

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})

test('desde el paso 2 se puede volver al recojo sin perder lo escrito', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  await loginAsCustomer(page)
  await page.goto('/')
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()

  await fijarPunto(page, 'Frente al mercado, puerta azul', /Confirmar recojo/)
  await expect(page.getByText('¿Dónde entregamos?')).toBeVisible({ timeout: 10_000 })

  const pinDrop = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  const referencia = pinDrop.getByRole('textbox', { name: 'Dirección y referencia' })
  await referencia.fill('Casa celeste')

  // La flecha de atrás vuelve al paso 1 (no cierra el flujo).
  await pinDrop.getByRole('button', { name: 'Volver al recojo' }).click()
  await expect(page.getByText('¿Dónde recogemos?')).toBeVisible({ timeout: 10_000 })
  await expect(referencia).toHaveValue('Frente al mercado, puerta azul')

  // El punto A ya estaba fijado: confirma sin arrastrar y vuelve a B, donde lo
  // que se había empezado a escribir sigue ahí.
  await pinDrop.getByRole('button', { name: /Confirmar/ }).click()
  await expect(page.getByText('¿Dónde entregamos?')).toBeVisible({ timeout: 10_000 })
  await expect(referencia).toHaveValue('Casa celeste')

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})

test('en el paso 2 el globo del recojo lleva de vuelta al paso 1', async ({ page }) => {
  await loginAsCustomer(page)
  await page.goto('/')
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()

  await fijarPunto(page, 'Frente al mercado, puerta azul', /Confirmar recojo/)
  await expect(page.getByText('¿Dónde entregamos?')).toBeVisible({ timeout: 10_000 })

  // El globo muestra la referencia escrita, no un «Recojo» genérico.
  const globo = page.locator('.t-route-pin-tap .t-route-pin-label')
  await expect(globo).toHaveText('Frente al mercado, puerta azul')
  await globo.click()
  await expect(page.getByText('¿Dónde recogemos?')).toBeVisible({ timeout: 10_000 })
})

test('en el paso 2 se puede escribir la referencia letra a letra sin perder el foco', async ({
  page,
}) => {
  await loginAsCustomer(page)
  await page.goto('/')
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()

  await fijarPunto(page, 'Frente al mercado, puerta azul', /Confirmar recojo/)
  await expect(page.getByText('¿Dónde entregamos?')).toBeVisible({ timeout: 10_000 })

  const referencia = page
    .getByRole('dialog', { name: 'Fijar el punto en el mapa' })
    .getByRole('textbox', { name: 'Dirección y referencia' })
  await referencia.click()
  await referencia.pressSequentially('Casa celeste', { delay: 60 })
  // Antes, en el paso 2 escribir una letra devolvía el foco al diálogo y el resto
  // de las teclas se perdía.
  await expect(referencia).toHaveValue('Casa celeste')
  await expect(referencia).toBeFocused()
})

test('sin sesión, Entregas pide la cuenta al entrar y después abre el mapa solo', async ({
  page,
}) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  // Antes: se llenaba todo y recién al final salía «Ingresa con tu celular».
  await page.goto('/')
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()

  // Primero la cuenta, no el mapa.
  await expect(page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()

  // Al terminar el login, el mapa se abre sin volver a tocar el banner.
  await expect(page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })).toBeVisible({
    timeout: 20_000,
  })

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})
