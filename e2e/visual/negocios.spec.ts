import { expect, type Locator, type Page, test } from '@playwright/test'

/**
 * Regresión visual del panel de negocios.
 *
 * Por qué existe: el panel se está migrando al design system compartido, y hasta
 * ahora cada cambio se validaba mirando una captura a mano. Eso no escala y no
 * detecta lo que se rompe en la pantalla de al lado. Estos tests convierten
 * «no se movió nada» en algo verificable en segundos.
 *
 *   pnpm test:e2e:visual                      → compara contra las capturas base
 *   pnpm test:e2e:visual --update-snapshots   → regraba tras un cambio deliberado
 *
 * Las capturas viven en `negocios.spec.ts-snapshots/`. Revisa su diff como el
 * del código: si cambia una que no esperabas, ahí está el fallo.
 *
 * Requiere Supabase local arriba y el mundo sembrado (`pnpm db:seed:e2e`).
 * La sesión la crea `negocios.setup.ts`, que corre antes.
 *
 * ⚠ TRAMPA DE CACHÉ, leer antes de dudar de un resultado:
 * `next dev` NO invalida su caché cuando cambia `packages/ui/src/theme.css`.
 * Ni editar el fichero ni reiniciar el servidor bastan: sigue sirviendo el CSS
 * viejo. Si tocas tokens del design system y quieres verlo — aquí o en el
 * navegador — hay que borrar la caché:
 *
 *   rm -rf apps/negocios/.next
 *
 * Sin eso, estos tests pasan «en verde» contra estilos que ya no existen. Me
 * costó cuatro intentos fallidos de validación descubrirlo, y es la misma razón
 * por la que un cambio de tokens puede parecer que «no hace nada» en desarrollo.
 */

const NEGOCIOS = 'http://localhost:3002'

/** Elementos que cambian solos y harían fallar la captura por sí mismos:
 *  cuentas atrás, «hace 3m», relojes. Se enmascaran, no se excluyen: si
 *  desaparecieran de la pantalla el hueco cambiaría y el test fallaría. */
function volatile(page: Page): Locator[] {
  return [
    page.locator('.font-mono').filter({ hasText: /^\d{1,2}:\d{2}$/ }),
    page.locator('text=/hace \\d+m/'),
    page.locator('text=/listo en ~?\\d+/i'),
    /**
     * EL QR SALE DE INTERNET, ASÍ QUE NO PUEDE DECIDIR SI EL TEST PASA.
     *
     * El seed pone `businesses.qr_url` apuntando a `api.qrserver.com`, un
     * servicio EXTERNO. La imagen carga o no según haya red y según cómo respire
     * ese servicio, y el resultado se colaba en la captura de `configuracion`:
     * el mismo código daba verde o rojo según el momento, sin que nadie hubiera
     * tocado la pantalla. Un test de regresión visual que depende de un tercero
     * no mide la regresión, mide la conexión.
     *
     * Enmascarado —no excluido— para que el hueco siga ocupando su sitio: si el
     * QR desapareciera del formulario, la maquetación cambiaría y eso SÍ debe
     * fallar.
     */
    page.locator('img[src*="qrserver.com"], img[alt*="QR" i]'),
  ]
}

/** Estabiliza antes de disparar: sin `document.fonts.ready` el primer render
 *  usa la fuente fallback y la captura sale con otra métrica. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
}

const PANTALLAS = [
  { ruta: '/', nombre: 'tablero' },
  { ruta: '/nuevo', nombre: 'pedido-manual' },
  { ruta: '/menu', nombre: 'menu' },
  { ruta: '/deuda', nombre: 'deuda' },
  { ruta: '/historial', nombre: 'historial' },
  { ruta: '/configuracion', nombre: 'configuracion' },
] as const

test.describe('regresión visual — panel de negocios', () => {
  for (const { ruta, nombre } of PANTALLAS) {
    test(`${nombre} se ve igual`, async ({ page }) => {
      await page.goto(`${NEGOCIOS}${ruta}`)

      // Ancla ESTRUCTURAL, no textual. La primera versión buscaba texto por
      // pantalla y falló en cuatro de cinco; peor, `deuda` pasó en falso porque
      // su ancla (/cuenta/i) casaba con «Ingresa con la cuenta que te dio
      // Tindivo» del login, y capturó la pantalla equivocada.
      // La barra lateral solo existe con sesión: sirve de prueba de que
      // estamos dentro, en cualquier ruta.
      // `.first()`: algunas rutas montan la barra lateral de escritorio Y la de
      // móvil, y sin acotar salta la violación de modo estricto de Playwright.
      await expect(page.getByText(/SAN JACINTO/i).first()).toBeVisible({ timeout: 30_000 })
      await expect(page.getByLabel(/contraseña/i)).toHaveCount(0)

      await settle(page)

      await expect(page).toHaveScreenshot(`${nombre}.png`, {
        fullPage: true,
        mask: volatile(page),
        // `threshold` es la tolerancia POR PÍXEL en espacio YIQ. El valor por
        // defecto (0.2) es demasiado laxo para esta paleta: cambiar el fondo de
        // #faf6f1 a #f5eee4 no registraba un solo píxel como distinto y el test
        // pasaba con la pantalla cambiada. A 0.02 sí lo caza.
        threshold: 0.02,
        // Y este es el margen de píxeles que SÍ pueden diferir, para absorber
        // el antialiasing entre ejecuciones.
        maxDiffPixelRatio: 0.002,
      })
    })
  }

  /**
   * El formulario de pedido manual vive en un contenedor con scroll propio, así
   * que `fullPage` solo alcanza lo que entra en el viewport y deja fuera la
   * mitad de abajo. Este test cubre el selector de método de pago, que es
   * justo lo que queda cortado — y donde vive el color por método.
   */
  test('selector de método de pago', async ({ page }) => {
    await page.goto(`${NEGOCIOS}/nuevo`)
    await expect(page.getByText(/SAN JACINTO/i).first()).toBeVisible({ timeout: 30_000 })

    // `data-testid` y no un filtro por texto: la primera versión buscaba el div
    // que contuviera «Método de pago» y capturaba solo la etiqueta, porque el
    // match más profundo es el propio label, no la tarjeta.
    const tarjeta = page.getByTestId('payment-selector')
    await tarjeta.scrollIntoViewIfNeeded()
    await settle(page)

    await expect(tarjeta).toHaveScreenshot('pedido-manual-pago.png', {
      threshold: 0.02,
      maxDiffPixelRatio: 0.002,
    })
  })
})
