/**
 * EL PASO DEL CELULAR, EN PANTALLAS CORTAS.
 *
 * POR QUÉ EXISTE. El 2026-09-03 un vecino pulsó «Enviar código por SMS» tres
 * veces en dos minutos y medio y no escribió ninguno: la hoja se le quedaba en
 * blanco. El campo del código llevaba `autoFocus`, así que el teclado del móvil
 * se abría solo en el mismo instante en que se pintaba esa pantalla; la hoja
 * tiene el alto tasado (`max-h-[85dvh]`), de modo que lo único que podía
 * encogerse era la zona de contenido, y el campo caía fuera del recorte. Y con
 * `scrollbar-hide` encima, no quedaba ni un indicio de que hubiera algo debajo.
 *
 * Desde el 13 de agosto, 10 de 53 cuentas se quedaron en este paso. Nada de eso
 * dejaba rastro más que una fila en `customer_otp_attempts`: por eso el test.
 *
 * QUÉ AFIRMA, y por qué son esas tres cosas:
 *   1. Tras enviar el código, el foco NO está en el campo. Es la causa raíz: sin
 *      foco automático no hay teclado automático, y la pantalla se pinta entera.
 *   2. A las alturas que da un móvil con el teclado abierto, el campo SE VE.
 *   3. Donde ya no quepa, se puede llegar a él Y SE NOTA: el contenedor
 *      desborda y su barra de scroll no está oculta. Un campo al que no se ve
 *      cómo llegar es un campo que no existe.
 *
 * SE CREA SU PROPIO CLIENTE, y no usa los tres sembrados, porque los tres nacen
 * con el teléfono ya verificado y este paso solo existe antes de eso. Desde la
 * 0279 una cuenta nueva solo nace con Google, y en local no hay Google: la
 * cuenta se crea por servicio, sin perfil, entra con su contraseña y se deja la
 * marca de reanudación que deja `signInWithGoogle` antes de salir a Google. Al
 * recargar, el host reanuda el onboarding como al volver de Google: nombre →
 * celular, el camino que hace hoy un vecino nuevo. Y lo borra al terminar:
 * `auth.users` NO arrastra a `public.users` —no hay FK entre las dos—, así que
 * hay que borrar de las dos, y de `customer_otp_attempts` a mano, que tampoco la
 * tiene.
 *
 * EL SMS NO SE ENVÍA. En local no hay Twilio, así que `send-code` se responde
 * desde el test. Y para pasar del paso se marca `phone_verified_at` por
 * servicio, que es lo que haría Twilio: aquí se prueba la pantalla, no a Twilio.
 */

import { expect, type Page, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const LOCAL_URL = 'http://127.0.0.1:54321'
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const db = createClient(LOCAL_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Prefijo propio: la limpieza barre por él, así que no puede solaparse. */
const PREFIJO = 'e2e-onb-'
const PASSWORD = 'e2e-password-12345'
const ITEM = 'Pollo entero'
/** Inventado. Nunca sale de aquí: el envío se responde desde el test. */
const CELULAR = '987654321'

const ANCHO = 393

/**
 * Alturas de ventana, en px. No son redondeos bonitos: son lo que queda de un
 * móvil cuando se abre el teclado. 800 es la pantalla entera; 500 es un móvil
 * normal con el teclado fuera; 430 es uno pequeño, de los que se venden en San
 * Jacinto. Por debajo de eso el formulario no cabe de ninguna manera honesta y
 * lo que se exige es lo otro: que se pueda llegar al campo y que se vea que se
 * puede.
 */
const ALTURAS_CON_TECLADO = [800, 600, 500, 430]

type Medida = {
  existe: boolean
  visible: boolean
  desborda: boolean
  scrollbarOculta: boolean | null
}

/**
 * Mide un campo CONTRA SU RECORTE, no contra la ventana.
 *
 * Un `toBeVisible()` de Playwright no sirve aquí: para él un input dentro de un
 * `overflow-y-auto`, fuera de la parte visible pero con tamaño, está visible. Y
 * eso es justo el defecto que se persigue. Así que se compara el rectángulo del
 * campo con el del contenedor que lo recorta.
 */
async function medir(page: Page, selector: string): Promise<Medida> {
  return page.evaluate((sel) => {
    const input = document.querySelector(sel)
    if (!input) return { existe: false, visible: false, desborda: false, scrollbarOculta: null }
    const rc = input.getBoundingClientRect()
    let scroller = input.parentElement
    while (scroller && getComputedStyle(scroller).overflowY !== 'auto') {
      scroller = scroller.parentElement
    }
    const rs = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    return {
      existe: true,
      // Holgura de 1 px: los rectángulos vienen con decimales.
      visible:
        rc.top >= rs.top - 1 &&
        rc.bottom <= rs.bottom + 1 &&
        rc.top >= 0 &&
        rc.bottom <= window.innerHeight,
      desborda: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
      scrollbarOculta: scroller ? getComputedStyle(scroller).scrollbarWidth === 'none' : null,
    }
  }, selector)
}

/** O se ve, o el vecino tiene cómo llegar y se le nota. Nunca ninguna de las dos. */
function alcanzable(m: Medida): boolean {
  return m.existe && (m.visible || (m.desborda && m.scrollbarOculta === false))
}

let userId: string | null = null

test.afterEach(async () => {
  // Barre por prefijo, no solo el de esta corrida: si un intento anterior se
  // cayó a medias, su cuenta se va aquí en vez de quedarse para siempre.
  const { data: restos } = await db.from('users').select('id').like('email', `${PREFIJO}%`)
  const ids = (restos ?? []).map((u) => u.id as string)
  if (userId && !ids.includes(userId)) ids.push(userId)
  if (ids.length === 0) return

  // `customer_otp_attempts` no tiene FK a `users`: no se va sola.
  await db.from('customer_otp_attempts').delete().in('user_id', ids)
  // `public.users` sí arrastra perfil, direcciones y aceptación de términos.
  await db.from('users').delete().in('id', ids)
  // Y `auth.users` va aparte, porque tampoco hay FK entre las dos tablas.
  for (const id of ids) await db.auth.admin.deleteUser(id).catch(() => {})
  userId = null
})

test('el campo del código sigue a la vista cuando el teclado come pantalla', async ({
  page,
  context,
}) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(e.message))

  await page.setViewportSize({ width: ANCHO, height: 800 })

  // En local no hay Twilio. El envío se da por bueno desde aquí; lo que se
  // prueba es la pantalla que viene después, no el proveedor de SMS.
  await context.route('**/customer/phone/send-code', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { sent: true, channel: 'sms' } }),
    }),
  )

  // ── Cuenta nueva, como la deja Google: sin perfil de cliente ──────────────
  const email = `${PREFIJO}${Date.now()}@e2e.local`
  const { data: creado, error: alta } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino De Prueba' },
  })
  expect(alta, 'crear la cuenta por servicio no debe fallar').toBeNull()
  userId = creado.user?.id as string

  await page.goto('/negocio/la-florencia-e2e')
  await page.getByText(ITEM).first().click()
  await page.getByRole('button', { name: /^Agregar ·/ }).click()
  await expect(page.getByRole('button', { name: /Ver mi bolsa/ })).toBeVisible()

  await page.goto('/entrar')
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(email)
  await formLogin.getByPlaceholder('Tu contraseña').fill(PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })

  // La misma marca que deja `saveOnboardingResume` antes de salir a Google.
  await page.evaluate(() =>
    localStorage.setItem(
      'tindivo.onboarding.resume',
      JSON.stringify({ v: 1, next: '/checkout', ts: Date.now() }),
    ),
  )
  await page.goto('/negocio/la-florencia-e2e')
  await expect(page.getByRole('heading', { name: '¿Cómo te llamamos?' })).toBeVisible({
    timeout: 20_000,
  })
  // Todos los paneles del carrusel están montados: se acota al formulario del nombre, que
  // viene prellenado con el `full_name` de la cuenta, como el que trae Google.
  await page
    .locator('form')
    .filter({ hasText: '¿Cómo te llamamos?' })
    .getByRole('button', { name: 'Continuar' })
    .click()

  // ── Paso del celular ──────────────────────────────────────────────────────
  const campoTelefono = 'input[placeholder^="9"]'
  await expect(page.getByRole('heading', { name: /número\s*de celular/i })).toBeVisible()

  for (const alto of ALTURAS_CON_TECLADO) {
    await page.setViewportSize({ width: ANCHO, height: alto })
    const m = await medir(page, campoTelefono)
    expect(
      alcanzable(m),
      `campo del teléfono inalcanzable a ${alto} px: ${JSON.stringify(m)}`,
    ).toBe(true)
  }

  // ── Enviar el código ──────────────────────────────────────────────────────
  await page.setViewportSize({ width: ANCHO, height: 800 })
  await page.locator(campoTelefono).fill(CELULAR)
  await page.getByRole('button', { name: 'Enviar código por SMS' }).click()

  const campoCodigo = 'input[placeholder="— — — — — —"]'
  await expect(page.getByRole('heading', { name: 'Ingresa el código' })).toBeVisible()

  // 1. LA CAUSA RAÍZ. Con `autoFocus` aquí salía INPUT, el teclado se abría solo
  //    y la hoja se encogía antes de que al vecino le diera tiempo a ver nada.
  const enfocado = await page.evaluate(() => document.activeElement?.tagName ?? null)
  expect(enfocado, 'el campo del código no debe robar el foco: abre el teclado solo').not.toBe(
    'INPUT',
  )

  // 2 y 3. A cada altura de teclado, el campo se ve; y si no cupiera, se puede
  //    llegar a él con la barra a la vista.
  for (const alto of ALTURAS_CON_TECLADO) {
    await page.setViewportSize({ width: ANCHO, height: alto })
    const m = await medir(page, campoCodigo)
    expect(m.visible, `campo del código fuera de la vista a ${alto} px: ${JSON.stringify(m)}`).toBe(
      true,
    )
  }

  // EL CARRUSEL NO PUEDE HABERSE DESPLAZADO POR SU CUENTA. Mide un panel por paso
  // de ancho y se coloca con `translateX`, así que cualquier `scrollLeft` que le
  // ponga el navegador corre el panel activo y asoma el de al lado — y con
  // `overflow: hidden` no había forma humana de devolverlo. Medido el
  // 2026-09-04, llegaba aquí con 16 px heredados del formulario de registro por
  // correo (retirado en la 0279): los ponía el navegador al enfocar aquellos
  // campos; hoy el que se enfoca antes es el del nombre. Lo cierra
  // `.overflow-clip-safe`, que recorta sin ser contenedor de scroll.
  const desplazamiento = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="onboarding-carrusel"]')
    return c ? { left: c.scrollLeft, top: c.scrollTop } : null
  })
  expect(desplazamiento, 'el carrusel de pasos tiene que estar montado').not.toBeNull()
  expect(desplazamiento).toEqual({ left: 0, top: 0 })

  // ── Pasar la verificación como la pasaría Twilio ──────────────────────────
  // El código real no se puede recibir en local. Se sella el teléfono por
  // servicio, que es EXACTAMENTE lo que escribe `/customer/phone/verify` cuando
  // Twilio aprueba: aquí se prueba la pantalla, no al proveedor de SMS.
  //
  // Y luego se vuelve a pedir, porque sellar la columna no prueba nada por sí
  // solo. Lo que se comprueba es que el guard de `useOrderReadiness` lo lee y
  // deja pasar: el vecino que verifica su número deja de tropezar con esta
  // puerta y llega a la siguiente, la de la dirección — que este cliente recién
  // creado todavía no tiene.
  await page.setViewportSize({ width: ANCHO, height: 800 })
  const { error: sello } = await db
    .from('customer_profiles')
    .update({ phone: `+51${CELULAR}`, phone_verified_at: new Date().toISOString() })
    .eq('user_id', userId)
  expect(sello, 'sellar el teléfono por servicio no debe fallar').toBeNull()

  // La bolsa sobrevive a la recarga (vive en localStorage), así que se puede
  // volver a pedir sin rehacer el pedido. La marca de reanudación de Google, en
  // cambio, se quita: con ella el host reabriría la hoja en la dirección por su
  // cuenta, y la aserción de abajo pasaría sin que el guard del checkout leyera
  // el sello.
  await page.evaluate(() => localStorage.removeItem('tindivo.onboarding.resume'))
  await page.reload()
  await page.getByRole('button', { name: /Ver mi bolsa/ }).click()
  await page.getByRole('button', { name: 'Ir a pagar' }).click()
  await expect(page.getByRole('heading', { name: /Tu dirección/i }).first()).toBeVisible({
    timeout: 20_000,
  })

  expect(errores, 'la pantalla no debe lanzar errores de JS').toEqual([])
})
