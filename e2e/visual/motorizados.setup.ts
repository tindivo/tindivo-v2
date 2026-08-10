import { expect, test as setup } from '@playwright/test'
import { E2E } from '../../apps/api/scripts/e2e-fixtures'

/**
 * Inicia sesión en la app del motorizado UNA vez y guarda la sesión en disco.
 * Calcado de `negocios.setup.ts`, con la misma lección aprendida en el T-fix.
 */
const SESSION = 'e2e/.auth/motorizados.json'
const MOTOS = 'http://localhost:3004'

setup('sesión de motorizado', async ({ page }) => {
  await page.goto(`${MOTOS}/`)

  const email = page.locator('input[type="email"]')
  const pass = page.locator('input[type="password"]')
  await expect(email).toBeVisible({ timeout: 30_000 })

  // Rellenar y COMPROBAR que los valores siguen ahí: el montaje de React puede
  // limpiar un campo entre un `fill` y el siguiente, y entonces se enviaría el
  // formulario a medias sin que nada lo delate.
  await expect
    .poll(
      async () => {
        await email.fill(E2E.DRIVER_EMAIL)
        await pass.fill(E2E.PASSWORD)
        return (await email.inputValue()) !== '' && (await pass.inputValue()) !== ''
      },
      { timeout: 20_000 },
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Entrar' }).click()

  // ── La sesión tiene que EXISTIR, no solo parecerlo ────────────────────────
  //
  // Nada de `toBeHidden` sobre un elemento que quizá no esté en la página: esa
  // es exactamente la aserción vacua que dejó el happy path del cliente
  // mintiendo en verde (ver la nota del helper en `happy-path-order.spec.ts`).
  // La cookie no puede existir sin un login real, y se comprueba ANTES de
  // volcar el `storageState`, que es lo único que reutilizan los tests.
  await expect
    .poll(
      async () => (await page.context().cookies()).some((c) => c.name === 'tindivo-driver-auth'),
      { timeout: 20_000, message: 'no se creó la cookie de sesión del motorizado tras el login' },
    )
    .toBe(true)

  await expect(page.getByRole('tab', { name: /En espera/ })).toBeVisible({ timeout: 30_000 })

  await page.context().storageState({ path: SESSION })
})
