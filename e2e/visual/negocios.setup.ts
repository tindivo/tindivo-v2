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
  //
  // Este `toBeHidden` NO es vacuo —el campo se afirmó visible justo arriba, así
  // que aquí sí espera a que desaparezca—, pero prueba lo que no toca: que la UI
  // cambió, no que haya sesión. Si el formulario se ocultara por cualquier otro
  // motivo, la sesión guardada saldría vacía y los tests visuales fallarían más
  // tarde con capturas del login, sin decir por qué.
  //
  // La cookie no puede existir sin un login real, y esta comprobación va ANTES
  // de volcar el `storageState`, que es lo único que estos tests reutilizan.
  await expect(email).toBeHidden({ timeout: 30_000 })
  await expect
    .poll(
      async () => (await page.context().cookies()).some((c) => c.name === 'tindivo-negocios-auth'),
      { timeout: 15_000, message: 'no se creó la cookie de sesión de negocios tras el login' },
    )
    .toBe(true)

  // Desactiva la compuerta de notificaciones. Sin esto sale un modal a pantalla
  // completa (`fixed inset-0 bg-black/85`) sobre CUALQUIER ruta, y las capturas
  // salen del modal con el panel oscurecido detrás. Pasaban en verde igual,
  // porque `toBeVisible` de Playwright comprueba tamaño y CSS, NO oclusión: el
  // ancla de la barra lateral se considera visible aunque haya algo encima.
  //
  // Va en la sesión guardada, no en cada test, porque la compuerta se decide en
  // el montaje del chrome leyendo localStorage.
  await page.evaluate(() => {
    localStorage.setItem('tindivo_sound_on', 'true')
    localStorage.setItem('tindivo_notifications_gate_dismissed', 'true')
  })

  await page.context().storageState({ path: SESSION })
})
