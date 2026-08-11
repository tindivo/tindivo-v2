import { expect, test as setup } from '@playwright/test'
import { E2E } from '../../apps/api/scripts/e2e-fixtures'

/**
 * Inicia sesión en el panel de negocios UNA vez y guarda la sesión en disco.
 * Los tests visuales la reutilizan vía `storageState`, así no pagan un login
 * por test ni dependen de que el formulario aparezca a tiempo.
 */
const SESSION = 'e2e/.auth/negocios.json'

setup('sesión de negocios', async ({ page }) => {
  await page.goto('http://localhost:3002/')

  const email = page.getByLabel(/correo/i)
  await expect(email).toBeVisible({ timeout: 30_000 })

  await email.fill(E2E.BUSINESS_EMAIL)
  await page.getByLabel(/contraseña/i).fill(E2E.PASSWORD)
  await page.getByRole('button', { name: /entrar/i }).click()

  // El formulario desaparece = la sesión cuajó.
  await expect(email).toBeHidden({ timeout: 30_000 })
  await expect
    .poll(
      async () => (await page.context().cookies()).some((c) => c.name === 'tindivo-negocios-auth'),
      { timeout: 15_000, message: 'no se creó la cookie de sesión de negocios tras el login' },
    )
    .toBe(true)

  // Desactiva la compuerta de notificaciones.
  await page.evaluate(() => {
    localStorage.setItem('tindivo_sound_on', 'true')
    localStorage.setItem('tindivo_notifications_gate_dismissed', 'true')
  })

  await page.context().storageState({ path: SESSION })
})
