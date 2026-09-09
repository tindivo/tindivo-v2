import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * El eje de «Facturación por día» en /rendimiento.
 *
 * POR QUÉ ESTE SPEC EXISTE. La pantalla entera no tenía ni una prueba de
 * navegador, y el fallo que la trajo aquí solo se ve pintada: con el rango sin
 * una sola venta, `niceMax(0)` devuelve 1 —su tope de seguridad para no dividir
 * entre cero— y las marcas 0 / 0.5 / 1 se rotulaban «0 · S/ 1 · S/ 1». Dos
 * etiquetas idénticas bajo una línea plana pegada al suelo: no un gráfico
 * vacío, sino un gráfico MINTIENDO sobre su escala. Y le tocaba justo a quien
 * no vendió nada, que es la pantalla que más cuidado merece.
 *
 * Ni el type-check ni los tests de `packages/core` lo ven: `niceMax` hace lo
 * correcto y la mentira nace un piso más arriba, al rotular. Por eso la
 * comprobación tiene que ser sobre el DOM.
 *
 * EL RANGO ES FIJO Y ESTÁ EN EL PASADO a propósito. Los fixtures e2e acumulan
 * historial permanente —`delivered` es terminal y nadie lo limpia—, así que
 * cualquier ventana reciente depende de lo que hayan sembrado los demás specs
 * y este rojo aparecería o no según el orden de ejecución. En marzo de 2025 no
 * hay nada de nadie, y `business_performance_metrics` rellena el rango entero
 * con ceros (`dias left join agg`), así que la serie tiene sus 7 puntos y entra
 * por la rama del tope cero, no por la de «menos de tres jornadas».
 */

const BIZ = E2E.BUSINESS_ID
/** Siete días de un marzo que nadie tocó. Siete y no dos: con menos de tres
 *  jornadas el componente enseña la tabla y no llegaríamos al eje. */
const DESDE = '2025-03-03'
const HASTA = '2025-03-09'
/** Una noche dentro del rango. 20:00 de Lima para que `current_service_date`
 *  la cuente en su propio día y no en el anterior. */
const NOCHE = '2025-03-05T20:00:00-05:00'

const pedidosSembrados: string[] = []

/**
 * Una noche vendida dentro del rango.
 *
 * En dos pasos y no en uno: el `created_at` se siembra DESPUÉS porque un
 * trigger lo pisa con `now()` al insertar, y un `UPDATE ... FROM` en la misma
 * sentencia que el `INSERT` no ve su propia fila (el snapshot del comando no la
 * incluye) — se queda en la noche de hoy y el rango sale vacío igual, que es el
 * peor final posible: el test pasaría por la razón equivocada.
 */
async function sembrarNocheVendida(monto: number): Promise<string> {
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: BIZ,
      source: 'business_manual',
      delivery_method: 'delivery',
      payment_intent: 'pending_cash',
      customer_name: 'Vecina del eje',
      customer_phone: '955500111',
      order_amount: monto,
      delivery_fee: 4,
      status: 'delivered',
    })
    .select('id')
    .single()
  if (error) throw new Error(`no se pudo sembrar la noche: ${error.message}`)

  const { error: errFecha } = await db
    .from('orders')
    .update({ created_at: NOCHE })
    .eq('id', data.id)
  if (errFecha) throw new Error(`no se pudo fechar la noche: ${errFecha.message}`)

  pedidosSembrados.push(data.id)
  return data.id
}

/** `true` si esa URL es la petición de métricas de NUESTRO rango. */
function esElRangoDelSpec(url: string): boolean {
  return (
    url.includes('/reports/rendimiento?') &&
    url.includes(`start=${DESDE}`) &&
    url.includes(`end=${HASTA}`)
  )
}

/**
 * Abre /rendimiento y fija el rango a mano, que es la única vía: la pantalla no
 * lee el rango de la URL, lo guarda en su propio estado.
 *
 * SE ESPERA A LA RESPUESTA, NO A UN TÍTULO. Antes esperaba a que el <h3>
 * «Facturación por día» fuera visible, con el comentario de que eso marcaba que
 * el rango nuevo ya estaba pintado. No lo marcaba: ese título se pinta IGUAL en
 * la rama de «ningún día con ventas» (`trend-chart.tsx`, tope cero) que en la
 * del gráfico, y el rango por defecto de esta pantalla también sale vacío. O
 * sea que la espera se cumplía con el DOM del rango viejo y no esperaba nada.
 *
 * Es lo que dejó pasar la carrera de `usePerformance` durante todo este tiempo,
 * y de paso lo que hacía que el test de «sin una sola venta» pasara por la
 * razón equivocada: habría pasado igual si el rango no se aplicara nunca.
 *
 * La promesa se arma ANTES de escribir las fechas: si se arma después, la
 * respuesta puede haber llegado ya y se espera para siempre.
 */
async function abrirRendimiento(page: Page): Promise<void> {
  await page.goto('/rendimiento')
  await expect(page.getByRole('heading', { name: 'Rendimiento y Retorno' })).toBeVisible({
    timeout: 20_000,
  })
  const respuestaDelRango = page.waitForResponse((r) => esElRangoDelSpec(r.url()), {
    timeout: 20_000,
  })
  await page.locator('#history-start-date').fill(DESDE)
  await page.locator('#history-end-date').fill(HASTA)
  await respuestaDelRango
}

/** Las etiquetas del eje Y, tal como salen en el SVG. */
async function etiquetasDelEje(page: Page): Promise<string[]> {
  return page.locator('svg[role="img"] text').filter({ hasText: /^S\// }).allTextContents()
}

test.describe('rendimiento · el eje no finge una escala que no existe', () => {
  test.afterEach(async () => {
    for (const id of pedidosSembrados.splice(0)) {
      await db.from('business_charges').delete().eq('order_id', id)
      await db.from('domain_events').delete().eq('aggregate_id', id)
      await db.from('order_event_log').delete().eq('order_id', id)
      await db.from('customer_order_items').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
  })

  test('sin una sola venta lo dice, en vez de rotular «S/ 1» dos veces', async ({ page }) => {
    await abrirRendimiento(page)

    await expect(page.getByText('Ningún día con ventas en este rango.')).toBeVisible()
    // La firma exacta del fallo: la escala inventada por el tope de seguridad.
    await expect(page.getByText('S/ 1', { exact: true })).toHaveCount(0)
    // Y no queda un gráfico plano debajo del mensaje.
    await expect(page.locator('svg[role="img"][aria-label^="Facturación por día"]')).toHaveCount(0)
  })

  /**
   * LA RESPUESTA VIEJA NO PISA A LA BUENA.
   *
   * Cambiar el rango dispara varias peticiones —el selector son dos inputs de
   * fecha, así que escribir «del 3 al 9 de marzo» manda antes «del 3 de marzo
   * al fin viejo»— y `usePerformance` escribía con la que llegara. Ganaba la
   * última en RESPONDER, no la última en pedirse, y la intermedia suele ser más
   * pesada que la buena, así que llegaba después.
   *
   * En pantalla eso no se ve como un error: la cabecera, la etiqueta del rango
   * y los dos inputs dicen el rango pedido, y los números son de otra ventana.
   *
   * EL RETRASO ES DEL TEST, NO DEL AZAR. Reproducirlo esperando a que la
   * carrera salga mal daría un test que pasa casi siempre y no protege nada, y
   * peor: pasaría también con el fallo dentro. Aquí se retiene la respuesta de
   * CUALQUIER rango que no sea el pedido hasta que la buena ya ha llegado, así
   * que la vieja es SIEMPRE la última en entrar. Con la guarda se descarta; sin
   * ella, pisa el gráfico y deja «Ningún día con ventas» sobre una noche de
   * S/ 300 que sí está en la base.
   */
  test('una respuesta de otro rango que llega tarde no pisa a la del rango pedido', async ({
    page,
  }) => {
    await sembrarNocheVendida(300)

    await page.route(/\/reports\/rendimiento\?/, async (route) => {
      const esElBueno = esElRangoDelSpec(route.request().url())
      const respuesta = await route.fetch()
      if (!esElBueno) await new Promise((listo) => setTimeout(listo, 3000))
      await route.fulfill({ response: respuesta })
    })

    await abrirRendimiento(page)

    // La buena ya entró. Se le da a la vieja tiempo de sobra para llegar y
    // hacer daño: sin la guarda, aquí es cuando lo hace.
    await page.waitForTimeout(4000)

    // SE AFIRMA SOBRE EL RANGO DEL GRÁFICO, NO SOBRE QUE HAYA GRÁFICO.
    //
    // La primera versión de este test comprobaba solo que el <svg> estuviera, y
    // pasaba con el fallo dentro: la petición intermedia va del 3 de marzo al
    // fin viejo, o sea que CONTIENE la noche sembrada y también pinta un
    // gráfico. Uno correcto para un rango que nadie pidió, que es exactamente
    // la forma que tiene este fallo de no verse.
    //
    // El `aria-label` del SVG lleva el primer y el último día de la serie, así
    // que distingue las tres respuestas en juego: la buena (03/03–09/03), la
    // intermedia (03/03–08/09) y la de por defecto (vacía, sin SVG).
    const primerDia = `${DESDE.slice(8, 10)}/${DESDE.slice(5, 7)}`
    const ultimoDia = `${HASTA.slice(8, 10)}/${HASTA.slice(5, 7)}`
    await expect(page.getByText('Ningún día con ventas en este rango.')).toHaveCount(0)
    await expect(
      page.getByRole('img', {
        name: `Facturación por día entre el ${primerDia} y el ${ultimoDia}`,
      }),
    ).toBeVisible()
  })

  test('con una noche vendida vuelve el gráfico, y sin etiquetas repetidas', async ({ page }) => {
    await sembrarNocheVendida(300)

    await abrirRendimiento(page)

    await expect(page.getByText('Ningún día con ventas en este rango.')).toHaveCount(0)
    await expect(page.locator('svg[role="img"][aria-label^="Facturación por día"]')).toBeVisible()

    // El invariante que el fallo rompía, dicho como invariante y no como
    // números concretos: dos marcas distintas del eje no pueden leerse igual.
    // Comprobarlo aquí —y no solo en el caso vacío— es lo que impide que la
    // corrección se convierta en «no pintar nunca el gráfico».
    const etiquetas = await etiquetasDelEje(page)
    expect(etiquetas.length).toBeGreaterThan(0)
    expect(new Set(etiquetas).size).toBe(etiquetas.length)
  })
})
