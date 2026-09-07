import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * Corre un script del monorepo. `pnpm` en Windows necesita shell.
 *
 * `stdio: 'pipe'` mantiene la salida fuera del reporte cuando todo va bien, pero
 * también se la tragaba cuando NO: un seed caído llegaba como «Command failed:
 * pnpm db:seed:e2e» y punto, sin el motivo, en un `beforeAll` que tumba los dos
 * tests a la vez. La salida del proceso se rescata y se adjunta al error.
 */
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

/**
 * Los métodos de pago, localizados POR SU SUBTÍTULO y no por su título.
 *
 * No es una manía: desde que las opciones se ordenan por CUÁNDO se paga, DOS de
 * las tres se titulan igual, «Yape o Plin», y lo único que las distingue es el
 * subtítulo —«Le transfieres al motorizado en tu puerta» contra «Pagas apenas el
 * local confirme»—. Un localizador por título casaría con las dos.
 *
 * Y es lo que este test quiere afirmar de verdad: no cómo se llama el botón,
 * sino a quién y cuándo se le paga. La fuente es `PAYMENT_OPTIONS` en
 * `apps/customer/features/checkout/types.ts`; si estos patrones dejan de casar,
 * ahí está el cambio.
 *
 * (Los anteriores —«Efectivo al recibir», «Prepago con billetera», «Billetera
 * digital al recibir»— eran títulos que ya no existen, y por eso este test se
 * puso rojo sin que el producto tuviera nada mal.)
 *
 * EL ROL ES `radio`, NO `button`. Las opciones eran `<button>` con un `<span>`
 * redondo dibujado a mano —sin `role`, sin `aria-checked`, sin flechas del
 * teclado— y ahora son `<input type="radio">` de verdad dentro de un `<label>`.
 * Este test se volvió a poner rojo por lo mismo que la vez anterior: cambió la
 * forma, no el producto.
 *
 * Y se afirma sobre el ESTADO del control (`toBeEnabled` / `toBeDisabled` /
 * `toBeChecked`), no sobre `toBeVisible`. El input va con `sr-only`, que es 1×1
 * y recortado: «visible» ahí no significa nada. El estado sí, y además es lo
 * que este test quiere decir.
 */
const PAGO = {
  efectivo: /Le pagas al motorizado/,
  yapeAlRecibir: /Le transfieres al motorizado/,
  // El prepago tiene DOS subtítulos y depende de si está marcado: al marcarlo,
  // `unified-checkout` sustituye la descripción por la promesa «No pagas nada
  // ahora». Los dos tests de aquí lo pillan en estados distintos —al vecino le
  // viene marcado el efectivo, al desconocido le viene marcado el prepago—, así
  // que el patrón cubre los dos o uno de los dos sale rojo.
  prepago: /Pagas apenas el local confirme|No pagas nada ahora/,
} as const

/**
 * Las tres frases con que la pantalla EXPLICA un prepago forzado (`prepayReason`
 * en `use-checkout-state.ts`): bloqueo antifraude, primer pedido y tope de
 * efectivo. Deliberadamente no casa con «Antes de recibir», que es la cabecera
 * del grupo y se muestra a todo el mundo.
 */
const RE_MOTIVO_PREPAGO = /pago (va )?adelantado/

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
    // El patrón cubre las TRES variantes de `prepayReason` (bloqueo, primer
    // pedido y tope de efectivo), que son las únicas frases que dicen «pago
    // adelantado». No casa con «Antes de recibir», que es la cabecera del grupo
    // y al vecino sí se le muestra: su tercera opción vive ahí.
    await expect(page.getByText(RE_MOTIVO_PREPAGO)).toHaveCount(0)

    // Al vecino conocido la contraentrega le llega ACCIONABLE, que es más que
    // «existe»: desde que las opciones bloqueadas se apagan en vez de ocultarse,
    // estar en el DOM ya no prueba que se puedan usar. `toBeEnabled` sí.
    await expect(page.getByRole('radio', { name: PAGO.efectivo })).toBeEnabled()
    await expect(page.getByRole('radio', { name: PAGO.prepago })).toBeEnabled()
    // Y le viene marcada la de al recibir, que es lo que la 0171 le devuelve.
    await expect(page.getByRole('radio', { name: PAGO.efectivo })).toBeChecked()

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

  /**
   * 0211 · AL CLIENTE SIN HISTORIAL PERO DEL PUEBLO YA NO SE LE FUERZA EL PREPAGO.
   *
   * ESTE TEST AFIRMABA LO CONTRARIO, y la 0211 lo invirtió a propósito. Decía
   * «la pantalla solo le deja prepagar» y comprobaba tres cosas que ya no
   * existen: el aviso «tu primer pedido va con pago adelantado» y los dos radios
   * de contraentrega deshabilitados.
   *
   * Lo que cambió. `create_customer_order` acepta ahora una señal más: el GPS EN
   * VIVO del cliente al pedir. Sin historial pero con el GPS dentro del polígono
   * de San Jacinto, la contraentrega se abre —entrando a `validando`, que es la
   * llamada de la cajera— en vez de exigir prepago. Y como esa decisión depende
   * de una coordenada que solo el servidor puede juzgar, `isNewUser` salió de
   * `prepayReason` (ver `use-checkout-state.ts`): la pantalla ya no adivina, no
   * pinta el bloque bloqueado, y el servidor decide al confirmar.
   *
   * POR QUÉ ESTE TEST CAE JUSTO AQUÍ. El `test.use` de este bloque le da a todo
   * el describe geolocalización en las coordenadas del cliente sembrado, que
   * están dentro de San Jacinto. O sea que el desconocido de este test es
   * exactamente el caso que la 0211 vino a rescatar: cero historial, GPS del
   * pueblo.
   *
   * Y QUÉ CUBRE, QUE NO ES LO MISMO QUE ANTES. Las siete reglas de servidor de
   * la 0211 ya están cubiertas en
   * `contraentrega-delivery-history.integration.test.ts` (GPS dentro, GPS fuera,
   * baja precisión, strikes que ganan al GPS, historial que lo hace irrelevante).
   * Lo que ningún test miraba es la otra mitad: que la PANTALLA dejó de bloquear.
   * Eso es lo de aquí, y por eso no vuelve a confirmar el pedido — el estado
   * resultante ya lo afirma el test de arriba para el vecino, y la integración
   * para el desconocido.
   */
  test('al cliente sin historial pero con GPS del pueblo la pantalla ya no le fuerza el prepago', async ({
    page,
  }) => {
    await login(page, DESCONOCIDO.email)
    await llegarAlCheckout(page)

    // Ningún motivo de prepago: ni el del primer pedido —que la 0211 quitó— ni
    // los otros dos que sí siguen vivos (bloqueo por riesgo, tope de efectivo),
    // que aquí no aplican.
    await expect(page.getByText(RE_MOTIVO_PREPAGO)).toHaveCount(0)

    // Y las tres formas de pagar se pueden accionar. Es el control que importa:
    // «no está el aviso» también daría verde si el bloque de pago entero dejara
    // de renderizarse; «los tres radios están y responden» solo da verde si la
    // pantalla llegó de verdad a ofrecer la elección.
    await expect(page.getByRole('radio', { name: PAGO.efectivo })).toBeEnabled()
    await expect(page.getByRole('radio', { name: PAGO.yapeAlRecibir })).toBeEnabled()
    await expect(page.getByRole('radio', { name: PAGO.prepago })).toBeEnabled()
  })
})
