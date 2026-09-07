import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

function pnpm(script: string): void {
  try {
    execFileSync('pnpm', [script], { stdio: 'pipe', shell: true })
  } catch (e) {
    const proceso = e as { stderr?: Buffer; stdout?: Buffer }
    const salida = [proceso.stderr?.toString(), proceso.stdout?.toString()]
      .filter(Boolean)
      .join('\n')
      .trim()
    throw new Error(`\`pnpm ${script}\` falló:\n${salida || '(el proceso no dijo nada)'}`)
  }
}

/**
 * El recojo en el local, en la pantalla. (Migraciones 0219 y 0220)
 *
 * POR QUÉ EXISTE, TENIENDO YA `pickup.integration.test.ts`. Ese prueba las
 * REGLAS —quién entra, quién no, quién puede cerrar el pedido— llamando a las
 * RPC. No prueba lo único que decide si el canal funciona: si la pantalla LE
 * PIDE al cliente la respuesta de la que cuelga todo, y si lo que manda al
 * servidor es lo que el cliente contestó.
 *
 * Es exactamente el hueco que `vecino-conocido-contraentrega` documenta para la
 * 0171: la regla en verde y la última pulgada rota. Aquí sería peor, porque la
 * pulgada rota es la del ANTIFRAUDE — si el checkout mandara `'now'` por su
 * cuenta, un pedido de alguien que no está en el local se saltaría el guard de
 * contraentrega y la llamada de la cajera, y ningún test de RPC lo notaría: la
 * RPC estaría haciendo exactamente lo que se le pidió.
 *
 * LAS ASERCIONES SON SOBRE LA FILA, no sobre clases CSS. Lo que importa es con
 * qué `pickup_timing` y en qué `status` nació el pedido.
 *
 * SIN GEOLOCALIZACIÓN A PROPÓSITO, y es medio test por sí solo: el mostrador
 * está bajo techo y ahí es donde el GPS falla. Chromium headless sin permiso se
 * comporta como ese caso. Un recojo «ahora» tiene que entrar igual, porque su
 * garantía es la cajera mirando al cliente y no una coordenada.
 */

const CLIENTE = E2E.CUSTOMERS[1]
const tel9 = (e164: string) => e164.replace(/\D/g, '').slice(-9)

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

async function borrarPedidosDe(userId: string, phone: string): Promise<void> {
  const { data: pedidos } = await db.from('orders').select('id').eq('customer_user_id', userId)
  for (const p of pedidos ?? []) {
    await db.from('domain_events').delete().eq('aggregate_id', p.id)
    await db.from('order_event_log').delete().eq('order_id', p.id)
    await db.from('customer_order_items').delete().eq('order_id', p.id)
    await db.from('business_charges').delete().eq('order_id', p.id)
    await db.from('customer_strikes').delete().eq('order_id', p.id)
    await db.from('orders').delete().eq('id', p.id)
  }
  await db.from('orders').delete().eq('customer_phone', phone)
  await db.from('address_directory').delete().eq('phone', phone)
}

async function ultimoPedido(userId: string) {
  const { data } = await db
    .from('orders')
    .select('id, short_id, status, delivery_method, pickup_timing, delivery_fee, risk_flags')
    .eq('customer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

test.describe('0219/0220 · el recojo en el local, desde la pantalla del cliente', () => {
  test.beforeAll(async () => {
    pnpm('db:seed:e2e')
    // Estado declarado, no heredado: `delivered` es terminal y nadie lo limpia,
    // así que un pedido entregado de otra corrida convertiría a este cliente en
    // un vecino conocido y el caso de «sin historial» daría verde por el motivo
    // equivocado.
    await borrarPedidosDe(CLIENTE.userId, tel9(CLIENTE.phone))

    const { data: confiable } = await db.rpc('customer_trusted_for_contraentrega', {
      p_customer_user_id: CLIENTE.userId,
    })
    expect(confiable, 'el caso pierde sentido si el cliente ya tiene historial').toBe(false)

    const { data: biz } = await db
      .from('businesses')
      .select('accepts_web_pickup')
      .eq('id', E2E.BUSINESS_ID)
      .maybeSingle()
    expect(biz?.accepts_web_pickup, 'el negocio del seed debe aceptar recojo').toBe(true)
  })

  /**
   * SE LIMPIA LO PROPIO, Y NADA MÁS.
   *
   * Aquí NO se llama a `db:seed:e2e:clean` aunque otros specs lo hagan: ese
   * script borra TODOS los pedidos de TODOS los clientes e2e y de los negocios
   * e2e (`E2E_CUSTOMER_USER_IDS` / `E2E_BUSINESS_IDS`). Con eso, el cliente que
   * usa `happy-path-order` se queda sin ningún pedido previo, y su siguiente
   * pedido nace en `validando` en vez de `pending_acceptance` por la regla de
   * «primer pedido de este teléfono» — un rojo en OTRO spec, que apunta a la
   * pantalla equivocada. Medido en una corrida completa el 2026-09-07.
   *
   * `borrarPedidosDe` alcanza exactamente lo que este spec crea.
   */
  test.afterAll(async () => {
    await borrarPedidosDe(CLIENTE.userId, tel9(CLIENTE.phone))
  })

  test.afterEach(async () => {
    // Entre casos: el guard de pedido activo bloquea el segundo si queda uno
    // vivo, y el fallo aparecería en el CTA, que es el sitio equivocado.
    await borrarPedidosDe(CLIENTE.userId, tel9(CLIENTE.phone))
  })

  /**
   * LA PREGUNTA NO SE CONTESTA SOLA, y esta es la aserción que sostiene el
   * canal entero. De las dos respuestas, «ahora» es la que abre puertas: se
   * salta el guard de contraentrega y la llamada de la cajera porque una
   * persona lo va a verificar mirando. Si la pantalla la trajera marcada, ese
   * permiso se le regalaría a quien nunca contestó — y desde el servidor no hay
   * forma de distinguir esa respuesta de una de verdad.
   */
  test('elegir recojo no marca ninguna de las dos respuestas, y el CTA la pide', async ({
    page,
  }) => {
    await login(page, CLIENTE.email)
    await llegarAlCheckout(page)

    await page.getByRole('button', { name: 'Recojo' }).click()
    await expect(page.getByText('¿Cuándo recoges tu pedido?')).toBeVisible()

    const ahora = page.getByRole('button', { name: /Ahora, estoy en el local/ })
    const masTarde = page.getByRole('button', { name: 'Más tarde' })
    await expect(ahora).toHaveAttribute('aria-pressed', 'false')
    await expect(masTarde).toHaveAttribute('aria-pressed', 'false')

    // El CTA no se apaga: cambia de trabajo y dice qué falta.
    await expect(page.getByRole('button', { name: /Elige cuándo lo recoges/ })).toBeVisible()
  })

  /**
   * EL CASO QUE ABRE EL CANAL, Y EL QUE ESTABA CERRADO.
   *
   * Sin historial, sin GPS (headless, sin permiso de geolocalización) y pagando
   * al recibir. Antes de la 0220 esto moría con «Pago adelantado requerido»: el
   * guard de contraentrega corre antes de ramificar por método y sin
   * coordenadas `customer_gps_in_coverage` da false. O sea que el mostrador
   * estaba cerrado al vecino que estaba de pie delante de él.
   *
   * Y nace en `pending_acceptance`, NO en `validando`: no se llama por teléfono
   * a quien está al otro lado del mostrador.
   */
  test('«ahora» entra sin historial y sin GPS, y va a la cola de la cajera', async ({ page }) => {
    await login(page, CLIENTE.email)
    await llegarAlCheckout(page)

    await page.getByRole('button', { name: 'Recojo' }).click()
    await page.getByRole('button', { name: /Ahora, estoy en el local/ }).click()
    await expect(page.getByText(/Preparamos tu pedido cuando el local confirme/)).toBeVisible()

    // El envío desaparece de la cuenta: en un recojo no hay nada que cobrar por
    // llevarlo. Y el pie del CTA deja de hablar de motorizados.
    await expect(page.getByText('Pagas en el local al recoger tu pedido.')).toBeVisible()

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

    const pedido = await ultimoPedido(CLIENTE.userId)
    expect(pedido?.delivery_method).toBe('pickup')
    expect(pedido?.pickup_timing).toBe('now')
    expect(pedido?.status).toBe('pending_acceptance')
    expect(Number(pedido?.delivery_fee)).toBe(0)
    expect(pedido?.risk_flags?.pickupNowPresence).toBe(true)

    // Y el cliente aterriza en su seguimiento, que es donde vive el botón de
    // cancelar mientras el local no acepte.
    await expect(page).toHaveURL(new RegExp(`/pedido/${pedido?.short_id}`))
  })

  /**
   * EL CONTROL NEGATIVO, Y NO ES DE ADORNO. Sin él, «arreglar» el recojo
   * abriéndolo entero también daría verde.
   *
   * En «más tarde» la comida se hace sin nadie delante: es el escenario del
   * plantón que motivó todo esto, así que se le pide lo mismo que a un
   * delivery. Sin historial y sin GPS, eso es prepago.
   */
  test('«más tarde» sin historial y sin GPS NO se salta nada', async ({ page }) => {
    await login(page, CLIENTE.email)
    await llegarAlCheckout(page)

    await page.getByRole('button', { name: 'Recojo' }).click()
    await page.getByRole('button', { name: 'Más tarde' }).click()

    // La promesa de «te lo preparamos cuando el local confirme que te tiene
    // delante» es exclusiva de «ahora»: aquí no hay nadie delante.
    await expect(page.getByText(/Preparamos tu pedido cuando el local confirme/)).toHaveCount(0)

    /*
     * SE COMPRUEBA CONTRA EL MURO DE GPS, QUE ES DONDE DE VERDAD SE DECIDE.
     *
     * La pantalla no avisa por adelantado —desde la 0211 un cliente sin
     * historial puede intentar «al recibir», porque existe el crédito de GPS y
     * el navegador no sabe antes de confirmar si su coordenada cae en San
     * Jacinto—. Lo que sí hace es PEDIR la coordenada al confirmar, y sin ella
     * levanta `GeoBlockSheet` con su salida: pagar por adelantado.
     *
     * Ese muro es exactamente el que un recojo «ahora» NO encuentra (ver el
     * caso anterior: mismo navegador, mismo cliente, sin GPS, y el pedido
     * nace). La pareja de casos es la aserción entera — si alguien extiende la
     * exención de presencia física a los dos perfiles, este test se pone rojo.
     */
    await page.getByRole('button', { name: /Confirmar pedido/ }).click()
    await expect(
      page.getByRole('dialog').filter({ hasText: 'No pudimos leer tu ubicación' }),
    ).toBeVisible({ timeout: 20_000 })

    expect(await ultimoPedido(CLIENTE.userId), 'no debería haber nacido ningún pedido').toBeNull()
  })

  /**
   * Volver a delivery tiene que BORRAR la respuesta. El contrato prohíbe mandar
   * `pickupTiming` en un delivery (422), y un estado que sobreviva al cambio de
   * método es exactamente cómo se cuela: el cliente prueba «Recojo · ahora»,
   * vuelve a «Delivery», y el pedido sale con una respuesta que ya no significa
   * nada.
   */
  test('volver a delivery olvida la respuesta del recojo', async ({ page }) => {
    await login(page, CLIENTE.email)
    await llegarAlCheckout(page)

    await page.getByRole('button', { name: 'Recojo' }).click()
    await page.getByRole('button', { name: /Ahora, estoy en el local/ }).click()
    await expect(page.getByRole('button', { name: /Ahora, estoy en el local/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByRole('button', { name: 'Delivery' }).click()
    await expect(page.getByText('¿Cuándo recoges tu pedido?')).toHaveCount(0)

    await page.getByRole('button', { name: 'Recojo' }).click()
    await expect(page.getByRole('button', { name: /Ahora, estoy en el local/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
