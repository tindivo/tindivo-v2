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

  // `getByLabel` funciona porque el input va DENTRO del <label> (asociación
  // implícita). Hace falta esperarlo: `page.goto` resuelve en `load`, antes de
  // que React monte, y un `isVisible()` inmediato daría false.
  const email = page.getByLabel(/correo/i)
  await expect(email).toBeVisible({ timeout: 30_000 })

  await email.fill(E2E.BUSINESS_EMAIL)
  await page.getByLabel(/contraseña/i).fill(E2E.PASSWORD)
  await page.getByRole('button', { name: /entrar/i }).click()

  // El formulario desaparece = la sesión cuajó.
  await expect(email).toBeHidden({ timeout: 30_000 })

  await page.context().storageState({ path: SESSION })
})
