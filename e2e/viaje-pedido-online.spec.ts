/**
 * EL VIAJE DE UN PEDIDO ONLINE, de punta a punta y con testigos.
 *
 * Qué hace y qué NO. La COMPRA se hace por la UI real del cliente (login, ficha
 * del plato, modificador, carrito, checkout, confirmar): es el tramo que decide
 * el importe y los items, y por ahí es por donde puede romperse de verdad. Las
 * transiciones posteriores se disparan con `advance_order`, que es la MISMA RPC
 * que llaman los botones de la cajera y del motorizado — no es un atajo que se
 * salte la máquina de estados, es la máquina de estados.
 *
 * En cada parada captura lo que ve CADA actor, con su propia sesión:
 *   · el cliente en su pantalla de seguimiento
 *   · la cajera en el tablero de negocios
 *   · el motorizado en su bandeja
 *
 * Las capturas van a `e2e/.viaje/NN-*.png` y el recorrido se narra por consola
 * con el estado real leído de la DB en cada salto, no con lo que yo suponga.
 */

import { expect, type Page, test } from '@playwright/test'
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
  CUSTOMER_USER_ID: 'e2e00000-0000-4000-8000-000000000003',
  BUSINESS_ID: 'e2e00000-0000-4000-8000-000000000010',
  BUSINESS_NAME: 'La Florencia E2E',
  BUSINESS_USER_ID: 'e2e00000-0000-4000-8000-000000000001',
  DRIVER_USER_ID: 'e2e00000-0000-4000-8000-000000000002',
  DRIVER_ID: 'e2e00000-0000-4000-8000-000000000050',
  ITEM_POLLO_NAME: 'Pollo entero',
  MODOPT_QUESO_NAME: 'Extra queso',
}

const NEGOCIOS = 'http://localhost:3002'
const MOTORIZADOS = 'http://localhost:3004'

let paso = 0
async function foto(page: Page, nombre: string) {
  paso += 1
  const file = `e2e/.viaje/${String(paso).padStart(2, '0')}-${nombre}.png`
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: file })
  console.log(`  📸 ${file}`)
}

/**
 * Espera a que un código salga en una pantalla, RECARGANDO.
 *
 * Un `toBeVisible` a secas no vale aquí: los tableros refrescan por sondeo, así
 * que entre que el pedido nace y la pantalla se entera puede pasar un ciclo
 * entero, y el `expect` se planta mirando un DOM que no se va a actualizar solo
 * dentro de su ventana. Recargar es lo que hace la cajera cuando no ve algo.
 */
async function esperarEnPantalla(page: Page, texto: string, quien: string) {
  await expect
    .poll(
      async () => {
        if ((await page.getByText(texto).count()) > 0) return true
        await page.reload()
        await page.waitForTimeout(1500)
        return (await page.getByText(texto).count()) > 0
      },
      { timeout: 60_000, message: () => `${quien} nunca vio ${texto}` },
    )
    .toBe(true)
  console.log(`  ✅ ${quien} ve ${texto}`)
}

/**
 * Recarga SIEMPRE antes de mirar, y espera a que la insignia diga lo que el
 * dominio ya dice.
 *
 * `esperarEnPantalla` no sirve para retratar una transición: vuelve en cuanto
 * encuentra el código, y el código ya estaba ahí del paso anterior, así que
 * fotografía el render VIEJO. Se coló en la captura 14 —el pedido en
 * `waiting_at_restaurant` con la insignia "Motorizado en camino"— y por un
 * momento pareció un fallo del producto. La prueba tiene que ser más terca que
 * el sondeo, o acaba acusando a la pantalla de lo que hizo la prueba.
 */
async function verEstadoEnTablero(page: Page, texto: string, insignia: RegExp) {
  await expect
    .poll(
      async () => {
        await page.reload()
        await page.waitForTimeout(1200)
        const card = page.locator('div[role="button"]').filter({ hasText: texto })
        return ((await card.count()) && (await card.first().innerText()).match(insignia)) != null
      },
      { timeout: 60_000, message: () => `la tarjeta ${texto} nunca dijo ${insignia}` },
    )
    .toBe(true)
  console.log(`  ✅ la cajera ve ${texto} · ${insignia.source}`)
}

/** El estado REAL, leído de la DB. Nada de deducirlo de la pantalla. */
async function estado(shortId: string): Promise<string> {
  const { data } = await db
    .from('orders')
    .select('status, driver_id')
    .eq('short_id', shortId)
    .single()
  return `${data?.status}${data?.driver_id ? ' · con motorizado' : ''}`
}

async function avanzar(
  orderId: string,
  action: string,
  actor: 'business' | 'driver',
  params: Record<string, unknown> = {},
) {
  const { error } = await db.rpc('advance_order', {
    p_order_id: orderId,
    p_actor_user_id: actor === 'business' ? E2E.BUSINESS_USER_ID : E2E.DRIVER_USER_ID,
    p_actor_role: actor === 'business' ? 'business' : 'driver',
    p_action: action,
    p_params: params,
  })
  if (error) throw new Error(`advance_order(${action}) falló: ${error.message}`)
}

test('un pedido online viaja de la app del cliente hasta entregado', async ({ browser }) => {
  test.setTimeout(300_000)

  // ── Tres actores, tres sesiones ─────────────────────────────────────────────
  // GPS concedido: este recorrido retrata el camino NORMAL, con ubicación.
  //
  // Hasta la migración 0148 conceder el permiso no era una decisión de guion
  // sino la única forma de que el pedido naciera: sin él la app cae en
  // `manual_skip_prepaid` y `create_customer_order` devolvía 422 "Coordenadas
  // GPS del cliente incompletas". El caso sin ubicación lo cubre ahora
  // `gps-fallback-prepaid.integration.test.ts`, que es su sitio — aquí sólo
  // duplicaría 200 líneas para cambiar una opción del contexto.
  const cliente = await browser.newContext({
    viewport: { width: 430, height: 900 },
    permissions: ['geolocation'],
    geolocation: { latitude: -9.151, longitude: -78.28, accuracy: 20 },
  })
  const cajera = await browser.newContext({
    storageState: 'e2e/.auth/negocios.json',
    viewport: { width: 1440, height: 900 },
    permissions: ['notifications'],
  })
  const moto = await browser.newContext({
    storageState: 'e2e/.auth/motorizados.json',
    viewport: { width: 430, height: 900 },
  })
  const pCliente = await cliente.newPage()
  const pCajera = await cajera.newPage()
  const pMoto = await moto.newPage()

  // Deja al cliente sin pedido activo: el guard de `create_customer_order` sólo
  // permite uno abierto por cliente y negocio.
  const { data: vivos } = await db
    .from('orders')
    .select('id')
    .eq('customer_user_id', E2E.CUSTOMER_USER_ID)
    .not('status', 'in', '("delivered","cancelled")')
  for (const o of vivos ?? []) {
    await db.from('domain_events').delete().eq('aggregate_id', o.id)
    await db.from('customer_order_items').delete().eq('order_id', o.id)
    await db.from('orders').delete().eq('id', o.id)
  }

  // ── PARADA 1 · El cliente entra y arma el pedido ────────────────────────────
  console.log('\n═══ 1 · EL CLIENTE ARMA EL PEDIDO ═══')
  await pCliente.goto('http://localhost:3000/entrar')
  await pCliente.getByRole('button', { name: 'Iniciar sesión' }).click()
  const formLogin = pCliente.locator('form').filter({ hasText: 'Hola de nuevo' })
  await formLogin.getByPlaceholder('tu@correo.com').fill(E2E.CUSTOMER_EMAIL)
  await formLogin.getByPlaceholder('Tu contraseña').fill(E2E.PASSWORD)
  await formLogin.locator('button[type="submit"]').click()
  await pCliente.waitForURL((u) => !u.pathname.startsWith('/entrar'), { timeout: 20_000 })

  await pCliente.goto(`http://localhost:3000/negocio/${E2E.BUSINESS_ID}`)
  await expect(pCliente.getByText(E2E.ITEM_POLLO_NAME).first()).toBeVisible()
  await foto(pCliente, 'cliente-menu')

  await pCliente.getByText(E2E.ITEM_POLLO_NAME).first().click()
  const queso = pCliente.getByText(E2E.MODOPT_QUESO_NAME).first()
  await expect(queso).toBeVisible()
  await queso.click()
  await foto(pCliente, 'cliente-plato-y-modificador')

  const agregar = pCliente.getByRole('button', { name: /^Agregar ·/ })
  await expect(agregar).toBeEnabled()
  await agregar.click()

  // EN MÓVIL EL CARRITO NO SE ABRE IGUAL QUE EN ESCRITORIO. El `happy-path`
  // pulsa "Ir a pagar" directamente porque corre en viewport de escritorio; a
  // 430px la barra inferior dice "Ver mi bolsa · S/ 48.00" y hay que abrir la
  // bolsa antes. Se prueban los dos para que el recorrido valga en cualquier
  // tamaño, que es como lo van a usar los vecinos.
  const verBolsa = pCliente.getByRole('button', { name: /Ver mi bolsa/ })
  if (await verBolsa.isVisible().catch(() => false)) {
    await verBolsa.click()
    await foto(pCliente, 'cliente-bolsa')
  }
  await pCliente
    .getByRole('button', { name: /Ir a pagar|Continuar|Pagar/ })
    .first()
    .click()
  await expect(pCliente).toHaveURL(/\/checkout/)
  await foto(pCliente, 'cliente-checkout')

  const confirmar = pCliente.getByRole('button', { name: /Confirmar pedido/ })
  await expect(confirmar).toBeEnabled()
  const [resp] = await Promise.all([
    pCliente.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/v1\/.*orders/.test(r.url()),
      { timeout: 25_000 },
    ),
    confirmar.click(),
  ])
  expect(resp.ok(), `creación devolvió ${resp.status()}: ${await resp.text()}`).toBe(true)

  const { data: pedido } = await db
    .from('orders')
    .select('id, short_id, status, order_amount, delivery_fee, source, delivery_address')
    .eq('customer_user_id', E2E.CUSTOMER_USER_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const id = pedido.id as string
  const shortId = pedido.short_id as string

  console.log(
    `  ✅ nace #${shortId} · ${pedido.source} · S/ ${pedido.order_amount} + ${pedido.delivery_fee} envío`,
  )
  console.log(`  → estado: ${await estado(shortId)}`)
  await pCliente.waitForTimeout(2500)
  await foto(pCliente, 'cliente-pedido-creado')

  // ── PARADA 2 · Aterriza en el tablero de la cajera ──────────────────────────
  console.log('\n═══ 2 · LA CAJERA LO VE EN "NUEVOS" ═══')
  await pCajera.goto(NEGOCIOS)
  await esperarEnPantalla(pCajera, shortId, 'la cajera')
  await foto(pCajera, 'cajera-nuevos')

  // ── PARADA 3 · La cajera acepta · NO va a cocina todavía ────────────────────
  //
  // Un prepago aceptado NO pasa a `preparing`: pasa a `awaiting_payment`. La
  // comida no se empieza hasta que el dinero se ve. Es el bucle que la tarjeta
  // distingue con "Falta verificar el pago", y es el motivo de que el canal
  // online tenga un estado de cobro que el manual no tiene.
  console.log('\n═══ 3 · LA CAJERA ACEPTA · el prepago espera el comprobante ═══')
  await avanzar(id, 'accept', 'business', { prepTimeMinutes: 20 })
  console.log(`  → estado: ${await estado(shortId)}`)
  await verEstadoEnTablero(pCajera, shortId, /Esperando pago/)
  await foto(pCajera, 'cajera-esperando-pago')
  await pCliente.reload()
  await pCliente.waitForTimeout(2500)
  await foto(pCliente, 'cliente-debe-pagar')

  // ── PARADA 4 · El cliente sube el comprobante ───────────────────────────────
  // Réplica de lo que escribe `POST /customer/orders/:id/prepay-proof`. Se
  // replica en vez de llamar a la ruta porque esta sube un fichero a Storage, y
  // lo que importa aquí es el estado en que queda el pedido, no el binario.
  //
  // `validation_context: 'proof'` NO ES OPCIONAL, y omitirlo me costó una
  // corrida entera: `validate_order` decide por esa columna si está verificando
  // un COMPROBANTE (→ `preparing`, pago verificado) o levantando un hold de
  // ANTIFRAUDE (→ vuelve a `pending_acceptance`, sin tocar el pago). Sin ella
  // cae al fallback `proof_attempt >= 1`, que también hay que subir. Se ve en
  // `order_event_log`: `{"context": "antifraud", "nextStatus": "pending_acceptance"}`.
  console.log('\n═══ 4 · EL CLIENTE SUBE SU COMPROBANTE ═══')
  await db
    .from('orders')
    .update({
      status: 'validando',
      validation_context: 'proof',
      payment_proof_status: 'pending',
      comprobante_prepago_url: 'https://ejemplo.local/yape.jpg',
      proof_attempt: 1,
    })
    .eq('id', id)
  console.log(`  → estado: ${await estado(shortId)}`)
  await verEstadoEnTablero(pCajera, shortId, /Falta verificar el pago/)
  await foto(pCajera, 'cajera-falta-verificar')

  // ── PARADA 5 · La cajera verifica el pago · AHORA sí a cocina ───────────────
  console.log('\n═══ 5 · LA CAJERA VERIFICA EL PAGO · a cocina ═══')
  const { error: errVal } = await db.rpc('validate_order', {
    p_order_id: id,
    p_actor_user_id: E2E.BUSINESS_USER_ID,
    p_actor_role: 'business',
    p_pass: true,
    p_prep_time_minutes: 20,
  })
  if (errVal) throw new Error(`validate_order falló: ${errVal.message}`)
  console.log(`  → estado: ${await estado(shortId)}`)
  await verEstadoEnTablero(pCajera, shortId, /Pagado y verificado/)
  await foto(pCajera, 'cajera-en-cocina')

  // ── PARADA 4 · El motorizado lo ve en la cola y lo toma ─────────────────────
  console.log('\n═══ 4 · EL MOTORIZADO LO TOMA ═══')
  // La ventana de cola se abre cuando quedan `queue_lead_minutes`; se adelanta
  // para no esperar diez minutos reales delante de la pantalla.
  await db.from('orders').update({ appears_in_queue_at: new Date().toISOString() }).eq('id', id)
  await pMoto.goto(MOTORIZADOS)
  await pMoto.waitForTimeout(3000)
  await foto(pMoto, 'moto-bandeja')

  await avanzar(id, 'take', 'driver')
  console.log(`  → estado: ${await estado(shortId)}`)
  await pMoto.reload()
  await pMoto.waitForTimeout(2500)
  await foto(pMoto, 'moto-lo-tomo')

  // ── PARADA 5 · La comida está lista ─────────────────────────────────────────
  console.log('\n═══ 5 · COCINA LO DA POR LISTO ═══')
  await avanzar(id, 'ready', 'business')
  console.log(`  → estado: ${await estado(shortId)}`)
  await verEstadoEnTablero(pCajera, shortId, /Lista|esperando moto|Motorizado/)
  await foto(pCajera, 'cajera-comida-lista')

  // ── PARADA 6 · El motorizado llega al local y recoge ────────────────────────
  //
  // `pickup` NO se puede llamar desde `heading_to_restaurant`: exige
  // `waiting_at_restaurant`, y a ese estado se llega con `arrived`. Son dos
  // hechos distintos —"estoy en la puerta" y "ya tengo la comida"— y la cajera
  // usa el primero para saber que hay alguien esperando en el mostrador.
  console.log('\n═══ 6 · LLEGA AL LOCAL · la cajera lo ve en la puerta ═══')
  await avanzar(id, 'arrived', 'driver')
  console.log(`  → estado: ${await estado(shortId)}`)
  await verEstadoEnTablero(pCajera, shortId, /Motorizado lleg/)
  await foto(pCajera, 'cajera-moto-en-puerta')

  console.log('\n═══ 6-bis · RECOGE · sale a la calle ═══')
  await avanzar(id, 'pickup', 'driver')
  console.log(`  → estado: ${await estado(shortId)}`)
  await verEstadoEnTablero(pCajera, shortId, /En reparto/)
  await foto(pCajera, 'cajera-en-reparto')
  await pMoto.reload()
  await pMoto.waitForTimeout(2500)
  await foto(pMoto, 'moto-en-reparto')

  await pCliente.reload()
  await pCliente.waitForTimeout(2500)
  await foto(pCliente, 'cliente-en-camino')

  // ── PARADA 7 · Entregado ────────────────────────────────────────────────────
  console.log('\n═══ 7 · ENTREGADO ═══')
  await avanzar(id, 'arrived_customer', 'driver')
  await avanzar(id, 'deliver', 'driver', { paymentReal: 'paid_prepaid' })
  const final = await estado(shortId)
  console.log(`  → estado: ${final}`)
  expect(final).toContain('delivered')

  await pCajera.reload()
  await pCajera.waitForTimeout(2500)
  await foto(pCajera, 'cajera-entregado')
  await pCliente.reload()
  await pCliente.waitForTimeout(2500)
  await foto(pCliente, 'cliente-entregado')

  // ── Los items sobrevivieron el viaje ────────────────────────────────────────
  const { data: items } = await db
    .from('customer_order_items')
    .select(
      'item_name_snapshot, quantity, line_total, customer_order_item_modifiers(option_name_snapshot)',
    )
    .eq('order_id', id)
  console.log(`\n═══ RESUMEN #${shortId} ═══`)
  for (const it of items ?? []) {
    const mods = (it.customer_order_item_modifiers ?? [])
      .map((m: { option_name_snapshot: string }) => m.option_name_snapshot)
      .join(', ')
    console.log(
      `  · ${it.quantity}× ${it.item_name_snapshot}  S/ ${it.line_total}${mods ? `  (+ ${mods})` : ''}`,
    )
  }
  console.log(`  dirección guardada: ${pedido.delivery_address}`)

  // ── Barrer lo propio ────────────────────────────────────────────────────────
  //
  // NO ES COSMÉTICO. Este recorrido termina con un pedido `delivered` del par
  // motorizado-negocio e2e y SIN rendir, y `cash-summary-scope.integration.test`
  // cuenta exactamente eso para cuadrar la pantalla de efectivo contra el RPC de
  // liquidación. Su limpieza (`parkPending`) está acotada a
  // `.in('customer_phone', TELEFONOS_FIXTURE)` a propósito —sin el filtro sacaba
  // pedidos de `delivered` y rompía el invariante 8—, así que no alcanza a este.
  //
  // Medido el 2026-08-12: dejar los dos pedidos de dos corridas de este guion
  // tumbaba dos tests de caja con `expected 204 to be 104`, un número que no
  // apunta a ningún sitio útil. Quien deja basura la recoge.
  await db.from('domain_events').delete().eq('aggregate_id', id)
  await db.from('customer_order_items').delete().eq('order_id', id)
  await db.from('orders').delete().eq('id', id)
  console.log(`  🧹 #${shortId} borrado (no debe contar como efectivo sin rendir)`)
})
