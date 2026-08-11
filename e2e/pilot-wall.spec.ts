import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Muro del piloto cerrado en la portada de `apps/customer`.
 *
 * Cubre lo que el test de integración del API no puede ver: que el muro venga ya
 * pintado en el HTML (sin parpadeo de portada), que el input de teléfono deje
 * entrar a un invitado y rechace al que no lo es, que `?pilot=<token>` lo levante
 * y lo recuerde, y que pasada la hora de lanzamiento no se renderice.
 *
 * El reloj se falsea con `page.clock.setFixedTime`, que solo toca `Date` — igual
 * criterio que en el test de integración.
 */

// Keys locales del CLI de Supabase (públicas y documentadas, igual que en
// `apps/api/lib/__tests__/helpers/local-db.ts`).
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const db = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const WALL = { role: 'dialog' as const, name: 'Tindivo abre pronto' }
const TOKEN = 'sanjacinto-abre-2026'
const STORAGE_KEY = 'tindivo.pilot.bypass'
/** Un minuto después de PILOT_LAUNCH_AT (2026-08-14T23:00:00Z). */
const AFTER_LAUNCH = new Date('2026-08-14T23:01:00Z')

const PHONE_IN = '986000111'
const PHONE_OUT = '986000222'

test.beforeAll(async () => {
  await db.from('pilot_whitelist').delete().in('phone', [PHONE_IN, PHONE_OUT])
  const { error } = await db.from('pilot_whitelist').insert({ phone: PHONE_IN })
  if (error) throw new Error(`seed pilot_whitelist failed: ${error.message}`)
})

test.afterAll(async () => {
  await db.from('pilot_whitelist').delete().in('phone', [PHONE_IN, PHONE_OUT])
})

test.describe('muro del piloto', () => {
  test('P6.a el muro viene en el HTML del servidor, sin parpadeo de portada', async ({ page }) => {
    // Se mira la respuesta HTML cruda: si el muro estuviera solo en el cliente,
    // esta aserción fallaría y el usuario vería la portada antes que el muro.
    const res = await page.goto('/')
    const html = (await res?.text()) ?? ''
    expect(html).toContain('data-pilot-wall')
    expect(html).toContain('piloto cerrado')

    const wall = page.getByRole(WALL.role, { name: WALL.name })
    await expect(wall).toBeVisible()
    await expect(wall).toContainText(/\d+d \d{2}:\d{2}:\d{2}/)

    // El catálogo NO está cerrado: sigue montado detrás, desenfocado.
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
    await expect(wall).toHaveCSS('backdrop-filter', /blur/)
  })

  test('P6.b un número de la whitelist entra y el acceso persiste al recargar', async ({
    page,
  }) => {
    await page.goto('/')
    const wall = page.getByRole(WALL.role, { name: WALL.name })
    await expect(wall).toBeVisible()

    await page.getByLabel('Tu número de celular').fill(PHONE_IN)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(wall).toHaveCount(0)
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe('1')

    await page.reload()
    await expect(wall).toHaveCount(0)
  })

  test('P6.c un número fuera de la whitelist NO entra', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Tu número de celular').fill(PHONE_OUT)
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByText('Ese número todavía no está en la lista.')).toBeVisible()
    await expect(page.getByRole(WALL.role, { name: WALL.name })).toBeVisible()
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBeNull()
  })

  test('P6.d el enlace al formulario apunta al Google Form', async ({ page }) => {
    await page.goto('/')
    const link = page.getByRole('link', { name: /Pide tu acceso/ })
    await expect(link).toHaveAttribute('href', 'https://forms.gle/BNDEMXSmpTJD6Fna8')
  })

  test('P6.e ?pilot=<token> levanta el muro, limpia la URL y persiste', async ({ page }) => {
    await page.goto(`/?pilot=${TOKEN}`)

    const wall = page.getByRole(WALL.role, { name: WALL.name })
    await expect(wall).toHaveCount(0)
    await expect(page).toHaveURL(/\/$/)

    await page.reload()
    await expect(wall).toHaveCount(0)
    expect(await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY)).toBe('1')
  })

  test('P6.f un token equivocado NO levanta el muro', async ({ page }) => {
    await page.goto('/?pilot=no-es-el-token')
    await expect(page.getByRole(WALL.role, { name: WALL.name })).toBeVisible()
  })

  test('P6.g pasada la hora de lanzamiento el muro no se renderiza', async ({ page }) => {
    await page.clock.setFixedTime(AFTER_LAUNCH)
    await page.goto('/')

    await expect(page.getByRole(WALL.role, { name: WALL.name })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
