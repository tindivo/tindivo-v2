/**
 * El vecino que el pueblo ya conoce paga contraentrega. (Migración 0171)
 *
 * QUÉ AMARRA. `create_customer_order` exigía prepago a todo el que no tuviera un
 * pedido `delivered` ATADO A SU CUENTA. En el piloto eso es casi todo el mundo:
 * de los 75 teléfonos con entregas en v2, 72 las tienen con `customer_user_id
 * NULL` porque el pedido lo tecleó la cajera; y hay 591 teléfonos más cuyo
 * historial vive en el ETL del v1 (`address_directory.legacy_address_id`). La
 * 0171 hace que esas dos formas de historial cuenten.
 *
 * LOS TRES CASOS QUE NO SON DE ADORNO:
 *
 *  · La fila de directorio NACIDA EN V2 no vale. La 0145 hace que la cajera cree
 *    la fila al TOMAR el pedido, no al entregarlo. Si "estar en el directorio"
 *    bastara, cualquiera se acuñaría confianza llamando una vez al restaurante.
 *    Sin este test, "simplificar" el predicado a `exists(address_directory)`
 *    también pasaría.
 *
 *  · `p_customer_phone` NO decide. Lo manda el navegador y la función nunca lo
 *    compara contra el perfil. En un pueblo donde te sabes el número del vecino,
 *    un gate sobre el parámetro sería regalar contraentrega a quien teclee el
 *    número de al lado. El teléfono sale de `customer_profiles`.
 *
 *  · `contraentrega_blocked` gana al historial. Ese flag no lo hacía cumplir
 *    NADIE en la DB antes de 0171 (solo el frontend). Si se pierde, un cliente
 *    restringido vuelve a saltárselo llamando a la RPC directo.
 *
 * POR QUÉ CLIENTES PROPIOS Y NO LOS DEL SEED E2E. Estos tests necesitan un
 * cliente SIN historial, y `delivered` es terminal: la primera suite que lleva a
 * `e2e...003` hasta la entrega le deja historial PARA SIEMPRE en la base local,
 * y el caso negativo pasa a dar verde por el motivo equivocado. Cada test crea
 * sus propias cuentas con teléfonos únicos y las borra al final.
 */
import { createClient } from '@supabase/supabase-js'
import { signOutLocal } from '@tindivo/supabase'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

/** Anon key del stack local del CLI. Pública, igual que la de `e2e-fixtures`. */
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CLAVE = 'test-password-12345'

const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

/** Verificadas dentro del polígono de cobertura (ver `e2e-fixtures.ts`). */
const LAT = -9.151
const LNG = -78.28

interface Cliente {
  id: string
  /** 9 dígitos, el formato de `orders.customer_phone` y `address_directory`. */
  tel9: string
}

const clientesCreados: Cliente[] = []
const pedidosCreados: string[] = []
const directorioCreado: string[] = []
const strikesCreados: string[] = []

/** `^9\d{8}$`, que es lo que exigen el CHECK del directorio y la 0171. */
function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

/**
 * Cliente con WhatsApp verificado y sin historial de ningún tipo.
 * El perfil guarda E.164 (`+51...`) a propósito: es como está en prod, y es lo
 * que obliga a la 0171 a normalizar antes de comparar.
 */
async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const { data: auth, error: authErr } = await db.auth.admin.createUser({
    email: `contraentrega-${tel9}@integration.local`,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Integración' },
  })
  if (authErr) throw new Error(`no se pudo crear el auth user: ${authErr.message}`)

  const cliente = { id: auth.user.id, tel9 }
  const { error } = await db.from('customer_profiles').insert({
    user_id: cliente.id,
    full_name: 'Vecino Integración',
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (error) throw new Error(`no se pudo crear el perfil: ${error.message}`)

  clientesCreados.push(cliente)
  return cliente
}

async function pedirContraentrega(cliente: Cliente, telefonoEnviado?: string) {
  return db.rpc('create_customer_order', {
    p_customer_user_id: cliente.id,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: 'pending_cash',
    p_customer_name: 'Vecino',
    p_customer_phone: telefonoEnviado ?? cliente.tel9,
    p_delivery_address: 'Jr. Los Pinos 123',
    p_delivery_reference: 'Portón azul, frente al parque',
    p_delivery_lat: LAT,
    p_delivery_lng: LNG,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_client_pays_with: 50,
  })
}

/** Un pedido ya entregado, tal como lo deja la cajera: sin cuenta detrás. */
async function sembrarEntregaManual(tel9: string, opts: { conCuenta?: string } = {}) {
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: BUSINESS_ID,
      customer_user_id: opts.conCuenta ?? null,
      source: opts.conCuenta ? 'customer_pwa' : 'business_manual',
      status: 'delivered',
      delivery_method: 'delivery',
      payment_intent: 'pending_cash',
      customer_name: 'Vecino de siempre',
      customer_phone: tel9,
      order_amount: 20,
      delivery_fee: 2,
    })
    .select('id, customer_user_id')
    .single()
  if (error) throw new Error(`no se pudo sembrar la entrega: ${error.message}`)
  pedidosCreados.push(data.id)
  return data
}

/** Una fila de directorio. `legacy` decide si es del ETL del v1 o nacida aquí. */
async function sembrarDirectorio(tel9: string, legacy: boolean) {
  const { data, error } = await db
    .from('address_directory')
    .insert({
      phone: tel9,
      reference: 'Casa de dos pisos junto a la bodega',
      source: legacy ? 'backfill' : 'business_created',
      legacy_address_id: legacy ? crypto.randomUUID() : null,
      imported_at: legacy ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`no se pudo sembrar el directorio: ${error.message}`)
  directorioCreado.push(data.id)
  return data.id
}

/** Strikes por no-show, anclados al teléfono. El umbral por defecto es 2. */
async function sembrarStrikes(tel9: string, cuantos: number) {
  const filas = Array.from({ length: cuantos }, () => ({ phone: tel9, reason: 'no_show' }))
  const { data, error } = await db.from('customer_strikes').insert(filas).select('id')
  if (error) throw new Error(`no se pudieron sembrar los strikes: ${error.message}`)
  for (const s of data ?? []) strikesCreados.push(s.id)
}

async function borrarPedido(id: string) {
  await db.from('domain_events').delete().eq('aggregate_id', id)
  await db.from('order_event_log').delete().eq('order_id', id)
  await db.from('customer_order_items').delete().eq('order_id', id)
  await db.from('orders').delete().eq('id', id)
}

describe('0171 · el historial de entregas del teléfono abre la contraentrega', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('id', BUSINESS_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
  })

  afterEach(async () => {
    for (const id of pedidosCreados.splice(0)) await borrarPedido(id)
    for (const id of directorioCreado.splice(0)) {
      await db.from('address_directory').delete().eq('id', id)
    }
    for (const id of strikesCreados.splice(0)) {
      await db.from('customer_strikes').delete().eq('id', id)
    }
  })

  afterAll(async () => {
    for (const c of clientesCreados.splice(0)) {
      await db.from('customer_profiles').delete().eq('user_id', c.id)
      // LAS DOS TABLAS. `public.users` NO tiene foreign key a `auth.users`, así
      // que borrar el de auth deja el espejo vivo — y con él su `user_roles`.
      // Aquí se dejaban 116 filas muertas antes de que nadie lo mirara.
      await db.from('users').delete().eq('id', c.id)
      await db.auth.admin.deleteUser(c.id)
    }
  })

  it('sin ningún historial, sigue exigiendo prepago', async () => {
    const cliente = await crearCliente()

    const { error } = await pedirContraentrega(cliente)

    expect(error?.message).toContain('Pago adelantado requerido')
  })

  it('una entrega MANUAL de su teléfono le abre la contraentrega', async () => {
    const cliente = await crearCliente()
    // El pedido de la cajera: entregado, y sin cuenta que lo ate al cliente.
    const manual = await sembrarEntregaManual(cliente.tel9)
    expect(manual.customer_user_id, 'el caso pierde sentido si tiene cuenta').toBeNull()

    const { data, error } = await pedirContraentrega(cliente)

    expect(error, `debería entrar: ${error?.message}`).toBeNull()
    const creado = data as { id: string; status: string }
    pedidosCreados.push(creado.id)
    expect(creado.status).toBe('pending_acceptance')
  })

  it('una fila del directorio VENIDA DEL ETL le abre la contraentrega', async () => {
    const cliente = await crearCliente()
    await sembrarDirectorio(cliente.tel9, true)

    const { data, error } = await pedirContraentrega(cliente)

    expect(error, `debería entrar: ${error?.message}`).toBeNull()
    pedidosCreados.push((data as { id: string }).id)
  })

  it('una fila del directorio NACIDA EN V2 no le abre nada', async () => {
    const cliente = await crearCliente()
    // Lo que crea la cajera al TOMAR el pedido. No prueba que se entregara.
    await sembrarDirectorio(cliente.tel9, false)

    const { error } = await pedirContraentrega(cliente)

    expect(error?.message).toContain('Pago adelantado requerido')
  })

  it('teclear el teléfono del vecino conocido no hereda su historial', async () => {
    const vecino = await crearCliente()
    const oportunista = await crearCliente()
    // El vecino de al lado sí tiene historial...
    await sembrarEntregaManual(vecino.tel9)

    // ...pero quien pide es otra cuenta, que manda ESE número como parámetro.
    const { error } = await pedirContraentrega(oportunista, vecino.tel9)

    expect(error?.message, 'el parámetro no puede decidir').toContain('Pago adelantado requerido')
  })

  it('el historial propio de la cuenta sigue valiendo (no hay regresión)', async () => {
    const cliente = await crearCliente()
    // Con OTRO teléfono: lo que avala aquí es la cuenta, no el número.
    await sembrarEntregaManual(telefonoNuevo(), { conCuenta: cliente.id })

    const { data, error } = await pedirContraentrega(cliente)

    expect(error, `debería entrar: ${error?.message}`).toBeNull()
    pedidosCreados.push((data as { id: string }).id)
  })

  it('los strikes del teléfono anulan el historial del teléfono', async () => {
    const cliente = await crearCliente()
    await sembrarEntregaManual(cliente.tel9)
    // Dos no-shows: el umbral por defecto de `app_settings.strikes`.
    await sembrarStrikes(cliente.tel9, 2)

    const { error } = await pedirContraentrega(cliente)

    expect(error?.message).toContain('Pago adelantado requerido')
  })

  /**
   * El wrapper es lo que pinta la pantalla de pago. Si le falta el GRANT a
   * `authenticated` —el paso que 0009 y 0100 hacen fácil de olvidar—, el
   * checkout recibe "permission denied for function" y ofrece prepago a todo el
   * mundo sin que nada más falle. Por eso este caso va con sesión REAL de
   * navegador, no con `service_role`.
   */
  it('el checkout puede preguntar por sí mismo, y solo por sí mismo', async () => {
    const cliente = await crearCliente()
    await sembrarEntregaManual(cliente.tel9)

    const navegador = createClient('http://127.0.0.1:54321', LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: loginError } = await navegador.auth.signInWithPassword({
      email: `contraentrega-${cliente.tel9}@integration.local`,
      password: CLAVE,
    })
    expect(loginError, `no se pudo iniciar sesión: ${loginError?.message}`).toBeNull()

    const { data, error } = await navegador.rpc('current_customer_trusted_for_contraentrega')
    expect(error, `falta el grant a authenticated: ${error?.message}`).toBeNull()
    expect(data).toBe(true)

    // Y el predicado crudo NO se le expone: preguntaría por cuentas ajenas.
    const { error: prohibido } = await navegador.rpc('customer_trusted_for_contraentrega', {
      p_customer_user_id: cliente.id,
    })
    expect(prohibido?.message ?? '').toMatch(/permission denied|does not exist/i)

    // `signOutLocal`, no `auth.signOut()`: a secas usa scope GLOBAL, y
    // `pnpm check:auth` lo rechaza en todo el repo — tambien en los tests, para
    // que nadie copie de aqui el patron que la regla existe para impedir.
    await signOutLocal(navegador)
  })

  it('`contraentrega_blocked` gana al historial', async () => {
    const cliente = await crearCliente()
    await sembrarEntregaManual(cliente.tel9)
    await db
      .from('customer_profiles')
      .update({ contraentrega_blocked: true })
      .eq('user_id', cliente.id)

    const { error } = await pedirContraentrega(cliente)

    expect(error?.message).toContain('Pago adelantado requerido')
  })
})
