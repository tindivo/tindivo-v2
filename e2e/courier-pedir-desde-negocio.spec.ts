/**
 * Tindivo Entregas — flujo "Tu ruta" (sin negocio) de punta a punta.
 *
 * El buscador de negocio (`RouteSheet`/`ConfirmSheet`) se ocultó del flujo por
 * defecto (rediseño "Tu ruta" inspirado en inDrive, ver
 * `apps/customer/features/courier/components/trip-sheet.tsx`): el botón
 * "Tindivo Entregas" del home ya no abre un buscador, abre directo el punto A.
 * El primer test de este archivo, que ejercitaba justo ese buscador, queda
 * `test.skip` — el camino sigue existiendo en el código pero no hay ya ningún
 * botón de la UI que lleve ahí.
 *
 * Entra como el cliente sembrado de e2e (`cliente@e2e.local`), abre "Pedir
 * entrega" desde el banner del home, fija el punto A (recojo) y el punto B
 * (entrega) uno a la vez en el mapa, completa el contacto de cada uno,
 * "¿Quién paga?" y "¿Qué llevamos?", y comprueba que la solicitud llega a
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
 * Fija UN punto desde la fila activa de "Tu ruta": escribe la dirección y
 * referencia en el textbox de la fila, abre el mapa, arrastra, confirma, y
 * vuelve — sin pasar por un paso de referencia aparte (a diferencia del
 * camino de negocio, aquí `confirmPinDrop` vuelve directo a `trip`).
 */
async function fijarPuntoDesdeTrip(page: Page, referencia: string) {
  await page.getByPlaceholder('Escriba dirección y referencia aquí…').fill(referencia)
  // Insensible a mayúsculas: el botón dice "Escoge en el mapa" (sin pin) o
  // "Ajustar en el mapa" (con pin) — y el ícono de la fila también aporta su
  // propio `aria-label` (`role="img"`, ver `packages/ui/src/primitives/icon.tsx`)
  // al nombre accesible del botón.
  await page.getByRole('button', { name: /mapa/i }).click()

  const pinDrop = page.getByRole('dialog', { name: 'Fijar el punto en el mapa' })
  await expect(pinDrop).toBeVisible({ timeout: 10_000 })
  const entendido = page.getByRole('button', { name: 'Entendido' })
  if (await entendido.isVisible().catch(() => false)) await entendido.click()

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

  const confirmarPin = page.getByRole('button', { name: /Confirmar ubicación/ })
  await expect(confirmarPin).toBeEnabled({ timeout: 10_000 })
  await confirmarPin.click()

  // Vuelve a "Tu ruta" con el pin puesto: el texto ya escrito sigue ahí y
  // ahora aparece "Listo" — tocarlo avanza al siguiente punto (o a "Confirma
  // tu pedido" si este era el segundo).
  await expect(page.getByText('Tu ruta')).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
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

  // ── Banner → abre directo "Tu ruta" con el punto A activo ────────────────
  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()
  await expect(page.getByText('Tu ruta')).toBeVisible()
  await expect(page.getByText('Completa el punto A primero')).toBeVisible()

  // ── Punto A: recogemos en ─────────────────────────────────────────────────
  await fijarPuntoDesdeTrip(page, 'Frente al mercado, puerta azul')

  // ── Punto B: llevamos a (ya habilitado) ───────────────────────────────────
  await expect(page.getByText('Completa el punto A primero')).toHaveCount(0)
  await fijarPuntoDesdeTrip(page, 'Casa celeste, segundo piso')

  // ── Confirma tu pedido (imagen 6): contacto de cada punto ────────────────
  await expect(page.getByText('Confirma tu pedido')).toBeVisible({ timeout: 10_000 })
  await page.getByPlaceholder('Quien entrega').fill('Doña Rosa')
  await page.getByPlaceholder('987 654 321').first().fill('987654321')
  await page.getByPlaceholder('987 654 321').last().fill('912345678')

  const continuar = page.getByRole('button', { name: 'Continuar' })
  await expect(continuar).toBeEnabled({ timeout: 10_000 })
  await continuar.click()

  // ── ¿Quién paga? ───────────────────────────────────────────────────────────
  await expect(page.getByText('¿Quién paga?').first()).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()

  // ── Qué llevamos ───────────────────────────────────────────────────────────
  await expect(page.getByText('¿Qué llevamos?')).toBeVisible()
  await page.getByPlaceholder(/Un sobre con papeles/).fill(descripcion)
  await page.getByRole('checkbox', { name: /Lo que envío está permitido/ }).check()

  const submit = page.getByRole('button', { name: /Pedir entrega/ })
  await expect(submit).toBeEnabled({ timeout: 10_000 })
  await submit.click()

  // ── Seguir-1: buscando motorizado ─────────────────────────────────────────
  await expect(page.getByText('Buscando motorizado')).toBeVisible({ timeout: 20_000 })

  const { data: rows } = await db
    .from('courier_orders')
    .select('id')
    .eq('item_description', descripcion)
    .order('created_at', { ascending: false })
    .limit(1)
  createdOrderIds = (rows ?? []).map((r) => r.id)
  expect(createdOrderIds.length, 'la solicitud tiene que haber quedado en la base').toBe(1)

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})

test('cambiar la ubicación desde "Confirma tu pedido" pide confirmación y limpia la referencia', async ({
  page,
}) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  await loginAsCustomer(page)
  await page.goto('/')

  const banner = page.getByRole('button', { name: /Tindivo Entregas/ })
  await expect(banner).toBeVisible({ timeout: 15_000 })
  await banner.click()
  await expect(page.getByText('Tu ruta')).toBeVisible()

  await fijarPuntoDesdeTrip(page, 'Frente al mercado, puerta azul')
  await fijarPuntoDesdeTrip(page, 'Casa celeste, segundo piso')
  const tripDetails = page.getByRole('dialog', { name: 'Confirma tu pedido' })
  await expect(tripDetails).toBeVisible({ timeout: 10_000 })

  // "Cambiar" de la primera tarjeta (Dónde recogemos) → popup de confirmación.
  // Acotado al diálogo: el home tiene su propia barra de dirección con un
  // botón "Cambiar dirección de entrega" que, sin acotar, gana por orden en
  // el DOM y queda tapado por el backdrop de esta hoja.
  await tripDetails.getByRole('button', { name: 'Cambiar' }).first().click()
  await expect(page.getByText('¿Estás seguro?')).toBeVisible()
  await page.getByRole('button', { name: 'Sí, cambiar' }).click()

  // Vuelve a "Tu ruta" con el punto A limpio y B intacto.
  await expect(page.getByText('Tu ruta')).toBeVisible()
  await expect(page.getByPlaceholder('Escriba dirección y referencia aquí…')).toHaveValue('')
  await expect(page.getByText('Casa celeste, segundo piso')).toBeVisible()

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})
