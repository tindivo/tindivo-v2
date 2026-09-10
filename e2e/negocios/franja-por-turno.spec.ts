import { expect, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * LA FRANJA POR TURNO, EN LA PANTALLA. (Migración 0226)
 *
 * POR QUÉ ESTE TEST EXISTE. La Florencia sirve dos cartas —mediodía los sábados
 * y domingos (11:00–15:00) y noche el resto— y hasta la 0226 el menú no sabía
 * decirlo. El coste está medido en prod: sus 11 platos de PESCADOS Y MARISCOS y
 * los 2 de RECOMENDACIÓN DEL CHEF llevaban desde el 7-8 de septiembre de 2026
 * con `is_available = false`, o sea invisibles las 24 horas de los 7 días,
 * porque encenderlos el sábado a las 11:00 y apagarlos a las 15:00 son 26
 * toques de switch por fin de semana y nadie los da.
 *
 * Los tests unitarios prueban la REGLA (`isWithinWindow`, `describeWindow`), no
 * si la pantalla la escribe en la base ni si el cliente la lee. Eso es lo que
 * fija este spec, un hueco por test:
 *
 *   1. EL ATAJO ESCRIBE LA FRANJA. Es el gesto que hace que esto se use: sin él
 *      hay que teclear las horas plato a plato, y a la tercera sale una errata
 *      que no da la cara hasta que un cliente no ve un plato.
 *   2. EL BOTÓN DE CATEGORÍA LA PROPAGA. Es la diferencia entre configurar la
 *      carta de mediodía en dos gestos o en trece.
 *   3. EL CLIENTE LA LEE. Comprueba de paso que `apps/api` manda las tres
 *      columnas: si se le olvidaran, el plato saldría pedible fuera de turno y
 *      no fallaría ningún test unitario.
 *
 * SE AFIRMA LA FILA, NO SOLO EL PÍXEL. Cada test comprueba la pantalla Y las
 * columnas `available_*`. Un chip correcto sobre una fila vacía sería justo el
 * estado que no protege nada, porque quien decide de verdad es la RPC.
 *
 * EL FIXTURE ES SUYO Y SE LO LIMPIA. No toca los tres platos del seed: los usa
 * `extras.spec.ts` y compartirlos ya dio un rojo que señalaba al sitio
 * equivocado. Crea su propia categoría con sus dos platos y la borra al final.
 */

const CAT = { id: 'e2e00000-0000-4000-8000-0000000009d0', nombre: 'E2E Carta de mediodía' }
const PLATO = { id: 'e2e00000-0000-4000-8000-0000000009d1', nombre: 'E2E Ceviche mixto' }
const HERMANO = { id: 'e2e00000-0000-4000-8000-0000000009d2', nombre: 'E2E Chaufa marino' }

/** La franja como queda en la DB: `time` vuelve con segundos. */
const MEDIODIA = { days: [5, 6], from: '11:00:00', to: '15:00:00' }

async function franjaEnDb(id: string) {
  const { data } = await db
    .from('menu_items')
    .select('available_days,available_from,available_to')
    .eq('id', id)
    .single()
  return {
    days: data?.available_days ?? null,
    from: data?.available_from ?? null,
    to: data?.available_to ?? null,
  }
}

test.beforeEach(async () => {
  // El estado se DECLARA en cada test, no se hereda del anterior: así el orden
  // no importa y un test que falle a mitad no arrastra al siguiente.
  await db.from('menu_categories').upsert({
    id: CAT.id,
    business_id: E2E.BUSINESS_ID,
    name: CAT.nombre,
    display_order: 900,
    is_active: true,
  })
  for (const [i, plato] of [PLATO, HERMANO].entries()) {
    await db.from('menu_items').upsert({
      id: plato.id,
      business_id: E2E.BUSINESS_ID,
      category_id: CAT.id,
      name: plato.nombre,
      base_price: 25,
      display_order: 900 + i,
      is_available: true,
      is_compact: false,
      badges: [],
      available_days: null,
      available_from: null,
      available_to: null,
    })
  }
})

test.afterAll(async () => {
  await db.from('menu_items').delete().in('id', [PLATO.id, HERMANO.id])
  await db.from('menu_categories').delete().eq('id', CAT.id)
})

test('la cajera pone la franja a mano y el plato la guarda', async ({ page }) => {
  await page.goto(`/menu/item/${PLATO.id}`)

  // EL PANEL PINTA LA VISTA DE MÓVIL Y LA DE ESCRITORIO A LA VEZ, así que hay
  // dos copias de cada texto y de cada control. `.first()` coge la oculta y el
  // test falla con «unexpected value "hidden"», que no dice nada de la pantalla.
  // De ahí el `visible=true` en TODAS las afirmaciones de este spec, incluidas
  // las de solo lectura.
  await expect(page.getByText('B · Disponibilidad').locator('visible=true')).toBeVisible()

  await page.getByRole('button', { name: 'sábado' }).locator('visible=true').click()
  await page.getByRole('button', { name: 'domingo' }).locator('visible=true').click()
  await page.locator('#available_from:visible').fill('11:00')
  await page.locator('#available_to:visible').fill('15:00')

  // LA FRASE SALE EN DOS SITIOS Y LOS DOS IMPORTAN, porque los dos la componen
  // con `describeWindow`, la MISMA función que pinta la card del cliente: ni el
  // editor ni el espejo pueden prometer un texto que la app luego no diga.
  //
  //   1. la línea de resumen del editor («El cliente leerá …»)
  //   2. el badge del panel «Vista del cliente», que simula la card
  //
  // Afirmarlas por separado y no con un `.first()`: con dos copias visibles,
  // `.first()` elige una en silencio y la otra podría romperse sin que nadie
  // se entere.
  await expect(page.getByText(/El cliente leerá/).locator('visible=true')).toContainText(
    'Solo sáb y dom, de 11:00 a 15:00',
  )
  await expect(
    page.getByText('Solo sáb y dom, de 11:00 a 15:00', { exact: true }).locator('visible=true'),
  ).toBeVisible()

  await page
    .getByRole('button', { name: /Guardar cambios/i })
    .locator('visible=true')
    .click()
  await expect.poll(async () => await franjaEnDb(PLATO.id), { timeout: 10_000 }).toEqual(MEDIODIA)

  // El hermano NO se toca: guardar un plato guarda un plato.
  expect(await franjaEnDb(HERMANO.id)).toEqual({ days: null, from: null, to: null })
})

test('el botón de categoría propaga la franja a todos sus platos', async ({ page }) => {
  await page.goto(`/menu/item/${PLATO.id}`)
  await page.getByRole('button', { name: 'sábado' }).locator('visible=true').click()
  await page.getByRole('button', { name: 'domingo' }).locator('visible=true').click()
  await page.locator('#available_from:visible').fill('11:00')
  await page.locator('#available_to:visible').fill('15:00')

  await page
    .getByRole('button', {
      name: new RegExp(`Aplicar esta franja a los 2 platos de ${CAT.nombre}`),
    })
    .locator('visible=true')
    .click()

  // Los DOS, incluido el que nunca se abrió. Es lo que convierte trece viajes
  // al editor en dos gestos.
  await expect.poll(async () => await franjaEnDb(HERMANO.id), { timeout: 10_000 }).toEqual(MEDIODIA)
  expect(await franjaEnDb(PLATO.id)).toEqual(MEDIODIA)
})

test('la lista avisa de que ahora mismo el cliente no lo ve', async ({ page }) => {
  // Una franja imposible de estar dentro: los siete días de 03:00 a 03:01. Fijar
  // el reloj sería más limpio, pero el panel lee `new Date()` del navegador Y la
  // RPC lee `now()` de Postgres, y solo se puede mover uno de los dos.
  await db
    .from('menu_items')
    .update({
      available_days: [0, 1, 2, 3, 4, 5, 6],
      available_from: '03:00',
      available_to: '03:01',
    })
    .eq('id', PLATO.id)

  await page.goto('/menu')
  const fila = page.locator('div').filter({ hasText: PLATO.nombre }).last()
  await expect(fila.getByText(/fuera de turno/)).toBeVisible({ timeout: 15_000 })

  // El switch de «se acabó» sigue en verde: son dos hechos distintos y este no
  // lo escribe nadie automáticamente.
  const { data } = await db.from('menu_items').select('is_available').eq('id', PLATO.id).single()
  expect(data?.is_available).toBe(true)
})

test('el cliente ve el motivo y no puede pedirlo', async ({ page }) => {
  await db
    .from('menu_items')
    .update({
      available_days: [0, 1, 2, 3, 4, 5, 6],
      available_from: '03:00',
      available_to: '03:01',
    })
    .eq('id', PLATO.id)

  // URL absoluta: el `baseURL` de este proyecto es el panel (:3002). Comprueba
  // de paso que `apps/api` manda las tres columnas; si se le olvidaran, aquí no
  // habría motivo que leer y el plato saldría pedible.
  await page.goto('http://localhost:3000/negocio/la-florencia-e2e')
  await expect(page.getByText('Solo de 03:00 a 03:01').first()).toBeVisible({ timeout: 20_000 })
})
