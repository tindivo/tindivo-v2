import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * El recojo visto desde el mostrador. (Migraciones 0219 y 0220)
 *
 * POR QUÉ ESTE SPEC EXISTE, teniendo ya `pickup.integration.test.ts` (las
 * reglas) y `recojo-en-el-local.spec.ts` (la pantalla del cliente).
 *
 * Falta el lado de la cajera, y ahí es donde el canal se sostiene o se cae. Un
 * recojo «ahora» se salta el guard de contraentrega y la llamada de validación
 * a cambio de UNA cosa: que ella verifique con los ojos que tiene delante a
 * quien pidió, antes de aceptar. Esa contrapartida no vive en ninguna función:
 * vive en lo que la tarjeta dice y en lo que el botón le pide. Si la tarjeta se
 * ve igual que un delivery, la verificación no ocurre en ninguna parte y lo que
 * queda es un canal sin freno.
 *
 * Y el otro extremo: un recojo que llega a `ready_for_pickup` no lo cierra
 * nadie más que ella. Sin los dos botones del mostrador, la bolsa se queda en
 * ese estado para siempre — y con ella el guard de pedido activo, que impide a
 * ese cliente volver a pedir en este restaurante.
 */

const BIZ = E2E.BUSINESS_ID
const pedidosSembrados: string[] = []

/** Un teléfono de 9 dígitos que no choca con los del seed. */
function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

/**
 * Un recojo web ya en el estado que interesa.
 *
 * Se siembra por SQL y no por la app del cliente a propósito: lo que este spec
 * prueba es la pantalla de la cajera, y hacerla depender del checkout del
 * cliente convertiría cualquier fallo de allí en un rojo que apunta aquí.
 */
async function sembrarRecojo(
  status: 'pending_acceptance' | 'ready_for_pickup',
  timing: 'now' | 'later',
): Promise<{ id: string; shortId: string }> {
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: BIZ,
      source: 'customer_pwa',
      // `customer_user_id` NULL: la fila no necesita cuenta para pintarse, y sin
      // ella no toca el historial de ningún cliente del seed.
      delivery_method: 'pickup',
      pickup_timing: timing,
      payment_intent: 'pending_cash',
      customer_name: timing === 'now' ? 'Vecino en el mostrador' : 'Vecino que pasa luego',
      customer_phone: telefonoNuevo(),
      order_amount: 24,
      delivery_fee: 0,
      status,
      prep_time_minutes: status === 'ready_for_pickup' ? 20 : null,
      // La espera del mostrador ya vencida: el botón de plantón exige un suelo
      // (`noShowWaitMinutes`) y sin esto el caso probaría el suelo, no el botón.
      ready_for_pickup_at:
        status === 'ready_for_pickup' ? new Date(Date.now() - 60 * 60_000).toISOString() : null,
    })
    .select('id, short_id')
    .single()
  if (error) throw new Error(`no se pudo sembrar el recojo: ${error.message}`)
  pedidosSembrados.push(data.id)
  return { id: data.id, shortId: data.short_id }
}

/**
 * El texto tal como lo VE la cajera.
 *
 * `.filter({ visible: true })` no es cosmético: el tablero monta las DOS vistas
 * —`PedidosMobile` y `PedidosDesktop`— y esconde una por CSS, así que cada
 * pedido aparece dos veces en el DOM y `.first()` cae en la copia oculta. El
 * síntoma es un `toBeVisible` que falla enseñando el elemento que buscaba.
 */
function visible(page: Page, texto: string | RegExp) {
  return page.getByText(texto).filter({ visible: true })
}

/** Abre el tablero y espera a que la tarjeta del pedido esté pintada. */
async function abrirTablero(page: Page, shortId: string): Promise<void> {
  await page.goto('/')
  await expect(visible(page, `#${shortId}`).first()).toBeVisible({ timeout: 20_000 })
}

test.describe('0219/0220 · el recojo en el tablero de la cajera', () => {
  test.afterEach(async () => {
    for (const id of pedidosSembrados.splice(0)) {
      await db.from('domain_events').delete().eq('aggregate_id', id)
      await db.from('order_event_log').delete().eq('order_id', id)
      await db.from('customer_order_items').delete().eq('order_id', id)
      await db.from('business_charges').delete().eq('order_id', id)
      await db.from('customer_strikes').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
  })

  /**
   * LA CONTRAPARTIDA DEL CANAL, DICHA EN LA TARJETA.
   *
   * «Recojo · cliente presente» es el único aviso del tablero que habla de
   * alguien que está físicamente ahí. Va en sólido y no en el gris de las demás
   * insignias de cejilla por la misma razón por la que «Online» dejó de ser
   * pastel: si el único marcador de algo que cambia lo que hay que hacer se
   * lee como decoración, no se lee.
   */
  test('un recojo «ahora» se distingue de un delivery en la propia tarjeta', async ({ page }) => {
    const recojo = await sembrarRecojo('pending_acceptance', 'now')

    await abrirTablero(page, recojo.shortId)

    await expect(visible(page, 'Recojo · cliente presente').first()).toBeVisible()
    // Y el estado del mostrador, que es lo que le dice a quién se espera.
    await expect(visible(page, 'Recojo en local').first()).toBeVisible()
  })

  test('un recojo «más tarde» NO dice que haya nadie delante', async ({ page }) => {
    const recojo = await sembrarRecojo('pending_acceptance', 'later')

    await abrirTablero(page, recojo.shortId)

    await expect(visible(page, 'Recojo en local').first()).toBeVisible()
    await expect(page.getByText('Recojo · cliente presente')).toHaveCount(0)
  })

  /**
   * EL BOTÓN PIDE LA VERIFICACIÓN, no solo la aceptación. «Aceptar pedido» a
   * secas dejaría la única garantía del canal sin pedirse en ninguna parte.
   */
  test('aceptar un recojo «ahora» le pide mirar al cliente', async ({ page }) => {
    const recojo = await sembrarRecojo('pending_acceptance', 'now')
    await abrirTablero(page, recojo.shortId)

    await visible(page, `#${recojo.shortId}`).first().click()

    await expect(page.getByRole('button', { name: 'Cliente presente · a cocina' })).toBeVisible()
    await expect(visible(page, /Míralo antes de aceptar/).first()).toBeVisible()
  })

  /**
   * LAS DOS ÚNICAS SALIDAS DE UN RECOJO. Sin ellas la bolsa se queda en
   * `ready_for_pickup` para siempre: `deliver` y `no_show` los escribe el
   * motorizado, y aquí no hay ninguno.
   */
  test('la bolsa en el mostrador ofrece entregarla o declarar el plantón', async ({ page }) => {
    const recojo = await sembrarRecojo('ready_for_pickup', 'now')
    await abrirTablero(page, recojo.shortId)

    await visible(page, `#${recojo.shortId}`).first().click()

    await expect(visible(page, 'Se lo llevó · ¿cómo pagó?').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Efectivo/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'El cliente no vino' })).toBeVisible()
  })

  /**
   * EL AVISO QUE NO DEPENDE DE UN PERMISO. (0221)
   *
   * El push del recojo listo solo alcanza a quien concedió las notificaciones y
   * conserva una suscripción viva: en el piloto, una minoría. WhatsApp no
   * depende de nada de eso — el cliente ya verificó ese número por OTP para
   * poder pedir.
   *
   * Se afirma sobre el `href`, que es el mensaje entero: si alguien lo cambia
   * por descuido, el rojo dice exactamente qué le iba a llegar al cliente.
   */
  test('el aviso de WhatsApp lleva el chat del cliente y el mensaje escrito', async ({ page }) => {
    const recojo = await sembrarRecojo('ready_for_pickup', 'now')
    await abrirTablero(page, recojo.shortId)
    await visible(page, `#${recojo.shortId}`).first().click()

    const boton = page.getByRole('button', { name: /Avisar por WhatsApp/ })
    await expect(boton).toBeVisible()

    // `window.open` a `wa.me` abre una pestaña que no lleva a ninguna parte en
    // e2e: se intercepta para leer la URL sin salir del navegador.
    const url = await page.evaluate(() => {
      let capturada = ''
      // biome-ignore lint/suspicious/noExplicitAny: se pisa `open` a propósito
      ;(window as any).open = (u: string) => {
        capturada = u
        return null
      }
      // biome-ignore lint/suspicious/noExplicitAny: puente para leerla después
      ;(window as any).__waUrl = () => capturada
      return ''
    })
    expect(url).toBe('')

    await boton.click()
    // biome-ignore lint/suspicious/noExplicitAny: el puente de arriba
    const abierta = await page.evaluate(() => (window as any).__waUrl())

    expect(abierta, 'tiene que abrir el chat del CLIENTE, no el de soporte').toContain('wa.me/51')
    const texto = decodeURIComponent(new URL(abierta).searchParams.get('text') ?? '')
    expect(texto, 'se presenta antes de pedir nada').toContain('soy La Florencia E2E')
    expect(texto, 'lleva el código para emparejarlo en el mostrador').toContain(
      `#${recojo.shortId}`,
    )
    expect(texto).toContain('ya está listo')
    // Contraentrega: dice cuánto trae. (En prepago no lo diría — ver los tests
    // de `pickupReadyMessage`.)
    expect(texto).toContain('S/ 24.00')

    // Y el panel se queda sabiendo que ya avisó, para no repetirlo a ciegas.
    await expect(page.getByRole('button', { name: /avisado \d{2}:\d{2}/ })).toBeVisible({
      timeout: 15_000,
    })
    const { data } = await db
      .from('orders')
      .select('tracking_link_sent_at')
      .eq('id', recojo.id)
      .single()
    expect(data?.tracking_link_sent_at).not.toBeNull()
  })

  /**
   * ENTREGAR EN EL MOSTRADOR CIERRA EL PEDIDO Y LO COBRA. Es la aserción que
   * cuida el dinero: antes de la 0220 un recojo entregado pasaba por
   * `generate_delivery_charges` con `commission_amount` NULL y no generaba
   * ningún cargo — el canal salía gratis para el negocio.
   */
  test('«se lo llevó» deja el pedido entregado y con su comisión', async ({ page }) => {
    const recojo = await sembrarRecojo('ready_for_pickup', 'now')
    await abrirTablero(page, recojo.shortId)

    await visible(page, `#${recojo.shortId}`).first().click()
    await page.getByRole('button', { name: /Efectivo/ }).click()

    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('orders')
            .select('status, commission_amount, payment_real')
            .eq('id', recojo.id)
            .single()
          return data
        },
        { timeout: 20_000, message: 'el pedido no llegó a `delivered`' },
      )
      .toMatchObject({ status: 'delivered', payment_real: 'paid_cash' })

    const { data: cargos } = await db
      .from('business_charges')
      .select('charge_type, amount')
      .eq('order_id', recojo.id)
    expect(cargos, 'un recojo entregado tiene que generar su comisión').toHaveLength(1)
    expect(cargos?.[0]?.charge_type).toBe('commission')
    expect(Number(cargos?.[0]?.amount)).toBeGreaterThan(0)
  })

  /**
   * EL PLANTÓN PIDE CONFIRMACIÓN, y no es fricción de adorno: cancela comida ya
   * hecha Y le deja un strike al cliente. Dos strikes son prepago obligado de
   * por vida (DECISIONS §8), así que no puede ser un botón que se pulse por
   * descarte.
   */
  test('declarar el plantón pide confirmar, y avisa de lo que cuesta', async ({ page }) => {
    const recojo = await sembrarRecojo('ready_for_pickup', 'now')
    await abrirTablero(page, recojo.shortId)

    await visible(page, `#${recojo.shortId}`).first().click()
    await page.getByRole('button', { name: 'El cliente no vino' }).click()

    await expect(visible(page, /queda una falta en su cuenta/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sí, no vino' })).toBeVisible()

    await page.getByRole('button', { name: 'Sí, no vino' }).click()

    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('orders')
            .select('status, cancel_reason')
            .eq('id', recojo.id)
            .single()
          return data
        },
        { timeout: 20_000, message: 'el pedido no llegó a `cancelled`' },
      )
      .toMatchObject({ status: 'cancelled', cancel_reason: 'no_show' })

    const { data: strikes } = await db
      .from('customer_strikes')
      .select('phone, delivery_reference')
      .eq('order_id', recojo.id)
    expect(strikes, 'el plantón del mostrador tiene que dejar strike').toHaveLength(1)
    // En un recojo no hay domicilio del cliente que anclar. Ver 0220.
    expect(strikes?.[0]?.delivery_reference).toBeNull()
  })
})
