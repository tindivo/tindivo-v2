import { execFileSync } from 'node:child_process'
import { expect, type Page, test } from '@playwright/test'
import { localClient } from '../apps/api/lib/__tests__/helpers/local-db.ts'
import { E2E } from '../apps/api/scripts/e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const db = localClient as any

/** Corre un script del monorepo. `pnpm` en Windows necesita shell. */
function pnpm(script: string): void {
  execFileSync('pnpm', [script], { stdio: 'pipe', shell: true })
}

/**
 * ¿Está viva la promo de envío gratis (0187) en ESTA base, ahora mismo?
 *
 * Este test afirma importes, y el envío vale S/2 o S/0 según la promo. Fijar el
 * número a mano lo hace mentir la mitad del tiempo: durante la ventana del
 * lanzamiento el envío es gratis DE VERDAD, y a partir del 29 de agosto vuelve a
 * costar. Se deriva del estado real en vez de elegir un bando.
 *
 * Ojo con una trampa del entorno: `pnpm test` (vitest) APAGA la promo en la base
 * local a propósito —ver `apps/api/vitest.global-setup.ts`—, así que el mismo
 * test puede tomar una rama u otra según qué corriste antes. Las dos son
 * correctas; por eso se comprueban las dos.
 *
 * Usa la misma definición de ventana que la RPC: jornada operativa
 * (`current_service_date`, corte 05:00 Lima), no la fecha natural.
 */
async function promoVivaEnLaBase(): Promise<boolean> {
  const { data: cfg } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'promo_free_delivery')
    .maybeSingle()
  if (cfg?.value?.active !== true) return false
  const { data: jornada } = await db.rpc('current_service_date')
  return typeof jornada === 'string' && jornada >= cfg.value.from && jornada <= cfg.value.to
}

/**
 * Camino feliz — PRIMERA MITAD (cliente).
 *
 * Recorre: entrar → ver el menú del negocio sembrado → agregar un producto CON
 * modificador al carrito → llegar a la pantalla de pago.
 *
 * PUNTO DE PARADA: la pantalla de checkout cargada, con el producto correcto y el
 * botón `Confirmar pedido` habilitado. Es decir "el cliente llegó al punto de pago"
 * SIN crear el pedido todavía.
 *
 * La segunda mitad (confirmar pedido → aceptación en negocios → entrega en
 * motorizados) va en otro test: ver la nota al final del archivo.
 *
 * Requiere el mundo sembrado: `pnpm db:seed:e2e`.
 * No hace falta limpiar transaccionales porque este test aún no crea pedidos.
 */

/** Login por email+contraseña. El OTP telefónico NO interviene: el seed dejó
 *  `phone_verified_at` puesto, así que no aparece la verificación. */
async function login(page: Page): Promise<void> {
  await page.goto('/entrar')

  // `/entrar` es un stepper (method -> email-signup -> login) que mantiene todos
  // los paneles montados pero INERTES (`tabindex="-1"`, submit deshabilitado)
  // hasta llegar al suyo. Hay que ir explícitamente al de login: "Ingresar con
  // correo" lleva a CREAR CUENTA, mientras "Iniciar sesión" es el que abre login.
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()

  // Siguen montados DOS formularios con los mismos placeholders (crear cuenta y
  // login), así que hay que acotar al de login por su encabezado.
  const formLogin = page.locator('form').filter({ hasText: 'Hola de nuevo' })

  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()

  // ── La sesión tiene que EXISTIR antes de seguir ──────────────────────────
  //
  // Aquí había `expect(page.getByLabel('Ingresar')).toBeHidden()`, y era una
  // aserción VACUA: ese control vive en la cabecera del catálogo
  // (`features/catalog/components/home-header.tsx:46`) y en `/entrar` no existe.
  // En Playwright, `toBeHidden()` sobre un elemento inexistente pasa al
  // instante, así que no esperaba nada ni comprobaba nada.
  //
  // Consecuencia medida: el test seguía a `/negocio/...` con el login TODAVÍA
  // EN VUELO. Cuando la navegación ganaba la carrera, la app quedaba sin sesión,
  // "Ir a pagar" caía en la compuerta `auth` —que abre una hoja en vez de
  // navegar— y el test moría 50 líneas después, en el `toHaveURL(/checkout/)`,
  // sin una sola llamada de API fallida que delatara el motivo.
  //
  // El login NUNCA estuvo roto: instrumentado da `/auth/v1/token` 200 y cookie
  // creada. Lo que faltaba era esperarlo.
  //
  // Ahora se afirma sobre la COOKIE DE SESIÓN, que no puede existir sin un login
  // real. Nada de `toBeHidden`/`toBeVisible` sobre elementos que quizá no estén
  // en la página: eso es lo que hizo vacua a la anterior.
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 20_000 })
  await expect
    .poll(
      async () => (await page.context().cookies()).some((c) => c.name === 'tindivo-customer-auth'),
      { timeout: 15_000, message: 'no se creó la cookie de sesión del cliente tras el login' },
    )
    .toBe(true)
}

test.describe('camino feliz — cliente hasta el punto de pago', () => {
  // GPS del navegador, que un cliente real SIEMPRE aporta y Chromium headless no.
  //
  // Sin esto el checkout manda método de GPS sin coordenadas y
  // `create_customer_order` lo rechaza con 422 «Coordenadas GPS del cliente
  // incompletas» (guard de 0082, líneas 352-355). No es un defecto de la app:
  // es que al test le faltaba una capacidad del entorno.
  //
  // Se usan las mismas coordenadas que la dirección sembrada para no caer en la
  // rama de aviso por distancia (>0.4 km) y medir el camino feliz de verdad.
  test.use({
    geolocation: { latitude: -9.151, longitude: -78.28 },
    permissions: ['geolocation'],
  })

  // ETAPA 0 — este test SÍ crea pedidos, así que necesita mundo fresco antes y
  // purga de transaccionales después. El mundo (negocio, menú, driver, cliente)
  // sobrevive a la limpieza; solo se borran los pedidos del cliente de prueba.
  test.beforeAll(() => pnpm('db:seed:e2e'))
  test.afterAll(() => pnpm('db:seed:e2e:clean'))

  test('arma un pedido con modificador y llega a checkout', async ({ page }) => {
    const errores: string[] = []
    page.on('pageerror', (e) => errores.push(e.message))

    // Toda respuesta no-2xx de la API se recoge con su cuerpo: si el pedido no se
    // crea, el motivo real está aquí y no en el DOM.
    const fallosApi: string[] = []
    page.on('response', async (res) => {
      if (res.url().includes('/api/v1/') && !res.ok()) {
        fallosApi.push(`${res.status()} ${res.url()} :: ${await res.text().catch(() => '?')}`)
      }
    })

    // ── 1. Entrar ────────────────────────────────────────────────────────────
    await login(page)

    // ── 2. Abrir el negocio sembrado y ver su menú ───────────────────────────
    await page.goto(`/negocio/${E2E.BUSINESS_ID}`)
    await expect(page.getByText(E2E.BUSINESS_NAME).first()).toBeVisible()
    await expect(page.getByText(E2E.ITEM_POLLO_NAME).first()).toBeVisible()

    // ── 3. Agregar al carrito el item que TIENE modificadores ────────────────
    // Se abre su ficha desde el nombre del producto (el botón "Añadir al pedido"
    // del carrusel salta el modal y por tanto los modificadores).
    await page.getByText(E2E.ITEM_POLLO_NAME).first().click()

    // El modal expone el grupo "Extras" con sus opciones.
    const queso = page.getByText(E2E.MODOPT_QUESO_NAME).first()
    await expect(queso).toBeVisible()
    await queso.click()

    // El botón lleva el total: "Agregar · S/ 48.00" (45 del pollo + 3 del queso).
    const agregar = page.getByRole('button', { name: /^Agregar ·/ })
    await expect(agregar).toBeEnabled()
    await agregar.click()

    // ── 4. Ir a pagar ────────────────────────────────────────────────────────
    const irAPagar = page.getByRole('button', { name: 'Ir a pagar' })
    await expect(irAPagar).toBeVisible()
    await irAPagar.click()

    // ── 5. PUNTO DE PARADA: pantalla de pago lista ───────────────────────────
    // Si el carrito no pasa a checkout, el motivo suele estar en una llamada de
    // validación fallida (el carrito se valida contra el catálogo del backend).
    expect(fallosApi, `fallos de API antes de checkout: ${fallosApi.join(' | ')}`).toHaveLength(0)
    await expect(page).toHaveURL(/\/checkout/)

    // El CTA de creación del pedido lleva el total y está habilitado: el cliente
    // llegó al punto de pago y PUEDE confirmar. El total demuestra que el item y
    // su modificador viajaron: 45 (pollo) + 3 (extra queso) = 48, más el envío.
    //
    // El envío depende de la promo (0187), igual que el ASSERT de más abajo: con
    // la promo viva el CTA dice S/ 48.00 y sin ella S/ 50.00. Se deriva del
    // estado real de la base en vez de fijar un número que caduca el 29 de
    // agosto. `promoVivaEnLaBase()` está definido junto al otro uso.
    const confirmar = page.getByRole('button', { name: /Confirmar pedido/ })
    await expect(confirmar).toBeEnabled()
    const conPromo = await promoVivaEnLaBase()
    await expect(confirmar).toContainText(conPromo ? '48' : '50')

    if (conPromo) {
      // La promo se PINTA, no solo se descuenta: el envío nominal tachado y la
      // palabra GRATIS. Es lo único que amarra el render de la promo de punta a
      // punta; el resto de la suite mira la base, no la pantalla.
      await expect(page.getByText('GRATIS')).toBeVisible()
      await expect(page.getByText(/Promo de lanzamiento/)).toBeVisible()
    }

    // ── 6. ETAPA 1: confirmar el pedido ──────────────────────────────────────
    // Se espera la respuesta del POST de creación en vez de un cambio de UI: da
    // el status y el cuerpo, así que si falla el motivo queda a la vista.
    const [respCrear] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && /\/api\/v1\/.*orders/.test(r.url()),
        { timeout: 20_000 },
      ),
      confirmar.click(),
    ])
    const cuerpoCrear = await respCrear.text().catch(() => '?')
    expect(respCrear.ok(), `POST de creación devolvió ${respCrear.status()}: ${cuerpoCrear}`).toBe(
      true,
    )

    // El pedido existe cuando aparece en la DB. Se espera por la fila en vez de
    // por un elemento de UI: es el hecho que importa y no depende del render.
    //
    // Se pide EL MÁS RECIENTE, no «el único». Con `.maybeSingle()` bastaba con que
    // el cliente e2e arrastrase un pedido de otra corrida para que PostgREST
    // devolviese null por tener dos filas, y entonces el poll agotaba su tiempo
    // con el mensaje «el pedido no apareció en la DB» — justo lo contrario de lo
    // que pasaba. Un fallo que señala al sitio equivocado cuesta más que uno que
    // no ocurre.
    const leerUltimoPedido = async () => {
      const { data } = await db
        .from('orders')
        .select(
          'id, short_id, status, order_amount, delivery_fee, delivery_fee_source, business_id',
        )
        .eq('customer_user_id', E2E.CUSTOMER_USER_ID)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    }

    const order = await expect
      .poll(leerUltimoPedido, {
        timeout: 20_000,
        message: () =>
          `el pedido no apareció en la DB. Fallos de API: ${fallosApi.join(' | ') || '(ninguno)'}`,
      })
      .not.toBeNull()
      .then(leerUltimoPedido)

    // ASSERT del estado inicial y de los montos.
    expect(order.status).toBe('pending_acceptance')
    expect(order.business_id).toBe(E2E.BUSINESS_ID)
    expect(Number(order.order_amount)).toBe(48) // 45 pollo + 3 extra queso

    // EL ENVÍO DEPENDE DE SI LA PROMO ESTÁ VIVA (0187), y por eso no se
    // hardcodea. Durante la ventana del lanzamiento el envío de este pedido es
    // S/0 de verdad — el producto se comporta así, y un `toBe(2)` fijo estaría
    // afirmando algo falso. Pero el 29 de agosto vuelve a ser S/2, así que
    // hardcodear 0 sería igual de frágil, solo que en la otra dirección.
    //
    // Se deriva del estado real de la base. `delivery_fee_source` es lo que
    // distingue los dos mundos sin ambigüedad, así que se comprueba también:
    // un S/0 con source 'system' sería otro bug (un envío perdido), no la promo.
    const promoViva = await promoVivaEnLaBase()

    if (promoViva) {
      expect(Number(order.delivery_fee)).toBe(0)
      expect(order.delivery_fee_source).toBe('promo')
      console.log('  🎟️  promo de envío gratis ACTIVA: el pedido nace con envío S/0')
    } else {
      expect(Number(order.delivery_fee)).toBe(2)
      expect(order.delivery_fee_source).toBe('system')
    }
    // Invariante #1 de CLAUDE.md: short_id de 8 chars, sin I/O/0/1.
    expect(order.short_id).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)

    // ASSERT de los items: el producto Y su modificador viajaron a la DB.
    const { data: items } = await db
      .from('customer_order_items')
      .select(
        'item_name_snapshot, quantity, line_total, customer_order_item_modifiers(option_name_snapshot)',
      )
      .eq('order_id', order.id)

    expect(items).toHaveLength(1)
    expect(items[0].item_name_snapshot).toBe(E2E.ITEM_POLLO_NAME)
    expect(items[0].quantity).toBe(1)
    expect(
      items[0].customer_order_item_modifiers.map(
        (m: { option_name_snapshot: string }) => m.option_name_snapshot,
      ),
    ).toContain(E2E.MODOPT_QUESO_NAME)

    expect(errores, `errores de página: ${errores.join(' | ')}`).toHaveLength(0)
  })
})

/**
 * SIGUIENTE PASO (segunda mitad), fuera de este test:
 *   1. Pulsar `Confirmar pedido` -> el pedido nace en `pending_acceptance`.
 *      Assert contra la DB local: fila en `orders` con el `customer_order_items`
 *      y su modificador, y `short_id` de 8 chars.
 *   2. Cambiar a apps/negocios (:3002) con el usuario del seed y aceptar.
 *   3. Cambiar a apps/motorizados (:3003) y recorrer hasta `delivered`.
 * Al cruzar apps hará falta `pnpm db:seed:e2e:clean` en un `afterEach`, porque
 * ese test SÍ creará pedidos.
 */
