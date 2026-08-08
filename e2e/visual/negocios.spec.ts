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
      await expect(page.getByText(/SAN JACINTO/i)).toBeVisible({ timeout: 30_000 })
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
})
