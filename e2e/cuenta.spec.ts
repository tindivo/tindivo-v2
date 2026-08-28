import { expect, test } from '@playwright/test'

/**
 * `/cuenta` — la pantalla de la cuenta del cliente.
 *
 * POR QUÉ EXISTE. Toda la ruta de datos de esta pantalla se reescribió para que
 * dejara de esperar a la API: el resumen de apelaciones pasó de
 * `GET apiv2/customer/appeals` a leerse por RLS, el contador de pedidos activos
 * salió a un store compartido y perfil y datos pasaron a un solo lote paralelo.
 * Nada de eso tenía test, y los tres fallos que evita son silenciosos: un
 * contador que siempre marca cero, un salto de red que vuelve a colarse en el
 * camino crítico, o dos consultas a `orders` donde debería haber una.
 *
 * Las aserciones de red son la mitad importante. La pantalla puede verse
 * perfecta y haber tardado el doble en llegar.
 */

const E2E = {
  PASSWORD: 'e2e-password-12345',
  CUSTOMER_EMAIL: 'cliente@e2e.local',
  CUSTOMER_NAME: 'Cliente E2E',
  // Sembrada en `seed-e2e.ts` para este cliente, con `is_default = true`.
  ADDRESS_LINE: 'Jr. Los Pinos 123',
}

test.describe('/cuenta — la pantalla de la cuenta', () => {
  test('pinta perfil, direcciones y accesos sin pasar por la API', async ({ page }) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    // ── Entrar ───────────────────────────────────────────────────────────────
    // El `filter` no es adorno: en /entrar hay DOS formularios montados a la vez
    // (crear cuenta e iniciar sesión) con los mismos placeholders.
    await page.goto('/entrar')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
    await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
    await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
    await formLogin.locator('button[type="submit"]').click()
    await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })

    // ── Escuchar la red SOLO de esta pantalla ────────────────────────────────
    const peticiones: string[] = []
    page.on('request', (r) => peticiones.push(r.url()))

    await page.goto('/cuenta')

    // ── Lo que tiene que verse ───────────────────────────────────────────────
    // Por texto y no por rol: `ScreenHeader` pinta el título en un `div`, así que
    // «Mi cuenta» no es un heading (a diferencia de «Mis direcciones», que sí es h2).
    await expect(page.getByText('Mi cuenta', { exact: true }).first()).toBeVisible()

    // Perfil: prueba que `customer_profiles` llegó y se pintó.
    await expect(page.getByText(E2E.CUSTOMER_NAME).first()).toBeVisible()
    await expect(page.getByText(E2E.CUSTOMER_EMAIL).first()).toBeVisible()

    // Direcciones: prueba que `customer_addresses` llegó.
    await expect(page.getByRole('heading', { name: 'Mis direcciones' })).toBeVisible()
    await expect(page.getByText(E2E.ADDRESS_LINE).first()).toBeVisible()

    // Accesos rápidos. «Sin reclamos» es la prueba de que el resumen de
    // apelaciones se resolvió: si la consulta fallara, la tarjeta no llegaría a
    // ese texto. (No se afirma nada de «Pedidos recientes»: esa sección se
    // esconde entera cuando el cliente no tiene historial, y los tests de flujo
    // le crean y le borran pedidos a este mismo cliente.)
    // `exact` en todas: sin él, «Soporte» casa además con «Ayuda y soporte» del
    // menú de abajo y Playwright aborta por strict mode. Lo mismo con «Pedidos»,
    // que aparece en la tarjeta y en el historial.
    await expect(page.getByText('Pedidos', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Apelaciones', { exact: true })).toBeVisible()
    await expect(page.getByText('Sin reclamos', { exact: true })).toBeVisible()
    await expect(page.getByText('Soporte', { exact: true })).toBeVisible()

    // ── Lo que NO tiene que haber pasado por la red ──────────────────────────
    const apelacionesPorApi = peticiones.filter((u) => u.includes('/customer/appeals'))
    expect(
      apelacionesPorApi,
      'El resumen de apelaciones volvió a pedirse a la API. Se lee por RLS desde ' +
        '`reports`, precisamente para no meter un salto cross-origin en el camino ' +
        'crítico de esta pantalla.',
    ).toHaveLength(0)

    const apelacionesPorRls = peticiones.filter((u) => u.includes('/rest/v1/reports'))
    expect(
      apelacionesPorRls.length,
      'No se consultó `reports`: el resumen de apelaciones no se está pidiendo por RLS.',
    ).toBeGreaterThan(0)

    // Dos y no más: una del store compartido (pedidos activos, la misma que
    // alimenta el badge de la BottomNav) y otra de los pedidos recientes. Eran
    // tres, y la tercera —el contador— ni siquiera funcionaba.
    const consultasAOrders = peticiones.filter((u) => u.includes('/rest/v1/orders'))
    expect(
      consultasAOrders.length,
      [
        `Se consultó \`orders\` ${consultasAOrders.length} veces; se esperan 2 como mucho.`,
        'Alguien volvió a montar su propia consulta en vez de leer del store de `lib/active-orders.ts`.',
        // Las URLs completas: sin ellas, saber CUÁL sobra obliga a instrumentar
        // el test a mano cada vez que esto se pone rojo.
        ...consultasAOrders.map((u) => `  · ${decodeURIComponent(u.split('/rest/v1/')[1] ?? u)}`),
      ].join('\n'),
    ).toBeLessThanOrEqual(2)

    expect(errores, `errores de página: ${errores.join(' | ')}`).toHaveLength(0)
  })
})
