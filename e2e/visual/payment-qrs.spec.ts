import { expect, test } from '@playwright/test'

/**
 * Las cuentas de cobro del negocio (0184): dos como máximo, y el negocio elige
 * cuál es la principal.
 *
 * Vive en `visual/` porque necesita la sesión de negocios que deja
 * `negocios.setup.ts`, pero NO compara capturas: lo que verifica es el
 * comportamiento, que es donde está el riesgo. El puesto de principal se
 * resuelve en el servidor y se lee en cuatro sitios distintos (panel de la
 * cajera, motorizado, prepago del cliente y este formulario); si el panel
 * dijera una cosa y la API otra, la cajera conciliaría contra una cuenta y el
 * cliente habría pagado a la otra.
 *
 * Requiere el mundo sembrado con `pnpm db:seed:e2e`, que da de alta las DOS
 * cuentas del negocio (Yape y Plin). Sin la segunda, la mitad de este test no
 * tendría nada que mirar.
 */

const NEGOCIOS = 'http://localhost:3002'

/**
 * Abre Configuración lista para tocar.
 *
 * Dos estorbos, los dos reales y los dos ajenos a esta feature:
 *   · El modal «¿Abren hoy?» se planta encima de todo y traga los clics.
 *   · El formulario se maqueta DOS veces —móvil y escritorio, la primera
 *     oculta por CSS— así que un locator a secas encuentra el invisible
 *     primero. Todo se busca dentro de `#section-yape`, que es el de
 *     escritorio, el único que este viewport enseña.
 */
async function abrirYape(page: import('@playwright/test').Page) {
  await page.goto(`${NEGOCIOS}/configuracion`)
  // El modal tarda en aparecer, asi que no vale con preguntar si ya esta: hay
  // que darle margen. Si no sale, seguimos igual.
  await page
    .getByRole('button', { name: 'Decidir más tarde' })
    .click({ timeout: 5_000 })
    .catch(() => {})
  await page.waitForLoadState('networkidle')
  const yape = page.locator('#section-yape')
  await yape.scrollIntoViewIfNeeded()
  return yape
}

test.describe('cuentas de cobro del negocio', () => {
  test('enseña las dos cuentas con su billetera, número y titular', async ({ page }) => {
    const yape = await abrirYape(page)

    // Las dos cuentas sembradas, cada una con su billetera.
    await expect(yape.getByText('Yape · 900000001')).toBeVisible()
    await expect(yape.getByText('Plin · 955512345')).toBeVisible()

    // El titular: es lo que Yape y Plin le enseñan al cliente al confirmar.
    const titulares = yape.locator('input[placeholder="Nombre del titular"]')
    await expect(titulares).toHaveCount(2)
    await expect(titulares.first()).toHaveValue('La Florencia E2E')
    await expect(titulares.nth(1)).toHaveValue('La Florencia E2E')

    // Exactamente una lleva el distintivo de principal.
    await expect(yape.getByText('Principal', { exact: true })).toHaveCount(1)
  })

  test('cambiar la principal la mueve, y deja la otra ofreciéndose', async ({ page }) => {
    const yape = await abrirYape(page)

    // La principal encabeza la lista, así que basta mirar qué slot va primero.
    const tarjetas = yape.locator('[data-testid="payment-qr-card"]')
    const antes = await tarjetas.first().getAttribute('data-slot')
    expect(antes).not.toBeNull()

    await yape.getByRole('button', { name: 'Hacer principal' }).click()
    await expect(tarjetas.first()).not.toHaveAttribute('data-slot', antes as string)
    await expect(yape.getByText('Principal', { exact: true })).toHaveCount(1)

    // Y sigue habiendo exactamente una candidata: "dos principales" o "ninguna"
    // no deben existir nunca.
    const volver = yape.getByRole('button', { name: 'Hacer principal' })
    await expect(volver).toHaveCount(1)

    // Se devuelve para no dejar la base con la principal cambiada.
    await volver.click()
    await expect(tarjetas.first()).toHaveAttribute('data-slot', antes as string)
  })

  test('no deja cargar una tercera cuenta', async ({ page }) => {
    const yape = await abrirYape(page)

    // Con los dos huecos ocupados no hay botón de añadir, y se dice por qué.
    await expect(yape.getByRole('button', { name: /Agregar cuenta/ })).toHaveCount(0)
    await expect(yape.getByText(/Ya tienes las dos cuentas/)).toBeVisible()
  })
})
