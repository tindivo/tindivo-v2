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

/** Abre /rendimiento y fija el rango a mano, que es la única vía: la pantalla
 *  no lee el rango de la URL, lo guarda en su propio estado. */
async function abrirRendimiento(page: Page): Promise<void> {
  await page.goto('/rendimiento')
  await expect(page.getByRole('heading', { name: 'Rendimiento y Retorno' })).toBeVisible({
    timeout: 20_000,
  })
  await page.locator('#history-start-date').fill(DESDE)
  await page.locator('#history-end-date').fill(HASTA)
  // El título del gráfico marca que la respuesta del rango nuevo ya está
  // pintada; sin esperarlo se lee el DOM del rango por defecto.
  //
  // Por ROL y no por texto: cuando hay gráfico, «Facturación por día» está dos
  // veces —el <h3> y el <title> del SVG, que es lo que leen los lectores de
  // pantalla— y `getByText` casa con las dos. El rojo entonces es un «strict
  // mode violation» que parece un fallo de la pantalla y no lo es.
  await expect(page.getByRole('heading', { name: 'Facturación por día' })).toBeVisible({
    timeout: 20_000,
  })
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
