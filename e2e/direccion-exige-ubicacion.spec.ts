import { expect, test } from '@playwright/test'

/**
 * La ubicación es un campo obligatorio, y el GPS nunca es un requisito.
 *
 * POR QUÉ EXISTE. En producción se guardaron direcciones apuntando al centro
 * del pueblo: el formulario escribía el centro de cobertura como coordenada al
 * montar y `canSave` solo miraba calle y referencia. Alguien con prisa llenaba
 * los dos textos —sin enterarse de que había que tocar el mapa— y guardaba la
 * plaza como su casa; el motorizado salía hacia la plaza. Es el mismo defecto
 * que la migración 0147 documenta del v1 y que el app del motorizado ya había
 * cerrado por su lado.
 *
 * Los dos casos que se afirman aquí son justo los dos que fallaban:
 *   · permiso DENEGADO -> se dice, se ofrece reintentar, y marcar a mano sigue
 *     abierto. Nunca es un callejón sin salida.
 *   · sin punto elegido -> Guardar está bloqueado Y dice qué falta.
 *
 * No guarda nada: abre la hoja, mira y cierra. Así no deja basura en
 * `customer_addresses` para las suites que vienen detrás.
 */

const E2E = {
  PASSWORD: 'e2e-password-12345',
  CUSTOMER_EMAIL: 'cliente@e2e.local',
}

async function entrar(page: import('@playwright/test').Page) {
  // El `filter` no es adorno: en /entrar hay DOS formularios montados a la vez
  // (crear cuenta e iniciar sesión) con los mismos placeholders.
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })
}

test.describe('Nueva dirección — la ubicación es obligatoria', () => {
  test('sin permiso de GPS: lo dice, deja reintentar y NO cierra el camino manual', async ({
    page,
    context,
  }) => {
    // Denegado de verdad, a nivel de navegador: es el escenario que produjo el
    // incidente, y el que antes se veía idéntico a un acierto.
    await context.clearPermissions()

    await entrar(page)
    await page.goto('/cuenta')
    // Por regex y anclado al final: el botón lleva un `Icon` dentro, cuyo
    // `aria-label` entra en el nombre accesible («add Añadir»), y en la misma
    // pantalla vive además «Añadir otra dirección».
    await page.getByRole('button', { name: /Añadir$/ }).click()

    const hoja = page.getByRole('dialog', { name: 'Nueva dirección' })
    await expect(hoja.getByText('No pudimos usar tu GPS')).toBeVisible({ timeout: 20_000 })

    // El reintento existe: el permiso puede haberse rechazado sin querer.
    await expect(hoja.getByRole('button', { name: 'Permitir GPS' })).toBeVisible()
    // Y el camino que no depende del sensor sigue siendo el principal.
    await expect(hoja.getByRole('button', { name: 'Marcar en el mapa' })).toBeEnabled()
  })

  test('sin marcar el punto no se puede guardar, y el botón dice qué falta', async ({
    page,
    context,
  }) => {
    await context.clearPermissions()

    await entrar(page)
    await page.goto('/cuenta')
    // Por regex y anclado al final: el botón lleva un `Icon` dentro, cuyo
    // `aria-label` entra en el nombre accesible («add Añadir»), y en la misma
    // pantalla vive además «Añadir otra dirección».
    await page.getByRole('button', { name: /Añadir$/ }).click()

    const hoja = page.getByRole('dialog', { name: 'Nueva dirección' })
    await expect(hoja.getByText('No pudimos usar tu GPS')).toBeVisible({ timeout: 20_000 })

    // Se llenan los DOS textos, que es exactamente lo que hizo la persona del
    // incidente. Antes, con esto bastaba para que el botón se pusiera naranja.
    await hoja.getByPlaceholder('Ej. Jr. Sucre 412').fill('Jr. Sucre 412')
    await hoja
      .getByPlaceholder(/Frente a la bodega de don Carlos/)
      .fill('Casa de reja negra, tocar timbre dos veces')

    const guardar = hoja.getByRole('button', { name: 'Falta marcar tu ubicación' })
    await expect(guardar).toBeVisible()
    await expect(guardar).toBeDisabled()
  })
})
