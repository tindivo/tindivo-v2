import { expect, test } from '@playwright/test'

/**
 * Smoke: valida la tubería Playwright ↔ app local ↔ Supabase local ANTES de
 * escribir lógica de flujo. Si esto falla, el problema es de setup, no del test.
 */
test.describe('smoke — la app customer local responde', () => {
  test('la home carga y renderiza el catálogo del mundo sembrado', async ({ page }) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    await page.goto('/')

    // 1. La app respondió y montó.
    await expect(page).toHaveTitle(/Tindivo/i)

    // 2. Prueba de conectividad real con Supabase local: el negocio sembrado
    //    tiene que aparecer en el catálogo. Si el env de Supabase faltara,
    //    `getSupabaseBrowser()` lanzaría y esto no estaría.
    await expect(page.getByText('La Florencia E2E').first()).toBeVisible()

    // 3. Ningún error de runtime en la página (p. ej. env ausente).
    expect(errores, `errores de página: ${errores.join(' | ')}`).toHaveLength(0)
  })
})
