import { expect, type Locator, type Page, test } from '@playwright/test'
import { localClient } from '../../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts se genera contra el remoto
const db = localClient as any

/**
 * La regla de Extras, en la pantalla. (Migración 0195)
 *
 * POR QUÉ ESTE TEST EXISTE. La biblioteca de Extras entró en producción en tres
 * commits seguidos y el tercero (`f7b359a`) era un parche a la propia regla, por
 * «dos huecos que dejaban estados incoherentes». Los dos eran alcanzables desde
 * la UI y ninguno lo cubría nada: los tests unitarios prueban el PREDICADO
 * (`grupoEditableDesdeElPlato`), no si la pantalla lo respeta ni cómo queda la
 * fila.
 *
 * Este spec fija los dos huecos, uno por test:
 *
 *   1. VINCULAR A UN SEGUNDO PLATO SUBE EL GRUPO A LA BIBLIOTECA.
 *      Antes quedaba compartido pero seguía sin salir en «Vincular grupo de
 *      Extras»: compartido y a la vez inencontrable.
 *
 *   2. UN GRUPO DE LA BIBLIOTECA NO SE EDITA DESDE EL PLATO, aunque hoy lo use
 *      uno solo. Antes el predicado solo miraba `sharedWith`, así que un grupo
 *      recién subido caía en editable — y el día que se vinculara a cinco platos
 *      más, el cambio ya habría viajado con él sin que nadie lo decidiera.
 *
 * SE AFIRMA LA FILA, NO SOLO EL PÍXEL. Cada test comprueba lo que ve el dueño Y
 * cómo quedan `is_library` y `menu_item_modifier_groups`. Un badge correcto
 * sobre una fila incoherente es exactamente el estado que el `f7b359a` cerró.
 *
 * EL FIXTURE ES SUYO Y SE LO LIMPIA. No toca el grupo «Extras» que siembra
 * `seed-e2e`: crea el suyo, declara su estado en cada `beforeEach` —para que el
 * orden de los tests no importe— y lo borra al final.
 */

const GRUPO = {
  id: 'e2e00000-0000-4000-8000-0000000009f1',
  nombre: 'E2E Salsas',
}

/**
 * El grupo se cuelga de un plato que NO tiene ningún otro grupo.
 *
 * No es un detalle: `seed-e2e` cuelga su grupo «Extras» de «Pollo entero», y
 * mientras el fixture vivió ahí el editor mostraba DOS tarjetas. Un
 * `getByRole('button', …).first()` de toda la página pulsaba «Usar también en
 * otros platos» de la tarjeta equivocada — el test subía a la biblioteca el
 * grupo del seed, lo dejaba envenenado, y encima daba un fallo que señalaba a
 * la fila de este spec. Con un plato limpio no hay ambigüedad que resolver.
 */
const PLATO_DEL_GRUPO = { id: 'e2e00000-0000-4000-8000-000000000032', nombre: 'Medio pollo' }
const PLATO_DESTINO = { id: 'e2e00000-0000-4000-8000-000000000033', nombre: 'Gaseosa 1L' }
const PLATO_TERCERO = { id: 'e2e00000-0000-4000-8000-000000000031', nombre: 'Pollo entero' }

/** Los dos rótulos con que la pantalla explica un grupo de solo lectura. */
const SOLO_LECTURA = {
  biblioteca: /De Extras · aquí se ve, no se edita/,
  compartido: /Compartido con \d+ plato/,
}

/**
 * El editor de plato monta el formulario DOS VECES —`desktop-view` y
 * `mobile-view`, una escondida por CSS—, así que un localizador sin filtro de
 * visibilidad agarra la copia oculta: resuelve, pero el clic nunca llega a ser
 * posible y el fallo dice «element is not visible», que no señala a la causa.
 */
function visible(loc: Locator): Locator {
  return loc.filter({ visible: true })
}

async function borrarFixture(): Promise<void> {
  await db.from('menu_item_modifier_groups').delete().eq('group_id', GRUPO.id)
  await db.from('menu_modifier_groups').delete().eq('id', GRUPO.id)
}

/**
 * Deja el grupo en el estado de partida: PROPIO del plato A y de nadie más.
 * Es el punto donde los dos huecos nacían.
 */
async function sembrarGrupoPropioDeUnPlato(): Promise<void> {
  await borrarFixture()

  const { error } = await db.from('menu_modifier_groups').insert({
    id: GRUPO.id,
    business_id: E2E.BUSINESS_ID,
    name: GRUPO.nombre,
    selection_type: 'multi',
    is_required: false,
    min_selections: 0,
    max_selections: 3,
    display_order: 99,
    price_display: 'delta',
    is_library: false,
  })
  if (error) throw new Error(`no se pudo sembrar el grupo: ${error.message}`)

  const { error: linkErr } = await db
    .from('menu_item_modifier_groups')
    .insert({ item_id: PLATO_DEL_GRUPO.id, group_id: GRUPO.id, display_order: 99 })
  if (linkErr) throw new Error(`no se pudo vincular el grupo al plato: ${linkErr.message}`)
}

/** Cómo está la fila ahora mismo: si está arriba y cuántos platos la usan. */
async function leerEstado(): Promise<{ isLibrary: boolean; platos: number }> {
  const { data: grupo } = await db
    .from('menu_modifier_groups')
    .select('is_library')
    .eq('id', GRUPO.id)
    .maybeSingle()
  const { data: enlaces } = await db
    .from('menu_item_modifier_groups')
    .select('item_id')
    .eq('group_id', GRUPO.id)
  return { isLibrary: Boolean(grupo?.is_library), platos: (enlaces ?? []).length }
}

/**
 * En qué tarjeta del panel de Extras está nuestro grupo.
 *
 * El nombre vive en un `input`, no en un nodo de texto, así que no hay
 * `getByText` que valga; y el valor de un input controlado por React no se
 * refleja en el atributo, así que tampoco un selector por `[value=...]`. Se
 * recorren y se compara el valor de verdad.
 */
async function indiceDelGrupo(page: Page): Promise<number> {
  const nombres = visible(page.getByRole('textbox', { name: 'Nombre del grupo' }))
  const total = await nombres.count()
  for (let i = 0; i < total; i++) {
    if ((await nombres.nth(i).inputValue()) === GRUPO.nombre) return i
  }
  throw new Error(`no se encontró la tarjeta de «${GRUPO.nombre}» entre ${total} del panel`)
}

test.describe('0195 · la biblioteca de Extras respeta su regla en la pantalla', () => {
  test.beforeEach(async () => {
    await sembrarGrupoPropioDeUnPlato()
    // Las precondiciones se AFIRMAN: si el mundo no arranca donde se declara,
    // que falle aquí y no disfrazado de fallo de UI cuarenta líneas más abajo.
    expect(await leerEstado(), 'el grupo debe nacer propio del plato y sin subir').toEqual({
      isLibrary: false,
      platos: 1,
    })
  })

  test.afterAll(async () => {
    await borrarFixture()
  })

  test('subirlo a Extras lo vuelve de solo lectura aunque lo use un solo plato', async ({
    page,
  }) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    await page.goto(`/menu/item/${PLATO_DEL_GRUPO.id}`)

    const cabecera = visible(page.getByRole('button', { name: new RegExp(GRUPO.nombre) })).first()
    await expect(cabecera).toBeVisible()
    // La sección de grupos queda por debajo del pliegue en el editor de
    // escritorio; sin traerla a la vista el clic se queda esperando.
    await cabecera.scrollIntoViewIfNeeded()

    // De partida es SUYO: ninguno de los dos rótulos de solo lectura.
    await expect(visible(page.getByText(SOLO_LECTURA.biblioteca))).toHaveCount(0)
    await expect(visible(page.getByText(SOLO_LECTURA.compartido))).toHaveCount(0)

    /**
     * TODO lo que sigue va ACOTADO a la tarjeta de este grupo.
     *
     * Un localizador de página entera con `.first()` fue lo que en la primera
     * versión pulsó «Usar también en otros platos» de OTRA tarjeta: subió a la
     * biblioteca el grupo del seed y falló señalando a la fila de este spec.
     */
    const tarjeta = cabecera.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')

    // El botón de subir vive dentro de `isExpanded`. No se alterna a ciegas:
    // cuando es el único grupo del plato la tarjeta ya viene abierta, y un clic
    // la cerraba.
    const expandir = tarjeta.getByRole('button', { name: 'Expandir' })
    if ((await expandir.count()) > 0) await expandir.click()

    const subir = tarjeta.getByRole('button', { name: /Usar también en otros platos/ })
    await expect(subir).toBeVisible()
    await subir.click()

    // EL HUECO 2. Lo sigue usando UN solo plato, así que `sharedWith` es 0: antes
    // del arreglo el predicado lo daba por editable. Ahora manda `isLibrary`.
    await expect(visible(page.getByText(SOLO_LECTURA.biblioteca)).first()).toBeVisible()

    await expect
      .poll(leerEstado, {
        timeout: 15_000,
        message: 'la fila debería haber subido a la biblioteca sin ganar platos',
      })
      .toEqual({ isLibrary: true, platos: 1 })

    expect(errores, `errores de página: ${errores.join(' | ')}`).toHaveLength(0)
  })

  test('vincularlo a un segundo plato lo sube a la biblioteca y lo hace encontrable', async ({
    page,
  }) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    await page.goto('/menu/extras')
    await expect(
      visible(page.getByRole('textbox', { name: 'Nombre del grupo' })).first(),
    ).toBeVisible()

    // «En N plato» abre la hoja de a qué platos va el grupo.
    const i = await indiceDelGrupo(page)
    await visible(page.getByRole('button', { name: /En \d+ plato/ }))
      .nth(i)
      .click()

    // La hoja no es un `role="dialog"` —es un `div` con `fixed inset-0`—, así
    // que se localiza por su encabezado. Y el clic en el plato solo lo MARCA:
    // lo que escribe es «Guardar».
    // El overlay entero: `filter({hasText})` a secas se queda en el `h3`, que no
    // contiene ni los platos ni el botón de guardar.
    const hoja = page.locator('div.fixed.inset-0').filter({ hasText: /¿Dónde va/ })
    await expect(hoja.getByRole('heading', { name: /¿Dónde va/ })).toBeVisible()
    await hoja.getByRole('button', { name: PLATO_DESTINO.nombre }).click()
    await hoja.getByRole('button', { name: 'Guardar' }).click()

    // EL HUECO 1. Al pasar a dos platos la fila tiene que SUBIR sola: si no, el
    // grupo queda compartido y a la vez fuera del buscador de Extras.
    await expect
      .poll(leerEstado, {
        timeout: 15_000,
        message: 'al quedar en 2 platos el grupo debería subir a la biblioteca',
      })
      .toEqual({ isLibrary: true, platos: 2 })

    // Y la consecuencia que el dueño sí ve: ya sale para ponerlo en un tercero.
    await page.goto(`/menu/item/${PLATO_TERCERO.id}`)
    await visible(page.getByRole('button', { name: /Vincular grupo de Extras/ }))
      .first()
      .click()
    await expect(
      visible(page.getByText(GRUPO.nombre)).first(),
      'el grupo debería salir ya en el buscador de «Vincular grupo de Extras»',
    ).toBeVisible()

    expect(errores, `errores de página: ${errores.join(' | ')}`).toHaveLength(0)
  })
})
