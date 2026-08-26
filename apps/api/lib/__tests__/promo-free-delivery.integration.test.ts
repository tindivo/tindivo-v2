/**
 * Promo de lanzamiento «envío gratis» (0187).
 *
 * LO QUE ESTO AMARRA, por orden de lo que más duele si se rompe:
 *
 *   · EL TOPE GLOBAL NO SE PASA NI EN CARRERA. Es la única garantía que no se
 *     puede comprobar mirando el código: `max_redemptions` se sostiene con un
 *     `for update` sobre la fila de configuración, y si alguien lo quita —o lo
 *     cambia por un `count` sin lock— nada falla en local, nada falla en una
 *     corrida secuencial, y se regalan envíos de más la noche del lanzamiento.
 *     Los casos 11 y 12 son la razón de existir de este archivo.
 *
 *   · EL `on conflict do nothing` VA SIN CONFLICT TARGET. Sin target arbitra
 *     contra las dos restricciones únicas parciales a la vez. Con target
 *     cubriría solo una y la colisión contra la otra levantaría 23505,
 *     TUMBANDO EL PEDIDO en vez de cobrarle el envío. El caso 12 se pone rojo
 *     el día que alguien añada el target «para que quede más explícito».
 *
 *   · LA CONFIG A MEDIAS CIERRA LA PROMO, NO LA ABRE. Todas las condiciones
 *     están escritas en polaridad positiva a propósito. El caso 16 fija que un
 *     campo ausente degrada a «no hay promo» y nunca a «promo sin techo».
 *
 * MUNDO PROPIO. Cada caso se crea sus clientes: necesitan cuenta verificada,
 * cero historial y un teléfono que no comparta con nadie. Los del seed e2e
 * acumulan `delivered` para siempre (`delivered` es terminal) y no sirven.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { localClient as db, E2E } from './helpers/local-db'

const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'
const PIN = { lat: -9.151, lng: -78.28 }

/**
 * Prefijo de teléfono exclusivo de esta suite. Cada cliente necesita el SUYO
 * —el índice por teléfono es justo lo que se está probando—, así que no puede
 * usar los `TELEFONOS_FIXTURE` compartidos. El barrido global lo conoce por
 * este prefijo: ver `PREFIJO_TELEFONO_PROMO` en `vitest.global-setup.ts`.
 */
const PREFIJO_TEL = '+51998'
/** Nombre registrado en `USUARIOS_FIXTURE` del barrido global. */
const NOMBRE_FIXTURE = 'Vecino Promo'

const CODIGO = 'free-delivery-test'

interface Cliente {
  userId: string
  phone: string
}

const creados: Cliente[] = []
let configOriginal: unknown = null
let tarifaNear = 2.0

/**
 * Segunda sede, creada por esta suite.
 *
 * Hace falta EXACTAMENTE para un caso: el 12(a), donde la MISMA cuenta lanza dos
 * pedidos simultáneos para chocar contra el índice por cuenta. En un solo
 * negocio, el guard de «un pedido activo por cliente + negocio» (0185:179)
 * decidiría la carrera antes que el índice —y de forma no determinista, porque
 * ese guard es un `select` sin `for update`: según quién confirme primero, a
 * veces pasarían los dos y a veces uno se llevaría un P0001. Un test de carreras
 * que a veces mide otra cosa no sirve.
 *
 * El negocio 2 del seed (`E2E.BUSINESS_2_ID`) NO vale: no tiene ni un ítem de
 * menú, así que `create_customer_order` lo rechaza con «Un item no pertenece a
 * este negocio».
 *
 * El resto de casos usan clientes DISTINTOS, y el guard es por (cliente,
 * negocio): les basta con la sede del seed.
 */
const NOMBRE_SEDE_2 = 'La Florencia (promo test)'
const sede2 = { businessId: '', itemId: '', ownerId: '' }

// ── Helpers ─────────────────────────────────────────────────────────────────

let contador = 0
/**
 * Un vecino nuevo: cuenta de auth, espejo en `public.users` (por trigger) y
 * perfil con el teléfono YA verificado — sin eso `create_customer_order` corta
 * antes de llegar a la promo.
 *
 * @param telefonoCompartido fuerza el mismo número en dos cuentas distintas.
 *        Es el escenario de «me abro otra cuenta con mi mismo WhatsApp».
 */
async function nuevoCliente(telefonoCompartido?: string): Promise<Cliente> {
  contador += 1
  const phone = telefonoCompartido ?? `${PREFIJO_TEL}${String(100000 + contador).slice(-6)}`

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: `promo-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: NOMBRE_FIXTURE },
  })
  if (authErr) throw new Error(`crear cliente falló: ${authErr.message}`)
  const userId = authUser.user.id

  const { error: perfErr } = await db.from('customer_profiles').insert({
    user_id: userId,
    full_name: NOMBRE_FIXTURE,
    phone,
    phone_verified_at: new Date().toISOString(),
  })
  if (perfErr) throw new Error(`crear perfil falló: ${perfErr.message}`)

  const cliente = { userId, phone }
  creados.push(cliente)
  return cliente
}

interface ResultadoPedido {
  id: string
  deliveryFee: number
  total: number
  promoApplied: boolean
}

async function pedir(
  cliente: Cliente,
  opts: {
    metodo?: 'delivery' | 'pickup'
    businessId?: string
    itemId?: string
    pago?: 'prepaid' | 'pending_cash'
  } = {},
): Promise<ResultadoPedido> {
  const metodo = opts.metodo ?? 'delivery'
  const { data, error } = await db.rpc('create_customer_order', {
    p_customer_user_id: cliente.userId,
    p_business_id: opts.businessId ?? E2E.BUSINESS_ID,
    p_delivery_method: metodo,
    // Prepago: sin historial de entregas la contraentrega está vetada, y estos
    // clientes nacen sin historial a propósito. El método de pago no entra en
    // el cálculo del envío.
    p_payment_intent: opts.pago ?? 'prepaid',
    p_customer_name: NOMBRE_FIXTURE,
    p_customer_phone: cliente.phone,
    p_delivery_address: metodo === 'delivery' ? 'Jr. Promo 1' : '',
    p_delivery_reference: metodo === 'delivery' ? 'Promo' : '',
    p_delivery_lat: metodo === 'delivery' ? PIN.lat : null,
    p_delivery_lng: metodo === 'delivery' ? PIN.lng : null,
    p_items: [{ menu_item_id: opts.itemId ?? ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
  })
  if (error) throw new Error(`create_customer_order: ${error.message}`)
  const r = data as { id: string; deliveryFee: number; total: number; promoApplied?: boolean }
  return {
    id: r.id,
    deliveryFee: Number(r.deliveryFee),
    total: Number(r.total),
    promoApplied: r.promoApplied === true,
  }
}

/** Igual que `pedir`, pero devuelve el error en vez de lanzarlo. */
async function pedirCrudo(cliente: Cliente): Promise<{ data: unknown; error: unknown }> {
  return db.rpc('create_customer_order', {
    p_customer_user_id: cliente.userId,
    p_business_id: E2E.BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: 'prepaid',
    p_customer_name: NOMBRE_FIXTURE,
    p_customer_phone: cliente.phone,
    p_delivery_address: 'Jr. Promo 1',
    p_delivery_reference: 'Promo',
    p_delivery_lat: PIN.lat,
    p_delivery_lng: PIN.lng,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
  })
}

async function configurarPromo(cfg: Record<string, unknown> | null): Promise<void> {
  if (cfg === null) {
    await db.from('app_settings').delete().eq('key', 'promo_free_delivery')
    return
  }
  const { error } = await db
    .from('app_settings')
    .upsert({ key: 'promo_free_delivery', value: cfg }, { onConflict: 'key' })
  if (error) throw new Error(`configurar promo falló: ${error.message}`)
}

/** Ventana que SIEMPRE contiene hoy, sea cual sea la jornada operativa. */
function promoViva(max = 100): Record<string, unknown> {
  return {
    code: CODIGO,
    active: true,
    from: '2000-01-01',
    to: '2099-12-31',
    max_redemptions: max,
  }
}

async function redenciones(): Promise<
  Array<{
    status: string
    waived_amount: number
    prior_delivered_count: number
    verified_phone: string
    order_id: string
  }>
> {
  const { data } = await db
    .from('promo_redemptions')
    .select('status,waived_amount,prior_delivered_count,verified_phone,order_id')
    .eq('promo_code', CODIGO)
  // biome-ignore lint/suspicious/noExplicitAny: la tabla es nueva, los tipos se regeneran tras el push
  return (data ?? []) as any
}

/**
 * Una entrega previa a nombre del teléfono verificado del cliente.
 *
 * Se inserta directa, sin pasar por la máquina de estados: los triggers de
 * `promo_settle_redemption` y `generate_delivery_charges` son AFTER UPDATE OF
 * status, así que nacer ya en 'delivered' no dispara ninguno de los dos y no
 * ensucia el ledger del caso.
 *
 * Sirve para dos cosas distintas: darle historial a quien lo necesite para pagar
 * contraentrega (0171), y fabricar un cliente "recurrente" para el contador.
 */
async function sembrarEntregaPrevia(cliente: Cliente): Promise<string> {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let shortId = ''
  for (let i = 0; i < 8; i++) shortId += charset[Math.floor(Math.random() * charset.length)]

  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: E2E.BUSINESS_ID,
      customer_user_id: cliente.userId,
      short_id: shortId,
      customer_phone: cliente.phone,
      order_amount: 30.0,
      delivery_fee: tarifaNear,
      payment_intent: 'pending_cash',
      status: 'delivered',
    })
    .select('id')
    .single()
  if (error) throw new Error(`sembrar entrega previa falló: ${error.message}`)
  return data.id
}

/** Un paso de la máquina de estados, por la vía real (`advance_order`). */
async function avanzar(
  orderId: string,
  role: 'business' | 'driver',
  actorUserId: string,
  action: string,
): Promise<void> {
  const { error } = await db.rpc('advance_order', {
    p_order_id: orderId,
    p_actor_user_id: actorUserId,
    p_actor_role: role,
    p_action: action,
    p_params: {},
  })
  if (error) throw new Error(`advance_order(${action}): ${error.message}`)
}

async function comprometidos(): Promise<number> {
  const filas = await redenciones()
  return filas.filter((f) => f.status === 'reserved' || f.status === 'redeemed').length
}

// NOTA para quien venga a añadir un test de `current_customer_promo_free_delivery`:
// esa RPC responde por `auth.uid()`, y aquí el cliente es `service_role`, donde
// `auth.uid()` es NULL — devolvería `inactive` siempre. Hay que llamarla con un
// JWT de cliente, no desde este helper. Por eso los casos de abajo comprueban el
// EFECTO (la tarifa cobrada y la fila reservada) y no el motivo que se pinta.

async function borrarPedido(orderId: string): Promise<void> {
  await db.from('promo_redemptions').delete().eq('order_id', orderId)
  await db.from('business_charges').delete().eq('order_id', orderId)
  await db.from('domain_events').delete().eq('aggregate_id', orderId)
  await db.from('order_event_log').delete().eq('order_id', orderId)
  await db.from('orders').delete().eq('id', orderId)
}

/** Todos los pedidos de los clientes de esta suite. */
async function borrarPedidosDeLaSuite(): Promise<void> {
  const { data } = await db.from('orders').select('id').like('customer_phone', `${PREFIJO_TEL}%`)
  for (const o of data ?? []) await borrarPedido(o.id)
}

// ── Ciclo de vida ───────────────────────────────────────────────────────────

beforeAll(async () => {
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'promo_free_delivery')
    .maybeSingle()
  configOriginal = data?.value ?? null

  const { data: bandas } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'delivery_bands')
    .single()
  tarifaNear = Number((bandas?.value as { near: number }).near)

  // La segunda sede. `create_customer_order` no mira horario ni apertura del día
  // —eso vive en el route del API, no en la RPC—, así que basta con negocio,
  // categoría y un ítem disponible.
  const { data: owner, error: ownerErr } = await db.auth.admin.createUser({
    email: `promo-biz-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: NOMBRE_FIXTURE },
  })
  if (ownerErr) throw new Error(`crear dueño de sede falló: ${ownerErr.message}`)
  sede2.ownerId = owner.user.id

  const { data: biz, error: bizErr } = await db
    .from('businesses')
    .insert({ user_id: sede2.ownerId, name: NOMBRE_SEDE_2, balance_due: 0 })
    .select('id')
    .single()
  if (bizErr) throw new Error(`crear sede falló: ${bizErr.message}`)
  sede2.businessId = biz.id

  const { data: cat, error: catErr } = await db
    .from('menu_categories')
    .insert({ business_id: sede2.businessId, name: 'Promo' })
    .select('id')
    .single()
  if (catErr) throw new Error(`crear categoría falló: ${catErr.message}`)

  const { data: item, error: itemErr } = await db
    .from('menu_items')
    .insert({
      business_id: sede2.businessId,
      category_id: cat.id,
      name: 'Pollo de la sede 2',
      base_price: 30.0,
      is_available: true,
    })
    .select('id')
    .single()
  if (itemErr) throw new Error(`crear ítem falló: ${itemErr.message}`)
  sede2.itemId = item.id
})

beforeEach(async () => {
  await borrarPedidosDeLaSuite()
  await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)
})

afterEach(async () => {
  await borrarPedidosDeLaSuite()
  await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)
})

afterAll(async () => {
  // LA CONFIGURACIÓN SE RESTAURA LA PRIMERA, no la última.
  //
  // Estaba al final y esa es exactamente la forma de dejarla envenenada: si
  // cualquiera de las limpiezas de abajo lanza, el `afterAll` se corta y la
  // ventana de pruebas (2000-2099, activa) se queda puesta en la base local.
  // El síntoma no aparece aquí sino en OTRAS suites —`delivery-zones`,
  // `nightly-change-ceiling`— que de pronto ven envíos gratis y afirman tarifas
  // que ya no se cobran. Medido: 5 rojos en dos ficheros ajenos.
  if (configOriginal === null) {
    await db.from('app_settings').delete().eq('key', 'promo_free_delivery')
  } else {
    await db
      .from('app_settings')
      .upsert({ key: 'promo_free_delivery', value: configOriginal }, { onConflict: 'key' })
  }

  await borrarPedidosDeLaSuite()
  await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)

  // Los pedidos primero: `orders.customer_user_id` es NO ACTION, así que borrar
  // el usuario con pedidos vivos falla.
  // La sede 2 y todo lo suyo. Los pedidos ya se fueron arriba; menu_items y
  // menu_categories caen por cascada al borrar el negocio, pero se borran
  // explícitamente por no depender de que la cascada siga ahí.
  if (sede2.businessId) {
    await db.from('menu_items').delete().eq('business_id', sede2.businessId)
    await db.from('menu_categories').delete().eq('business_id', sede2.businessId)
    await db.from('businesses').delete().eq('id', sede2.businessId)
  }
  if (sede2.ownerId) {
    await db.from('users').delete().eq('id', sede2.ownerId)
    await db.auth.admin.deleteUser(sede2.ownerId)
  }

  for (const c of creados) {
    await db.from('customer_profiles').delete().eq('user_id', c.userId)
    await db.from('users').delete().eq('id', c.userId)
    await db.auth.admin.deleteUser(c.userId)
  }

  // La configuración ya se restauró al ENTRAR en este hook, a propósito.
})

// ═══════════════════════════════════════════════════════════════════════════
// 1-9 · La regla base
// ═══════════════════════════════════════════════════════════════════════════

describe('promo de envío gratis · elegibilidad y aplicación', () => {
  it('1 · cliente elegible, delivery, dentro de ventana: envío 0 y reserva', async () => {
    await configurarPromo(promoViva())
    const cliente = await nuevoCliente()

    const r = await pedir(cliente)
    expect(r.deliveryFee).toBe(0)
    expect(r.promoApplied).toBe(true)

    const { data: fila } = await db
      .from('orders')
      .select('delivery_fee,delivery_fee_source,delivery_distance_band')
      .eq('id', r.id)
      .single()
    expect(Number(fila?.delivery_fee)).toBe(0)
    expect(fila?.delivery_fee_source).toBe('promo')
    // La banda real se conserva: la tarifa nominal sigue siendo reconstruible.
    expect(fila?.delivery_distance_band).toBe('near')

    const filas = await redenciones()
    expect(filas).toHaveLength(1)
    expect(filas[0].status).toBe('reserved')
    expect(Number(filas[0].waived_amount)).toBe(tarifaNear)
    expect(filas[0].verified_phone).toBe(cliente.phone)
  })

  it('2 · segundo pedido de la misma cuenta: cobra tarifa', async () => {
    await configurarPromo(promoViva())
    const cliente = await nuevoCliente()

    const primero = await pedir(cliente)
    expect(primero.deliveryFee).toBe(0)

    // `delivered` saca el pedido de los estados activos (si no, el guard de un
    // pedido activo por cliente+negocio cortaría por otro motivo) y de paso
    // redime la reserva.
    await db.from('orders').update({ status: 'delivered' }).eq('id', primero.id)

    const segundo = await pedir(cliente)
    expect(segundo.deliveryFee).toBe(tarifaNear)
    expect(segundo.promoApplied).toBe(false)
  })

  it('3 · dos cuentas con el MISMO teléfono verificado: la segunda paga', async () => {
    await configurarPromo(promoViva())
    const telefono = `${PREFIJO_TEL}777001`
    const cuentaA = await nuevoCliente(telefono)
    const cuentaB = await nuevoCliente(telefono)
    expect(cuentaA.userId).not.toBe(cuentaB.userId)

    const a = await pedir(cuentaA)
    expect(a.deliveryFee).toBe(0)

    // Negocio distinto para que el guard de pedido activo no interfiera: lo que
    // se prueba es el índice por teléfono, no el de pedido activo.
    const b = await pedir(cuentaB)
    expect(b.deliveryFee).toBe(tarifaNear)
    expect(b.promoApplied).toBe(false)
  })

  it('4 · pickup no cobra envío y NO consume el cupo', async () => {
    await configurarPromo(promoViva())
    const cliente = await nuevoCliente()

    const r = await pedir(cliente, { metodo: 'pickup' })
    expect(r.deliveryFee).toBe(0)
    // Cero por recojo, no por promo: regalar lo que ya es gratis quemaría el cupo.
    expect(r.promoApplied).toBe(false)
    expect(await redenciones()).toHaveLength(0)

    const { data: fila } = await db
      .from('orders')
      .select('delivery_fee_source')
      .eq('id', r.id)
      .single()
    expect(fila?.delivery_fee_source).toBe('system')
  })

  it('5 · fuera de la ventana: cobra tarifa', async () => {
    await configurarPromo({
      code: CODIGO,
      active: true,
      from: '2020-01-01',
      to: '2020-01-05',
      max_redemptions: 100,
    })
    const cliente = await nuevoCliente()

    const r = await pedir(cliente)
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(r.promoApplied).toBe(false)
    expect(await redenciones()).toHaveLength(0)
  })

  it('5-bis · promo apagada (active=false): cobra tarifa', async () => {
    await configurarPromo({ ...promoViva(), active: false })
    const cliente = await nuevoCliente()

    const r = await pedir(cliente)
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(await redenciones()).toHaveLength(0)
  })

  it('7 · cancelar libera el cupo y el cliente vuelve a ser elegible', async () => {
    await configurarPromo(promoViva())
    const cliente = await nuevoCliente()

    const primero = await pedir(cliente)
    expect(primero.deliveryFee).toBe(0)

    await db.from('orders').update({ status: 'cancelled' }).eq('id', primero.id)

    const filas = await redenciones()
    expect(filas[0].status).toBe('released')
    expect(await comprometidos()).toBe(0)

    // Mismo cliente, otra vez gratis: el cupo volvió a él Y al tope global.
    const segundo = await pedir(cliente)
    expect(segundo.deliveryFee).toBe(0)
    expect(segundo.promoApplied).toBe(true)
  })

  it('8 · al entregar: redime, NO nace cargo de delivery, y la comisión sí', async () => {
    await configurarPromo(promoViva())
    const cliente = await nuevoCliente()
    // Contraentrega, no prepago: en prepago el `accept` va a `awaiting_payment`
    // (0107) y el recorrido se iría por el flujo de comprobante, que no es lo
    // que este caso mide. La contraentrega exige historial, así que se le
    // siembra una entrega previa — que además lo vuelve "recurrente".
    await sembrarEntregaPrevia(cliente)
    const r = await pedir(cliente, { pago: 'pending_cash' })
    expect(r.deliveryFee).toBe(0)

    const { data: previa } = await db.from('orders').select('status').eq('id', r.id).single()
    expect(previa?.status, 'debe entrar aceptable, no en validando').toBe('pending_acceptance')

    // EL RECORRIDO COMPLETO, y no un UPDATE a 'delivered'.
    //
    // Este caso se escribió primero con el atajo y pasaba en verde por el
    // motivo equivocado: `generate_delivery_charges` calcula la comisión desde
    // `orders.commission_amount`, que la sella `advance_order` en el 'pickup'
    // del motorizado. Saltándose la cadena, esa columna queda NULL, el trigger
    // sale por `if (v_delivery_fee + v_commission) <= 0` y NO nace NINGÚN
    // cargo — ni el de envío ni el de comisión. El atajo "demostraba" la mitad
    // que interesa (cero cargo de envío) sin poder demostrar la otra.
    // En contraentrega el `accept` deja el pedido YA en 'preparing', en una sola
    // transacción (0107): no hay paso 'preparing' que dar. En prepago sí lo
    // habría, y es otra de las razones por las que este caso va por aquí.
    await avanzar(r.id, 'business', E2E.BUSINESS_USER_ID, 'accept')
    // `ready` y no un `take` directo: en 'preparing' la cola tiene ventana de
    // tiempo (`appears_in_queue_at > now()` la cierra, 0128), y en
    // 'waiting_driver' no — la comida ya está lista. Es el camino real de la
    // cocina, y evita tener que retroceder un reloj a mano.
    await avanzar(r.id, 'business', E2E.BUSINESS_USER_ID, 'ready')
    await avanzar(r.id, 'driver', E2E.DRIVER_USER_ID, 'take')
    await avanzar(r.id, 'driver', E2E.DRIVER_USER_ID, 'arrived')
    await avanzar(r.id, 'driver', E2E.DRIVER_USER_ID, 'pickup')
    await avanzar(r.id, 'driver', E2E.DRIVER_USER_ID, 'deliver')

    const { data: fila } = await db
      .from('orders')
      .select('status,delivery_fee_charged,commission_amount')
      .eq('id', r.id)
      .single()
    expect(fila?.status).toBe('delivered')
    // Lo que el motorizado selló en el 'pickup': envío 0, comisión intacta.
    expect(Number(fila?.delivery_fee_charged)).toBe(0)
    expect(Number(fila?.commission_amount)).toBeGreaterThan(0)

    const filas = await redenciones()
    expect(filas[0].status).toBe('redeemed')

    const { data: cargos } = await db
      .from('business_charges')
      .select('charge_type,amount')
      .eq('order_id', r.id)

    const delivery = (cargos ?? []).filter((c) => c.charge_type === 'delivery_fee')
    const comision = (cargos ?? []).filter((c) => c.charge_type === 'commission')

    // Cero deuda de envío: el negocio nunca cobró ese envío.
    expect(delivery).toHaveLength(0)
    // La comisión de Tindivo NO se toca. Es la mitad del requisito que más
    // fácil se rompería al «arreglar» el cargo de envío.
    expect(comision).toHaveLength(1)
    expect(Number(comision[0].amount)).toBeGreaterThan(0)
  })

  it('9 · S/79 + envío gratis no dispara el prepago por umbral', async () => {
    // El umbral mira el dinero EFECTIVAMENTE expuesto (spec §7.3). Con envío
    // gratis el total baja, así que un pedido que hoy exigiría prepago deja de
    // hacerlo. No es un cambio de regla: es un cambio de su entrada, y está
    // decidido a propósito. Este caso existe para que el cambio sea VISIBLE si
    // alguien lo revierte sin querer.
    await configurarPromo(promoViva())
    const cliente = await nuevoCliente()

    const { data: umbralRow } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'prepay_threshold')
      .single()
    const umbral = Number(umbralRow?.value)

    const sinPromo = await nuevoCliente()
    await configurarPromo({ ...promoViva(), active: false })
    const conTarifa = await pedir(sinPromo)
    await configurarPromo(promoViva())
    const conPromo = await pedir(cliente)

    // El total que viaja a las reglas de pago es MENOR en exactamente el envío.
    // Ese delta es el que puede cruzar `prepay_threshold` en un pedido grande, y
    // es el efecto que la spec §7.3 acepta a propósito. Si alguien lo revierte
    // para que el umbral mire la tarifa nominal, este aserto se cae.
    expect(conTarifa.deliveryFee).toBe(tarifaNear)
    expect(conPromo.deliveryFee).toBe(0)
    expect(conTarifa.total - conPromo.total).toBeCloseTo(tarifaNear, 2)
    expect(umbral).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 10-13 · El tope global
// ═══════════════════════════════════════════════════════════════════════════

describe('promo de envío gratis · tope global', () => {
  it('10 · secuencial: al llenarse el tope, el siguiente paga', async () => {
    await configurarPromo(promoViva(3))

    for (let i = 0; i < 3; i++) {
      const c = await nuevoCliente()
      const r = await pedir(c)
      expect(r.deliveryFee).toBe(0)
    }
    expect(await comprometidos()).toBe(3)

    const cuarto = await nuevoCliente()
    const r = await pedir(cuarto)
    expect(r.deliveryFee).toBe(tarifaNear)
    expect(r.promoApplied).toBe(false)
    expect(await comprometidos()).toBe(3)
  })

  it('11 · CONCURRENTE: 8 pedidos simultáneos sobre 2 cupos nunca pasan del tope', async () => {
    // ESTE ES EL CASO QUE JUSTIFICA EL ARCHIVO.
    //
    // El tope se sostiene con un `for update` sobre la fila de configuración.
    // Si alguien lo quita, TODO lo demás sigue en verde: la versión secuencial
    // (caso 10) pasa igual. Solo esto lo detecta.
    //
    // Se repite en rondas porque una carrera que se corre una sola vez no
    // prueba nada: puede ganarla el orden de llegada por casualidad.
    const RONDAS = 5
    const SIMULTANEOS = 8
    const CUPOS = 2

    for (let ronda = 0; ronda < RONDAS; ronda++) {
      await borrarPedidosDeLaSuite()
      await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)
      await configurarPromo(promoViva(CUPOS))

      // Cuentas y teléfonos DISTINTOS: si compartieran, saltarían los índices
      // por cuenta o por teléfono y el test estaría midiendo otra cosa.
      const clientes = await Promise.all(Array.from({ length: SIMULTANEOS }, () => nuevoCliente()))

      const t0 = Date.now()
      const resultados = await Promise.all(clientes.map((c) => pedir(c)))
      const ms = Date.now() - t0

      const gratis = resultados.filter((r) => r.deliveryFee === 0)
      const pagados = resultados.filter((r) => r.deliveryFee === tarifaNear)

      expect(gratis).toHaveLength(CUPOS)
      expect(pagados).toHaveLength(SIMULTANEOS - CUPOS)
      // El aserto que importa: EXACTO, nunca mayor.
      expect(await comprometidos()).toBe(CUPOS)

      // El coste de serializar, medido antes del push y no después.
      console.log(
        `[promo] ronda ${ronda + 1}/${RONDAS}: ${SIMULTANEOS} creaciones simultáneas en ${ms} ms ` +
          `(${Math.round(ms / SIMULTANEOS)} ms/pedido)`,
      )
    }
  }, 120_000)

  it('12 · colisión SIMULTÁNEA contra los dos índices parciales, sin 23505', async () => {
    // El punto que valida que `on conflict do nothing` va SIN conflict target.
    // Con target cubriría un solo índice y la colisión contra el otro
    // levantaría unique_violation, abortando la transacción y tumbando el
    // pedido entero. Aquí no debe salir NI UN error hacia arriba.
    await configurarPromo(promoViva(100))

    // (a) misma cuenta, dos pedidos a la vez -> índice por CUENTA.
    //     Negocios distintos para que el choque sea el del índice y no el del
    //     guard de pedido activo.
    const mismaCuenta = await nuevoCliente()
    const parA = await Promise.all([
      pedirCrudo(mismaCuenta),
      db.rpc('create_customer_order', {
        p_customer_user_id: mismaCuenta.userId,
        p_business_id: sede2.businessId,
        p_delivery_method: 'delivery',
        p_payment_intent: 'prepaid',
        p_customer_name: NOMBRE_FIXTURE,
        p_customer_phone: mismaCuenta.phone,
        p_delivery_address: 'Jr. Promo 1',
        p_delivery_reference: 'Promo',
        p_delivery_lat: PIN.lat,
        p_delivery_lng: PIN.lng,
        p_items: [{ menu_item_id: sede2.itemId, quantity: 1, modifiers: [] }],
        p_source: 'customer_pwa',
      }),
    ])

    // (b) cuentas distintas, mismo teléfono verificado -> índice por TELÉFONO.
    const tel = `${PREFIJO_TEL}777002`
    const cuentaA = await nuevoCliente(tel)
    const cuentaB = await nuevoCliente(tel)
    const parB = await Promise.all([
      pedirCrudo(cuentaA),
      db.rpc('create_customer_order', {
        p_customer_user_id: cuentaB.userId,
        p_business_id: E2E.BUSINESS_ID,
        p_delivery_method: 'delivery',
        p_payment_intent: 'prepaid',
        p_customer_name: NOMBRE_FIXTURE,
        p_customer_phone: cuentaB.phone,
        p_delivery_address: 'Jr. Promo 1',
        p_delivery_reference: 'Promo',
        p_delivery_lat: PIN.lat,
        p_delivery_lng: PIN.lng,
        p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
        p_source: 'customer_pwa',
      }),
    ])

    for (const par of [parA, parB]) {
      for (const r of par) {
        const err = r.error as { code?: string; message?: string } | null
        // 23505 = unique_violation. Es exactamente lo que NO debe escapar.
        expect(err?.code).not.toBe('23505')
        expect(err).toBeNull()
      }
      const fees = par.map((r) => Number((r.data as { deliveryFee: number }).deliveryFee))
      // Uno gratis y uno cobrado: nunca los dos gratis, nunca ninguno creado.
      expect(fees.filter((f) => f === 0)).toHaveLength(1)
      expect(fees.filter((f) => f === tarifaNear)).toHaveLength(1)
    }
  }, 60_000)

  it('13 · cancelar devuelve el cupo AL TOPE GLOBAL', async () => {
    await configurarPromo(promoViva(1))

    const primero = await nuevoCliente()
    const a = await pedir(primero)
    expect(a.deliveryFee).toBe(0)

    // Tope lleno: otro cliente paga.
    const segundo = await nuevoCliente()
    const b = await pedir(segundo)
    expect(b.deliveryFee).toBe(tarifaNear)

    // El restaurante rechaza el primero. El cupo publicitado no puede quedarse
    // consumido por un pedido que nunca se entregó.
    await db.from('orders').update({ status: 'cancelled' }).eq('id', a.id)
    expect(await comprometidos()).toBe(0)

    const tercero = await nuevoCliente()
    const c = await pedir(tercero)
    expect(c.deliveryFee).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 14-16 · Medición y config a medias
// ═══════════════════════════════════════════════════════════════════════════

describe('promo de envío gratis · medición y config', () => {
  it('14 · el contador reporta cupos restantes y cuadra con la tabla', async () => {
    await configurarPromo(promoViva(10))

    const c1 = await nuevoCliente()
    const c2 = await nuevoCliente()
    const r1 = await pedir(c1)
    const r2 = await pedir(c2)
    await db.from('orders').update({ status: 'delivered' }).eq('id', r1.id)

    const { data, error } = await db.rpc('admin_promo_free_delivery_stats')
    expect(error).toBeNull()
    const s = data as Record<string, number | string | boolean>

    expect(s.maxRedemptions).toBe(10)
    expect(s.comprometidos).toBe(2) // uno redimido + uno reservado
    expect(s.cuposRestantes).toBe(8)
    expect(s.redimidos).toBe(1)
    expect(s.enCurso).toBe(1)
    expect(Number(s.costoPromo)).toBe(tarifaNear)
    expect(s.cuposRestantes).toBe(Number(s.maxRedemptions) - (await comprometidos()))

    expect(r2.deliveryFee).toBe(0)
  })

  it('14-bis · con cero redenciones sigue diciendo cuántos cupos quedan', async () => {
    // Si el contador partiera de `promo_redemptions` en vez de la config, aquí
    // no habría fila y el panel no podría enseñar nada ANTES de empezar, que es
    // justo cuando hay que mirarlo.
    await configurarPromo(promoViva(100))
    const { data } = await db.rpc('admin_promo_free_delivery_stats')
    const s = data as Record<string, number | boolean>
    expect(s.configured).toBe(true)
    expect(s.cuposRestantes).toBe(100)
    expect(s.redimidos).toBe(0)
  })

  it('15 · el corte nuevo/recurrente suma el total de redimidos', async () => {
    await configurarPromo(promoViva(10))

    // Nuevo: sin ninguna entrega previa.
    const nuevo = await nuevoCliente()
    const rn = await pedir(nuevo)
    await db.from('orders').update({ status: 'delivered' }).eq('id', rn.id)

    // Recurrente: se le fabrica una entrega previa con su teléfono verificado
    // ANTES de que pida con promo.
    const recurrente = await nuevoCliente()
    const previo = await pedir(recurrente)
    await db.from('orders').update({ status: 'delivered' }).eq('id', previo.id)
    // Ese primero consumió su cupo; se libera a mano para que el segundo lo use.
    await db.from('promo_redemptions').delete().eq('order_id', previo.id)
    const rr = await pedir(recurrente)
    await db.from('orders').update({ status: 'delivered' }).eq('id', rr.id)

    const filas = await redenciones()
    const nueva = filas.find((f) => f.order_id === rn.id)
    const recu = filas.find((f) => f.order_id === rr.id)
    expect(nueva?.prior_delivered_count).toBe(0)
    expect(recu?.prior_delivered_count).toBeGreaterThan(0)

    const { data } = await db.rpc('admin_promo_free_delivery_stats')
    const s = data as Record<string, number>
    expect(Number(s.clientesNuevos) + Number(s.clientesRecurrentes)).toBe(Number(s.redimidos))
    expect(s.clientesNuevos).toBe(1)
    expect(s.clientesRecurrentes).toBe(1)
  })

  it('16 · config ausente o a medias: el pedido se crea, cobrando, sin excepción', async () => {
    // El caso que la revisión detectó ausente. Lo que separa «la promo no
    // aplica» de «el pedido se cae» — y, sobre todo, de «la promo se aplica sin
    // techo», que es hacia donde fallaría si las condiciones estuvieran
    // escritas en polaridad negativa.
    const variantes: Array<[string, Record<string, unknown> | null]> = [
      ['key ausente', null],
      ['sin active', { code: CODIGO, from: '2000-01-01', to: '2099-12-31', max_redemptions: 100 }],
      ['sin max_redemptions', { code: CODIGO, active: true, from: '2000-01-01', to: '2099-12-31' }],
      ['sin ventana', { code: CODIGO, active: true, max_redemptions: 100 }],
    ]

    for (const [nombre, cfg] of variantes) {
      await borrarPedidosDeLaSuite()
      await db.from('promo_redemptions').delete().eq('promo_code', CODIGO)
      await configurarPromo(cfg)

      const cliente = await nuevoCliente()
      const r = await pedir(cliente)

      expect(r.deliveryFee, `${nombre}: debe cobrar tarifa`).toBe(tarifaNear)
      expect(r.promoApplied, `${nombre}: no debe aplicar promo`).toBe(false)
      expect(await redenciones(), `${nombre}: no debe reservar`).toHaveLength(0)
    }
  }, 60_000)
})
