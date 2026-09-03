import { expect, test } from '@playwright/test'

/**
 * La ubicación es un campo obligatorio, y el GPS nunca es un requisito.
 *
 * POR QUÉ EXISTE. En producción se guardaron direcciones apuntando al centro
 * del pueblo: el formulario escribía el centro de cobertura como coordenada al
 * montar y `canSave` solo miraba calle y referencia. Alguien con prisa llenaba
 * los dos textos —sin enterarse de que había que tocar el mapa— y guardaba la
 * plaza como su casa; el motorizado salía hacia la plaza. Es el mismo defecto
 * que la migración 0147 documenta del v1 y que el app del motorizado ya había
 * cerrado por su lado.
 *
 * Los dos casos que se afirman aquí son justo los dos que fallaban:
 *   · permiso DENEGADO -> se dice, se ofrece reintentar, y marcar a mano sigue
 *     abierto. Nunca es un callejón sin salida.
 *   · sin punto elegido -> Guardar está bloqueado Y dice qué falta.
 *
 * No guarda nada: abre la hoja, mira y cierra. Así no deja basura en
 * `customer_addresses` para las suites que vienen detrás.
 */

const E2E = {
  PASSWORD: 'e2e-password-12345',
  CUSTOMER_EMAIL: 'cliente@e2e.local',
}

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

test.describe('Nueva dirección — la ubicación es obligatoria', () => {
  test('sin permiso de GPS: lo dice, deja reintentar y NO cierra el camino manual', async ({
    page,
    context,
  }) => {
    // Denegado de verdad, a nivel de navegador: es el escenario que produjo el
    // incidente, y el que antes se veía idéntico a un acierto.
    await context.clearPermissions()

    await entrar(page)
    await page.goto('/cuenta')
    // Por regex y anclado al final: el botón lleva un `Icon` dentro, cuyo
    // `aria-label` entra en el nombre accesible («add Añadir»), y en la misma
    // pantalla vive además «Añadir otra dirección».
    await page.getByRole('button', { name: /Añadir$/ }).click()

    const hoja = page.getByRole('dialog', { name: 'Nueva dirección' })
    await expect(hoja.getByText('No pudimos usar tu GPS')).toBeVisible({ timeout: 20_000 })

    // El reintento existe: el permiso puede haberse rechazado sin querer.
    await expect(hoja.getByRole('button', { name: 'Permitir GPS' })).toBeVisible()
    // Y el camino que no depende del sensor sigue siendo el principal.
    await expect(hoja.getByRole('button', { name: 'Marcar en el mapa' })).toBeEnabled()
  })

  test('sin marcar el punto no se puede guardar, y el botón dice qué falta', async ({
    page,
    context,
  }) => {
    await context.clearPermissions()

    await entrar(page)
    await page.goto('/cuenta')
    // Por regex y anclado al final: el botón lleva un `Icon` dentro, cuyo
    // `aria-label` entra en el nombre accesible («add Añadir»), y en la misma
    // pantalla vive además «Añadir otra dirección».
    await page.getByRole('button', { name: /Añadir$/ }).click()

    const hoja = page.getByRole('dialog', { name: 'Nueva dirección' })
    await expect(hoja.getByText('No pudimos usar tu GPS')).toBeVisible({ timeout: 20_000 })

    // Se llenan los DOS textos, que es exactamente lo que hizo la persona del
    // incidente. Antes, con esto bastaba para que el botón se pusiera naranja.
    await hoja.getByPlaceholder('Ej. Jr. Sucre 412').fill('Jr. Sucre 412')
    await hoja
      .getByPlaceholder(/Frente a la bodega de don Carlos/)
      .fill('Casa de reja negra, tocar timbre dos veces')

    const guardar = hoja.getByRole('button', { name: 'Falta marcar tu ubicación' })
    await expect(guardar).toBeVisible()
    await expect(guardar).toBeDisabled()
  })
})

/**
 * La medida del sensor sobrevive a una edición que no toca el mapa.
 *
 * POR QUÉ EXISTE. La hoja del perfil resellaba en CADA guardado:
 * `location_confirmed_at = now()` y `location_accuracy_m` con su estado local,
 * que entraba siempre en `null` porque la precisión guardada ni se leía de la
 * base. Cambiar la etiqueta de «Casa» a «Trabajo» convertía un GPS de ±12 m en
 * un NULL, y NULL —por el convenio de la 0202— significa «el pin se puso a
 * mano». O sea: el guardado destruía justo la columna que la 0202 creó para
 * poder distinguir una medida de una decisión.
 *
 * Se afirma por la UI y no por la base: el pie del mapa dice «GPS ±N m» cuando
 * hay medida y «ajustada a mano» cuando no.
 *
 * QUÉ CUBRE Y QUÉ NO, comprobado revirtiendo cada mitad del arreglo y viendo
 * cuál pone rojo este test:
 *
 *   · SÍ · la rehidratación (`initialAccuracyM`). Sin ella el test cae en la
 *     MITAD 1, y con ella cae también el destrozo: la precisión que se relee es
 *     la que se vuelve a escribir.
 *   · NO · el resello de `location_confirmed_at`. Que la fecha de confirmación
 *     salte a hoy en cada guardado no se ve en ninguna pantalla, así que ese
 *     lado lo sostienen los tests de `sealLocation` y nada más. Si alguien
 *     quita el `sealLocation` de la hoja, esto sigue en verde.
 *
 * SE LIMPIA SOLO. Crea su propia dirección y la borra al final, así que no deja
 * nada para las suites que vienen detrás. Nunca toca la «Casa» del seed, que es
 * la predeterminada de la que dependen los pedidos.
 */
test.describe('Editar dirección — el sello del punto lo mueve el punto', () => {
  const PRECISION_M = 12
  const LINEA = 'Av. Los Álamos 890'

  /**
   * La tarjeta de UNA dirección de la libreta.
   *
   * La tarjeta no tiene rol propio, así que se identifica por lo que contiene:
   * su línea de dirección Y su botón «Editar». Sin la segunda condición el
   * `.last()` cae en el `div` más interno —el que solo lleva el texto— y ahí
   * dentro no hay ningún botón que pulsar.
   */
  const tarjetaDe = (page: import('@playwright/test').Page) =>
    page
      .locator('div')
      .filter({ hasText: LINEA })
      .filter({ has: page.getByRole('button', { name: /Editar/ }) })
      .last()

  test('cambiar la etiqueta no borra los metros del GPS', async ({ page, context }) => {
    // Un GPS de verdad, fijo y con precisión conocida: así el pie del mapa dice
    // un número que se puede afirmar.
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({
      latitude: -9.1478,
      longitude: -78.2762,
      accuracy: PRECISION_M,
    })

    await entrar(page)
    await page.goto('/cuenta')
    await page.getByRole('button', { name: /Añadir$/ }).click()

    const alta = page.getByRole('dialog', { name: 'Nueva dirección' })
    // El GPS entra solo al montar; el pie con la medida es la señal de que ya
    // hay punto y de cuántos metros trae.
    await expect(alta.getByText(`GPS ±${PRECISION_M} m`)).toBeVisible({ timeout: 20_000 })
    await alta.getByRole('button', { name: /Trabajo/ }).click()
    await alta.getByPlaceholder('Ej. Jr. Sucre 412').fill(LINEA)
    await alta
      .getByPlaceholder(/Frente a la bodega de don Carlos/)
      .fill('Portón azul al costado del taller')
    await alta.getByRole('button', { name: 'Guardar dirección' }).click()
    await expect(alta).toBeHidden()

    const tarjeta = tarjetaDe(page)
    await expect(tarjeta).toBeVisible()
    // La «Casa» del seed sigue mandando: un alta que no es la primera no roba
    // la predeterminada. Se afirma por el botón que SOLO existe cuando la
    // tarjeta no es la predeterminada; buscar el texto de la insignia no vale,
    // porque `getByText` ignora mayúsculas y «Predeterminada» casa también con
    // el botón «Hacer predeterminada» de esta misma tarjeta.
    await expect(tarjeta.getByRole('button', { name: /Hacer predeterminada/ })).toBeVisible()

    // ── La edición que destruía la medida ────────────────────────────────────
    await tarjeta.getByRole('button', { name: /Editar/ }).click()
    const edicion = page.getByRole('dialog', { name: 'Editar dirección' })
    // MITAD 1 — al abrir. Antes decía «ajustada a mano»: la precisión guardada
    // no se leía, así que el formulario ya empezaba mintiendo. Es el eslabón
    // del que cuelga todo lo demás: lo que no se relee, se pierde al guardar.
    await expect(edicion.getByText(`GPS ±${PRECISION_M} m`)).toBeVisible({ timeout: 20_000 })

    await edicion.getByRole('button', { name: /Otro/ }).click()
    await edicion.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(edicion).toBeHidden()

    // MITAD 2 — al releer. Es la que prueba que el UPDATE no pisó la columna:
    // la medida llega hasta aquí después de un guardado que no tocó el mapa.
    await tarjetaDe(page)
      .getByRole('button', { name: /Editar/ })
      .click()
    const revision = page.getByRole('dialog', { name: 'Editar dirección' })
    await expect(revision.getByText(`GPS ±${PRECISION_M} m`)).toBeVisible({ timeout: 20_000 })

    // ── Limpieza ─────────────────────────────────────────────────────────────
    await revision.getByRole('button', { name: 'Eliminar dirección' }).click()
    await expect(page.getByText(LINEA)).toBeHidden()
  })
})
