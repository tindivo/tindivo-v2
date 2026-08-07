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

  // La sesión queda lista cuando el header deja de ofrecer "Ingresar".
  await expect(page.getByLabel('Ingresar')).toBeHidden()
}

test.describe('camino feliz — cliente hasta el punto de pago', () => {
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
    // su modificador viajaron: 45 (pollo) + 3 (extra queso) + 2 (delivery) = 50.
    const confirmar = page.getByRole('button', { name: /Confirmar pedido/ })
    await expect(confirmar).toBeEnabled()
    await expect(confirmar).toContainText('50')

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
    const order = await expect
      .poll(
        async () => {
          const { data } = await db
            .from('orders')
            .select('id, short_id, status, order_amount, delivery_fee, business_id')
            .eq('customer_user_id', E2E.CUSTOMER_USER_ID)
            .maybeSingle()
          return data
        },
        {
          timeout: 20_000,
          message: () =>
            `el pedido no apareció en la DB. Fallos de API: ${fallosApi.join(' | ') || '(ninguno)'}`,
        },
      )
      .not.toBeNull()
      .then(async () => {
        const { data } = await db
          .from('orders')
          .select('id, short_id, status, order_amount, delivery_fee, business_id')
          .eq('customer_user_id', E2E.CUSTOMER_USER_ID)
          .single()
        return data
      })

    // ASSERT del estado inicial y de los montos.
    expect(order.status).toBe('pending_acceptance')
    expect(order.business_id).toBe(E2E.BUSINESS_ID)
    expect(Number(order.order_amount)).toBe(48) // 45 pollo + 3 extra queso
    expect(Number(order.delivery_fee)).toBe(2)
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
