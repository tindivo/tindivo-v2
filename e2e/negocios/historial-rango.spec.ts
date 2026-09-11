import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * EL HISTORIAL ENSEÑA LOS PEDIDOS DEL RANGO QUE SE PIDIÓ.
 *
 * `useHistory` escribía con la respuesta que llegara, viniera del rango que
 * viniera, y cambiar el rango manda dos peticiones: el selector son dos inputs
 * de fecha, así que elegir «del 3 al 9 de marzo» pide antes «del 3 de marzo al
 * fin viejo». Esa intermedia trae muchas más filas, tarda más y llega después.
 *
 * Aquí no es un número torcido en un informe: es la pantalla donde la cajera
 * BUSCA UN PEDIDO por fecha, y desde la lista abre el detalle. Con la carrera
 * perdida ve otra ventana bajo la cabecera del rango que pidió, sin nada que se
 * lo diga.
 *
 * EL RANGO ESTÁ EN UN MARZO QUE NADIE TOCÓ, por lo mismo que en
 * `rendimiento-eje`: los fixtures e2e acumulan historial permanente
 * (`delivered` es terminal y nadie lo limpia), así que cualquier ventana
 * reciente depende de lo que hayan sembrado los demás specs.
 */

const DESDE = '2025-03-03'
const HASTA = '2025-03-09'
const VIEJO = '2025-03-05T20:00:00-05:00'

const pedidosSembrados: string[] = []

/**
 * Solo lo que se VE.
 *
 * La lista se pinta dos veces —la fila ancha y la compacta, una oculta por CSS
 * según el viewport— así que un `getByText(...).first()` a secas resuelve a la
 * copia escondida y falla con «Received: hidden» aunque la pantalla esté bien.
 * Mismo helper y mismo motivo que en `recojo-tablero`.
 */
function visible(page: Page, texto: string | RegExp) {
  return page.getByText(texto).filter({ visible: true })
}

/** Un pedido entregado, fechado donde se le diga. Devuelve su nombre, que es
 *  lo que la lista pinta y por lo que se le busca. */
async function sembrarEntregado(nombre: string, cuando: string | null): Promise<string> {
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: E2E.BUSINESS_ID,
      source: 'business_manual',
      delivery_method: 'delivery',
      payment_intent: 'pending_cash',
      customer_name: nombre,
      customer_phone: '955500444',
      order_amount: 42,
      delivery_fee: 4,
      status: 'delivered',
    })
    .select('id')
    .single()
  if (error) throw new Error(`no se pudo sembrar ${nombre}: ${error.message}`)
  // En dos pasos: un trigger pisa `created_at` con now() al insertar.
  if (cuando) {
    const { error: e2 } = await db.from('orders').update({ created_at: cuando }).eq('id', data.id)
    if (e2) throw new Error(`no se pudo fechar ${nombre}: ${e2.message}`)
  }
  pedidosSembrados.push(data.id)
  return nombre
}

test.describe('historial · el rango que se pide es el que se lista', () => {
  test.afterEach(async () => {
    for (const id of pedidosSembrados.splice(0)) {
      await db.from('domain_events').delete().eq('aggregate_id', id)
      await db.from('order_event_log').delete().eq('order_id', id)
      await db.from('customer_order_items').delete().eq('order_id', id)
      await db.from('business_charges').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
  })

  /**
   * DOS PEDIDOS, Y HACEN FALTA LOS DOS.
   *
   * Con uno solo el test pasaría con el fallo dentro: la petición intermedia va
   * del 3 de marzo a HOY, o sea que CONTIENE el pedido viejo y también lo
   * pintaría. Una lista correcta para un rango que nadie pidió, que es justo la
   * forma que tiene este fallo de no verse.
   *
   * El de hoy es el que separa las tres respuestas en juego: sale en la
   * intermedia y en la de por defecto («hoy»), y NO tiene que salir en la buena.
   *
   * EL RETRASO ES DEL TEST, NO DEL AZAR. Se retiene la respuesta de cualquier
   * rango que no sea el pedido hasta que la buena ya entró, así que la vieja es
   * SIEMPRE la última. Esperar a que la carrera salga mal daría un test que
   * pasa casi siempre y no protege de nada.
   */
  test('una respuesta de otro rango que llega tarde no pisa a la del rango pedido', async ({
    page,
  }) => {
    const viejo = await sembrarEntregado('Vecina de marzo', VIEJO)
    const dehoy = await sembrarEntregado('Vecina de hoy', null)

    await page.route(
      (url) => url.pathname.endsWith('/rest/v1/orders'),
      async (route) => {
        const esElBueno = route.request().url().includes(`gte.${DESDE}`)
        const respuesta = await route.fetch()
        if (!esElBueno) await new Promise((listo) => setTimeout(listo, 3000))
        await route.fulfill({ response: respuesta })
      },
    )

    await page.goto('/historial')
    await expect(page.getByRole('heading', { name: /Historial/i }).first()).toBeVisible({
      timeout: 20_000,
    })

    // La promesa se arma ANTES de escribir: si se arma después, la respuesta
    // puede haber llegado ya y se espera para siempre.
    const respuestaDelRango = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/orders') && r.url().includes(`gte.${DESDE}`),
      { timeout: 25_000 },
    )
    await page.locator('#history-start-date').fill(DESDE)
    await page.locator('#history-end-date').fill(HASTA)
    await respuestaDelRango

    // La buena ya entró. Se le da a la vieja tiempo de sobra para llegar y
    // hacer daño: sin la guarda, aquí es cuando lo hace.
    await page.waitForTimeout(4000)

    await expect(visible(page, viejo).first()).toBeVisible()
    await expect(visible(page, dehoy)).toHaveCount(0)
  })
})
