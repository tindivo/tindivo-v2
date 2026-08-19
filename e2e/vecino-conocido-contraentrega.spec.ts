import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/** Corre un script del monorepo. `pnpm` en Windows necesita shell. */
function pnpm(script: string): void {
  execFileSync('pnpm', [script], { stdio: 'pipe', shell: true })
}

/**
 * La contraentrega del vecino conocido, en la pantalla. (Migración 0171)
 *
 * POR QUÉ ESTE TEST EXISTE. Los tests de integración de la 0171 prueban el
 * PREDICADO: que la RPC deja pasar `pending_cash` a quien tiene historial. No
 * prueban lo único que el cliente ve, que es si la pantalla se lo OFRECE — y ahí
 * había un fallo que ningún test de DB podía atrapar:
 *
 *   `hasDeliveryHistory` arranca en false y lo resuelve un RPC. El efecto que
 *   fuerza el prepago corría antes de la respuesta: montaba, marcaba `prepaid`,
 *   llegaba el historial, `mustPrepay` pasaba a false... y el pago se quedaba en
 *   `prepaid`, porque ese efecto solo empuja hacia el prepago y nunca de vuelta.
 *
 *   El vecino veía las otras opciones habilitadas pero sin marcar. La mayoría
 *   acepta lo que ya viene marcado, así que la 0171 quedaba neutralizada en la
 *   última pulgada.
 *
 * LA ASERCIÓN ES EL `payment_intent` DE LA FILA, no una clase CSS. El test
 * atraviesa el checkout SIN TOCAR el método de pago y mira con qué intención
 * nació el pedido. Antes del arreglo esa fila salía `prepaid`; ahora sale
 * `pending_cash`. Es la diferencia exacta que importa, y no depende del render.
 *
 * EL CONTROL NEGATIVO NO ES DE ADORNO. Sin él, "arreglar" esto abriendo la
 * contraentrega a todo el mundo también daría verde.
 *
 * PRECONDICIONES EXPLÍCITAS. `delivered` es terminal y ninguna suite lo limpia,
 * así que un pedido entregado de otra corrida convertiría al cliente del control
 * negativo en un vecino conocido y el test daría verde por el motivo equivocado.
 * El `beforeAll` deja a los dos clientes en un estado declarado y lo AFIRMA
 * contra la RPC antes de abrir el navegador.
 */

/** El del ETL del v1: 9 dígitos, como `address_directory.phone`. */
const VECINO = E2E.CUSTOMERS[0]
const DESCONOCIDO = E2E.CUSTOMERS[1]
const tel9 = (e164: string) => e164.replace(/\D/g, '').slice(-9)

const directorioSembrado: string[] = []

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(email)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 20_000 })
  await expect
    .poll(
      async () => (await page.context().cookies()).some((c) => c.name === 'tindivo-customer-auth'),
      { timeout: 15_000, message: 'no se creó la cookie de sesión del cliente tras el login' },
    )
    .toBe(true)
}

/** Del catálogo al checkout con el pollo en el carrito. Sin tocar el pago. */
async function llegarAlCheckout(page: Page): Promise<void> {
  await page.goto(`/negocio/${E2E.BUSINESS_ID}`)
  await expect(page.getByText(E2E.ITEM_POLLO_NAME).first()).toBeVisible()
  await page.getByText(E2E.ITEM_POLLO_NAME).first().click()
  const agregar = page.getByRole('button', { name: /^Agregar ·/ })
  await expect(agregar).toBeEnabled()
  await agregar.click()
  await page.getByRole('button', { name: 'Ir a pagar' }).click()
  await expect(page).toHaveURL(/\/checkout/)
  await expect(page.getByText('Método de pago')).toBeVisible()
}

test.describe('0171 · al vecino conocido la pantalla le ofrece contraentrega', () => {
  // Chromium headless no tiene GPS y el checkout lo exige (guard de 0082).
  // Mismas coordenadas que la dirección sembrada: no se activa el aviso por
  // distancia (>0.4 km) y se mide el camino feliz de verdad.
  test.use({
    geolocation: { latitude: E2E.CUSTOMER_LAT, longitude: E2E.CUSTOMER_LNG },
    permissions: ['geolocation'],
  })

  test.beforeAll(async () => {
    pnpm('db:seed:e2e')

    // Estado declarado, no heredado. Se borra TODO pedido de los dos clientes
    // —`delivered` incluido, que es el que sedimenta— y toda fila de directorio
    // de sus teléfonos.
    for (const c of [VECINO, DESCONOCIDO]) {
      const { data: pedidos } = await db
        .from('orders')
        .select('id')
        .eq('customer_user_id', c.userId)
      for (const p of pedidos ?? []) {
        await db.from('domain_events').delete().eq('aggregate_id', p.id)
        await db.from('order_event_log').delete().eq('order_id', p.id)
        await db.from('customer_order_items').delete().eq('order_id', p.id)
        await db.from('orders').delete().eq('id', p.id)
      }
      await db.from('orders').delete().eq('customer_phone', tel9(c.phone))
      await db.from('address_directory').delete().eq('phone', tel9(c.phone))
    }

    // El vecino: una entrega del v1, congelada en el ETL. Es lo que la 0171
    // cuenta como historial — y lo que 591 teléfonos de prod tienen.
    const { data: fila, error } = await db
      .from('address_directory')
      .insert({
        phone: tel9(VECINO.phone),
        reference: 'Casa de dos pisos junto a la bodega',
        source: 'backfill',
        legacy_address_id: crypto.randomUUID(),
        imported_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) throw new Error(`no se pudo sembrar el directorio: ${error.message}`)
    directorioSembrado.push(fila.id)

    // Las precondiciones se AFIRMAN. Si el mundo no quedó como se declaró, que
    // falle aquí y no cincuenta líneas más abajo disfrazado de fallo de UI.
    const { data: confiable } = await db.rpc('customer_trusted_for_contraentrega', {
      p_customer_user_id: VECINO.userId,
    })
    expect(confiable, 'el vecino debería contar como conocido').toBe(true)
    const { data: extraño } = await db.rpc('customer_trusted_for_contraentrega', {
      p_customer_user_id: DESCONOCIDO.userId,
    })
    expect(extraño, 'el control negativo NO debería tener historial').toBe(false)
  })

  test.afterAll(async () => {
    for (const id of directorioSembrado.splice(0)) {
      await db.from('address_directory').delete().eq('id', id)
    }
    pnpm('db:seed:e2e:clean')
  })

  test('el pedido nace en contraentrega sin que el cliente toque el método de pago', async ({
    page,
  }) => {
    const fallosApi: string[] = []
    page.on('response', async (res) => {
      if (res.url().includes('/api/v1/') && !res.ok()) {
        fallosApi.push(`${res.status()} ${res.url()} :: ${await res.text().catch(() => '?')}`)
      }
    })

    await login(page, VECINO.email)
    await llegarAlCheckout(page)

    // Al vecino conocido no se le explica ningún prepago: no hay motivo que dar.
    await expect(page.getByText(/pago es adelantado|requieren pago adelantado/)).toHaveCount(0)

    // Las tres opciones existen. Con `mustPrepay` las otras dos ni se renderizan
    // (`unified-checkout.tsx` las filtra), así que verlas ya prueba que la 0171
    // llegó a la pantalla.
    await expect(page.getByRole('button', { name: /Efectivo al recibir/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Prepago con billetera/ })).toBeVisible()

    // SIN TOCAR NADA: se confirma con lo que la pantalla trajo marcado.
    const confirmar = page.getByRole('button', { name: /Confirmar pedido/ })
    await expect(confirmar).toBeEnabled()
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/api\/v1\/.*orders/.test(r.url()),
        { timeout: 20_000 },
      ),
      confirmar.click(),
    ])
    expect(
      resp.ok(),
      `POST de creación devolvió ${resp.status()}: ${await resp.text().catch(() => '?')}`,
    ).toBe(true)

    const leerUltimo = async () => {
      const { data } = await db
        .from('orders')
        .select('id, payment_intent, status, validation_reason_code')
        .eq('customer_user_id', VECINO.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    }
    const pedido = await expect
      .poll(leerUltimo, {
        timeout: 20_000,
        message: () =>
          `el pedido no apareció. Fallos de API: ${fallosApi.join(' | ') || '(ninguno)'}`,
      })
      .not.toBeNull()
      .then(leerUltimo)

    // LA ASERCIÓN. Antes del arreglo del efecto, esta fila salía 'prepaid'.
    expect(
      pedido.payment_intent,
      'el vecino conocido debería pagar al recibir, no por adelantado',
    ).toBe('pending_cash')

    // Y NACE EN `validando`, no en `pending_acceptance`. No es un defecto: la
    // última regla de `create_customer_order` manda a revisión de la cajera todo
    // pedido no-prepagado cuyo TELÉFONO no tenga pedidos previos en v2, y el
    // historial de este vecino es del v1. Es el antifraude humano del que habla
    // CLAUDE.md, y la primera vez le toca.
    //
    // Lo que la 0171 le quita al vecino es el PREPAGO —subir la captura del Yape
    // y esperar—, no la validación. Desde su segundo pedido ya cae en
    // `pending_acceptance` como cualquiera.
    expect(pedido.status).toBe('validando')
    expect(pedido.validation_reason_code).toBe('standard_validation_rule')
  })

  test('al cliente sin historial la pantalla solo le deja prepagar', async ({ page }) => {
    await login(page, DESCONOCIDO.email)
    await llegarAlCheckout(page)

    // El motivo se le dice, y es el del primer pedido.
    await expect(page.getByText(/En tu primer pedido el pago es adelantado/)).toBeVisible()

    // Y las opciones de contraentrega NO están: `mustPrepay` las filtra.
    await expect(page.getByRole('button', { name: /Prepago con billetera/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Efectivo al recibir/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Billetera digital al recibir/ })).toHaveCount(0)
  })
})
