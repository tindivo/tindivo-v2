/**
 * EL REPARTO DE RÓTULOS DEL MAPA, EN EL PRIMER VISTAZO.
 *
 * POR QUÉ EXISTE. `repartirRotulos` decide qué referencias del pueblo escriben
 * su nombre y de qué lado, y lo decide contra el TAMAÑO del lienzo: de ahí sale
 * «no cabe a la derecha, pruebo a la izquierda» y «choca, no se escribe». Si el
 * lienzo se mide mal, el reparto entero se calcula contra una pantalla que no
 * existe.
 *
 * El defecto que cerró esto era del peor tipo: se veía en el primer vistazo
 * —nombres pisándose, nombres saliéndose por el borde— y se componía solo al
 * primer toque. O sea que desaparecía justo cuando ibas a mirarlo. Lo sostienen
 * los `invalidateSize()` a 0/150/450 ms de `InvalidateSize` y el
 * `moveend: () => setPasada(...)` de `LandmarkLayer`, los dos en
 * `map-picker-inner.tsx`.
 *
 * QUÉ AFIRMA, y por qué hacen falta las tres:
 *
 *   1. NINGÚN FRAME, desde que la pantalla existe, tiene un nombre pisando a
 *      otro. Se graba con `requestAnimationFrame` instalado ANTES de abrir,
 *      porque medir «cuando ya se ve» llega tarde por definición: el síntoma
 *      vivía justo en los frames que nadie llega a inspeccionar a mano.
 *   2. EL REPARTO SE ADAPTA AL TAMAÑO SIN QUE NADIE TOQUE EL MAPA. Es la que
 *      guarda el arreglo: sin recálculo, el reparto se queda con el de la
 *      pantalla ancha y al estrecharse los nombres del lado derecho se salen
 *      del lienzo. Al estrechar, el borde derecho se acerca el DOBLE de lo que
 *      se desplazan los marcadores —Leaflet conserva el centro—, y por eso el
 *      síntoma es «fuera del lienzo» y no «solapado».
 *   3. MISMO TAMAÑO Y MISMO ENCUADRE -> MISMO REPARTO. Un resize de ida y
 *      vuelta obliga a repartir otra vez sin mover el mapa. Si lo que sale no
 *      es lo que ya había, el primero se calculó contra otra medida.
 *
 * NO SE AFIRMA que el reparto sobreviva a un arrastre: arrastrar cambia el
 * encuadre, y con otro encuadre otro reparto es lo CORRECTO, no un defecto. Por
 * eso la comparación va anclada a las posiciones de las chapas dentro del
 * lienzo (`ancla`): solo se exige firma igual cuando el mapa está donde estaba.
 *
 * QUÉ LA PONE ROJA, medido el 2026-09-05 revirtiendo cada mitad:
 *   · sin `moveend` NI `resize` -> cae la 2 en los tres anchos: 4, 7 y 8
 *     nombres fuera del lienzo tras estrechar a 320 px.
 *   · sin `resize` a secas -> SIGUE VERDE, y no es un hueco del test. En
 *     Leaflet 1.9.4 `resize` NO PUEDE dispararse solo: `invalidateSize` sale
 *     antes de disparar nada si el desplazamiento es cero, y si no lo es
 *     dispara `move` -> `moveend` -> `resize`, en ese orden (leaflet-src.js
 *     3670-3712); el propio manejador de ventana de Leaflet entra por ahí con
 *     `debounceMoveend`, así que `moveend` llega igual, 200 ms después. O sea
 *     que la línea del `resize` es redundante con la del `moveend`: lo único
 *     que añade es un segundo reparto por cada cambio de tamaño. Si algún día
 *     se limpia, lo que este test exige —que el reparto se adapte— sigue en pie.
 *   · la 1 y la 3 siguen verdes quitando cualquiera de las dos: el montaje ya
 *     mide bien gracias a `InvalidateSize`, y volver al mismo ancho pide el
 *     mismo reparto que ya había. Son red de seguridad, no las que guardan esto.
 *
 * SE SIEMBRA SUS PROPIAS REFERENCIAS Y LAS RETIRA. `map_landmarks` está vacía
 * en producción y tiene dos filas sueltas en local: con dos puntos no hay
 * pelea de rótulos que medir, y sin pelea este test no afirma nada. Los ids son
 * fijos a propósito, para que una corrida que se caiga a medias deje EXACTAMENTE
 * las filas que la siguiente barre antes de empezar.
 */

import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const db = createClient(LOCAL_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const E2E = {
  PASSWORD: 'e2e-password-12345',
  CUSTOMER_EMAIL: 'cliente@e2e.local',
}

/**
 * El racimo. Doce referencias apretadas alrededor del centro de San Jacinto,
 * con nombres de largos distintos a propósito: uno que cabe de sobra
 * («Megatac»), uno que obliga a dos líneas («I.E. 88024 José Carlos
 * Mariátegui») y varios en la frontera, que son los que deciden el volteo.
 *
 * Los ids son literales y no `gen_random_uuid()`: son la lista que barre
 * `limpiar()`, y tienen que ser los mismos en la corrida que se cayó y en la
 * que viene detrás.
 */
const RACIMO = [
  [
    '3f1a0001-0000-4000-8000-00000000e2e1',
    'Plaza de Armas de San Jacinto',
    'recreacion',
    -9.1497,
    -78.2808,
  ],
  [
    '3f1a0002-0000-4000-8000-00000000e2e2',
    'I.E. 88024 José Carlos Mariátegui',
    'educacion',
    -9.14945,
    -78.2804,
  ],
  [
    '3f1a0003-0000-4000-8000-00000000e2e3',
    'Municipalidad Distrital',
    'gobierno',
    -9.15005,
    -78.28065,
  ],
  ['3f1a0004-0000-4000-8000-00000000e2e4', 'Iglesia San Jacinto', 'religioso', -9.14958, -78.28125],
  ['3f1a0005-0000-4000-8000-00000000e2e5', 'Estadio Municipal', 'deporte', -9.1503, -78.2814],
  ['3f1a0006-0000-4000-8000-00000000e2e6', 'Posta Médica', 'salud', -9.1489, -78.28075],
  ['3f1a0007-0000-4000-8000-00000000e2e7', 'Mercado Central', 'mercado', -9.14995, -78.28015],
  [
    '3f1a0008-0000-4000-8000-00000000e2e8',
    'Comisaría PNP San Jacinto',
    'gobierno',
    -9.14915,
    -78.2801,
  ],
  [
    '3f1a0009-0000-4000-8000-00000000e2e9',
    'Colegio Fe y Alegría',
    'educacion',
    -9.15055,
    -78.28035,
  ],
  [
    '3f1a000a-0000-4000-8000-00000000e2ea',
    'Losa Deportiva Barrio Nuevo',
    'deporte',
    -9.14875,
    -78.28145,
  ],
  [
    '3f1a000b-0000-4000-8000-00000000e2eb',
    'Parroquia Virgen del Carmen',
    'religioso',
    -9.1502,
    -78.2818,
  ],
  ['3f1a000c-0000-4000-8000-00000000e2ec', 'Bodega Don Carlos', 'otro', -9.14938, -78.2817],
] as const

const IDS = RACIMO.map(([id]) => id)

/** El centro del racimo: es donde se planta el GPS para que el mapa abra ahí. */
const CENTRO = { latitude: -9.1496, longitude: -78.2809, accuracy: 12 }

/**
 * Los tres anchos del piloto. 360 es el móvil barato que se vende en San
 * Jacinto, 390 el iPhone corriente y 430 el grande. El reparto tiene que
 * aguantar los tres, y son justo donde el volteo izquierda/derecha cambia.
 */
const ANCHOS = [360, 390, 430]
/** A dónde se estrecha para la afirmación 2. Por debajo del más estrecho. */
const ANCHO_ESTRECHO = 320
const ALTO = 844

async function limpiar() {
  await db.from('map_landmarks').delete().in('id', IDS)
}

test.beforeEach(async () => {
  // Antes, no solo después: si la corrida anterior se cayó, sus filas siguen ahí.
  await limpiar()
  const { error } = await db
    .from('map_landmarks')
    .insert(RACIMO.map(([id, name, category, lat, lng]) => ({ id, name, category, lat, lng })))
  expect(error, 'sembrar las referencias del mapa no debe fallar').toBeNull()
})

test.afterEach(limpiar)

async function entrar(page: import('@playwright/test').Page) {
  // El `filter` no es adorno: en /entrar hay DOS formularios montados a la vez
  // (crear cuenta e iniciar sesión) con los mismos placeholders.
  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })
}

/**
 * Se evalúa DENTRO de la página, y mide cajas reales del DOM: no repite el
 * cálculo de `repartirRotulos`, que es justo lo que está bajo sospecha.
 */
const MEDIR = () => {
  const solapan = (a: DOMRect, b: DOMRect) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

  /*
   * ACOTADO A LA PANTALLA COMPLETA, y no es un detalle: mientras está abierta
   * hay DOS Leaflet vivos, porque la postal del formulario sigue montada
   * debajo. Medir contra `document` coge el lienzo de la postal —180 px, y sin
   * un solo rótulo, que va con `showLabels: false`— y da por bueno un tamaño
   * que no es el que se está mirando.
   */
  const raiz = document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Ajustar la ubicación en el mapa"]',
  )
  if (!raiz) throw new Error('la pantalla del mapa no está montada')

  const nombres: { texto: string; izq: boolean; r: DOMRect; marcador: Element }[] = []
  const chapas: { r: DOMRect; marcador: Element }[] = []
  for (const m of raiz.querySelectorAll('.leaflet-marker-icon.t-lm')) {
    const n = m.querySelector<HTMLElement>('.t-lm-name')
    if (n) {
      nombres.push({
        texto: (n.textContent ?? '').trim(),
        izq: n.classList.contains('izq'),
        r: n.getBoundingClientRect(),
        marcador: m,
      })
    }
    const c = m.querySelector<HTMLElement>('.t-lm-badge')
    if (c) chapas.push({ r: c.getBoundingClientRect(), marcador: m })
  }

  const solapesEntreNombres: string[] = []
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      if (solapan(nombres[i].r, nombres[j].r)) {
        solapesEntreNombres.push(`${nombres[i].texto} ↔ ${nombres[j].texto}`)
      }
    }
  }

  // Un rótulo tapando el icono de OTRO es el mismo defecto, solo que más
  // difícil de ver. El propio no cuenta: nace a 14 px de su chapa por CSS.
  const nombreSobreChapaAjena: string[] = []
  for (const n of nombres) {
    for (const c of chapas) {
      if (c.marcador !== n.marcador && solapan(n.r, c.r)) nombreSobreChapaAjena.push(n.texto)
    }
  }

  const cont = raiz.querySelector('.leaflet-container')
  const lienzo = cont?.getBoundingClientRect()
  const fueraDelLienzo = lienzo
    ? nombres
        .filter(
          (n) =>
            n.r.left < lienzo.left ||
            n.r.right > lienzo.right ||
            n.r.top < lienzo.top ||
            n.r.bottom > lienzo.bottom,
        )
        .map((n) => n.texto)
    : []

  return {
    ancho: lienzo ? Math.round(lienzo.width) : 0,
    alto: lienzo ? Math.round(lienzo.height) : 0,
    chapas: chapas.length,
    nombres: nombres.length,
    solapesEntreNombres,
    nombreSobreChapaAjena,
    fueraDelLienzo,
    /*
     * DÓNDE ESTÁ EL MAPA, medido sin preguntarle nada a Leaflet: la posición de
     * las chapas dentro del lienzo. Si esto cambia, el mapa se movió, y
     * entonces un reparto distinto es lo correcto. Es lo que separa «el primer
     * reparto estaba mal» de «se está mirando otro encuadre».
     */
    ancla: lienzo
      ? chapas
          .map((c) => `${Math.round(c.r.left - lienzo.left)},${Math.round(c.r.top - lienzo.top)}`)
          .sort()
          .join(' ')
      : '',
    /** QUÉ nombres se escribieron y de qué lado. Es lo que se compara. */
    firma: nombres
      .map((n) => `${n.texto}|${n.izq ? 'izq' : 'der'}`)
      .sort()
      .join(' · '),
  }
}

/** Instala el grabador por frame. Va ANTES de abrir la pantalla. */
const GRABAR = () => {
  const w = window as unknown as {
    __rec?: { ms: number; ancho: number; chapas: number; nombres: number; solapes: number }[]
  }
  w.__rec = []
  const t0 = performance.now()
  const tic = () => {
    const raiz = document.querySelector(
      '[role="dialog"][aria-label="Ajustar la ubicación en el mapa"]',
    )
    if (raiz) {
      const cont = raiz.querySelector('.leaflet-container')
      const cajas = [...raiz.querySelectorAll('.t-lm-name')].map((n) => n.getBoundingClientRect())
      let solapes = 0
      for (let i = 0; i < cajas.length; i++) {
        for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i]
          const b = cajas[j]
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
            solapes++
          }
        }
      }
      w.__rec?.push({
        ms: Math.round(performance.now() - t0),
        ancho: cont ? Math.round(cont.getBoundingClientRect().width) : 0,
        chapas: raiz.querySelectorAll('.t-lm-badge').length,
        nombres: cajas.length,
        solapes,
      })
    }
    if (performance.now() - t0 < 2500) requestAnimationFrame(tic)
  }
  requestAnimationFrame(tic)
}

for (const ancho of ANCHOS) {
  test(`los rótulos del mapa se reparten bien desde el primer frame — ${ancho}px`, async ({
    page,
    context,
  }) => {
    // Un GPS fijo en el centro del racimo: así la pantalla abre siempre en el
    // mismo encuadre y las medidas son comparables entre corridas.
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation(CENTRO)
    await page.setViewportSize({ width: ancho, height: ALTO })

    await entrar(page)
    await page.goto('/cuenta')
    // Por regex y anclado al final: el botón lleva un `Icon` dentro, cuyo
    // `aria-label` entra en el nombre accesible («add Añadir»), y en la misma
    // pantalla vive además «Añadir otra dirección».
    await page.getByRole('button', { name: /Añadir$/ }).click()

    const hoja = page.getByRole('dialog', { name: 'Nueva dirección' })
    // El pie con la medida es la señal de que el GPS ya entró y hay punto.
    await expect(hoja.getByText(/GPS ±/)).toBeVisible({ timeout: 20_000 })

    await page.evaluate(GRABAR)

    // Con GPS concedido y punto confirmado, quien abre la pantalla es la postal
    // entera. Sin GPS sería el botón «Marcar en el mapa»: misma pantalla.
    await hoja.getByRole('button', { name: 'Cambiar mi ubicación en el mapa' }).click()
    const pantalla = page.getByRole('dialog', { name: 'Ajustar la ubicación en el mapa' })
    await expect(pantalla).toBeVisible()
    await expect(pantalla.locator('.t-lm-name').first()).toBeVisible({ timeout: 20_000 })

    // A partir de aquí, y hasta el arrastre del final, NADIE toca el mapa.
    const alAbrir = await page.evaluate(MEDIR)
    await page.waitForTimeout(2000)
    const enReposo = await page.evaluate(MEDIR)

    // ── 1 · ni un frame con nombres pisándose ────────────────────────────────
    const rec = await page.evaluate(
      () =>
        (
          window as unknown as {
            __rec: { ms: number; ancho: number; chapas: number; nombres: number; solapes: number }[]
          }
        ).__rec,
    )
    expect(rec.length, 'el grabador tiene que haber visto la pantalla').toBeGreaterThan(10)
    expect(rec.filter((f) => f.solapes > 0)).toEqual([])
    // Y el lienzo mide la pantalla entera ya en el primer frame con contenido.
    const primeroConContenido = rec.find((f) => f.chapas > 0)
    expect(primeroConContenido?.ancho).toBe(ancho)

    // El reparto es limpio y no cambia solo entre que se ve y los 2 s.
    expect(alAbrir.solapesEntreNombres).toEqual([])
    expect(alAbrir.nombreSobreChapaAjena).toEqual([])
    expect(alAbrir.fueraDelLienzo).toEqual([])
    expect(alAbrir.firma).toBe(enReposo.firma)
    expect(enReposo.nombres).toBeGreaterThan(0)

    // ── 2 · se adapta al tamaño sin que nadie toque el mapa ──────────────────
    // LA QUE GUARDA EL ARREGLO. Al estrechar, el borde derecho del lienzo se
    // acerca el DOBLE de lo que se desplazan los marcadores —Leaflet conserva
    // el centro—, así que un reparto que no se rehaga deja los nombres de la
    // derecha fuera de la pantalla. Sin arrastrar: solo cambiando el tamaño.
    await page.setViewportSize({ width: ANCHO_ESTRECHO, height: ALTO })
    await page.waitForTimeout(800)
    const estrecho = await page.evaluate(MEDIR)
    expect(estrecho.ancho).toBe(ANCHO_ESTRECHO)
    expect(estrecho.fueraDelLienzo).toEqual([])
    expect(estrecho.solapesEntreNombres).toEqual([])
    expect(estrecho.nombreSobreChapaAjena).toEqual([])

    // ── 3 · mismo tamaño y mismo encuadre -> mismo reparto ───────────────────
    await page.setViewportSize({ width: ancho, height: ALTO })
    await page.waitForTimeout(800)
    const devuelto = await page.evaluate(MEDIR)
    expect(devuelto.ancla, 'volver al mismo ancho no mueve el mapa').toBe(enReposo.ancla)
    expect(devuelto.firma).toBe(enReposo.firma)

    // ── Y tras arrastrar, el encuadre es otro; el reparto, limpio igual ──────
    const caja = await pantalla.locator('.leaflet-container').boundingBox()
    expect(caja, 'el lienzo tiene que tener caja para poder arrastrarlo').not.toBeNull()
    if (!caja) return
    const cx = caja.x + caja.width / 2
    const cy = caja.y + caja.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 40, cy + 30, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(600)
    const trasArrastre = await page.evaluate(MEDIR)
    expect(trasArrastre.solapesEntreNombres).toEqual([])
    expect(trasArrastre.nombreSobreChapaAjena).toEqual([])
    expect(trasArrastre.fueraDelLienzo).toEqual([])

    // No guarda la dirección: la pantalla se abre, se mira y se cierra, así que
    // no deja nada en `customer_addresses` para las suites que vienen detrás.
  })
}
