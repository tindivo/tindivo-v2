/**
 * El recojo en el local, de punta a punta. (Migraciones 0219 y 0220)
 *
 * QUÉ AMARRA. El recojo existía en el enum y en media docena de ramas de SQL
 * desde el principio, pero NUNCA se había recorrido entero, y `PICKUP_ENABLED`
 * seguía apagada por un motivo escrito en el propio código: todas las
 * transiciones intermedias las escribe el motorizado, y en un recojo no hay
 * motorizado. Un pedido que se quedara a medias además dejaba al cliente
 * bloqueado para volver a pedir en ese restaurante (guard de pedido activo).
 *
 * LOS CUATRO GRUPOS DE CASOS, Y POR QUÉ NINGUNO SOBRA:
 *
 *  · QUIÉN ENTRA Y QUIÉN NO. El recojo «ahora» es el ÚNICO camino del sistema
 *    donde un cliente sin ninguna historia paga contraentrega sin GPS y sin
 *    llamada, y se sostiene sobre una sola cosa: que nadie cocina hasta que la
 *    cajera acepta, teniendo delante a quien pidió. Si alguien relaja el guard
 *    de riesgo «ya que es presencial», el canal se convierte en la puerta de
 *    atrás para todo cliente bloqueado del pueblo. Por eso el caso de strikes
 *    está aquí y no es adorno.
 *
 *  · QUE NINGÚN RECOJO ACABE EN LA COLA DE REPARTO. Antes de la 0220, un recojo
 *    en `preparing` era visible para todos los motorizados (`ord_driver_read` no
 *    miraba el método) y `take` lo aceptaba. El primero en tomarlo se iba a
 *    buscar un domicilio que no existe.
 *
 *  · QUE UN RECOJO SE PUEDA CERRAR, Y QUE COBRE. `handover` es lo que faltaba
 *    para llegar a `delivered`; sin ella `generate_delivery_charges` no veía
 *    nunca un recojo y el canal salía gratis para el negocio.
 *
 *  · QUE EL PLANTÓN CUENTE. Hasta la 0220 el único escritor de
 *    `customer_strikes` era el no-show del motorizado, así que dejar comida
 *    hecha sin recoger no tenía consecuencia y se podía repetir cada noche.
 *
 * CLIENTES PROPIOS Y NO LOS DEL SEED, por lo mismo que
 * `contraentrega-delivery-history`: estos casos necesitan gente SIN historial y
 * `delivered` es terminal, así que un cliente compartido se «gasta» en la
 * primera suite que lo entrega.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const CLAVE = 'test-password-12345'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

/** Dentro del polígono de cobertura de San Jacinto (ver `e2e-fixtures.ts`). */
const LAT = -9.151
const LNG = -78.28

interface Cliente {
  id: string
  tel9: string
}

const clientesCreados: Cliente[] = []
const pedidosCreados: string[] = []
const strikesCreados: string[] = []

function telefonoNuevo(): string {
  let t = '9'
  for (let i = 0; i < 8; i++) t += Math.floor(Math.random() * 10)
  return t
}

async function crearCliente(): Promise<Cliente> {
  const tel9 = telefonoNuevo()
  const { data: auth, error: authErr } = await db.auth.admin.createUser({
    email: `recojo-${tel9}@integration.local`,
    password: CLAVE,
    email_confirm: true,
    user_metadata: { full_name: 'Vecino Recojo' },
  })
  if (authErr) throw new Error(`no se pudo crear el auth user: ${authErr.message}`)

  const cliente = { id: auth.user.id, tel9 }
  const { error } = await db.from('customer_profiles').insert({
    user_id: cliente.id,
    full_name: 'Vecino Recojo',
    phone: `+51${tel9}`,
    phone_verified_at: new Date().toISOString(),
    contraentrega_blocked: false,
  })
  if (error) throw new Error(`no se pudo crear el perfil: ${error.message}`)

  clientesCreados.push(cliente)
  return cliente
}

interface GpsEnVivo {
  lat: number
  lng: number
  method: 'gps_high_accuracy' | 'gps_low_accuracy' | 'failed'
}

/**
 * Un recojo en efectivo, tal como lo manda el checkout.
 *
 * SIN `p_client_pays_with`: en el mostrador no se pregunta con qué billete
 * viene el cliente. Ese dato existe para el sencillo que la caja le adelanta al
 * motorizado, y aquí no hay motorizado ni adelanto.
 */
async function pedirRecojo(
  cliente: Cliente,
  timing: 'now' | 'later',
  gps?: GpsEnVivo,
  /**
   * El default es la caja porque es el caso normal del mostrador. Los otros dos
   * valores existen para los tests de la 0223: `prepaid` es el único camino de
   * un «más tarde», y `pending_yape` el que ya no existe en ningún recojo.
   */
  intent: 'pending_cash' | 'pending_yape' | 'prepaid' = 'pending_cash',
): Promise<{ data: unknown; error: { message: string } | null }> {
  return db.rpc('create_customer_order', {
    p_customer_user_id: cliente.id,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'pickup',
    p_payment_intent: intent,
    p_customer_name: 'Vecino',
    p_customer_phone: cliente.tel9,
    p_delivery_address: '',
    p_delivery_reference: '',
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_pickup_timing: timing,
    ...(gps
      ? {
          p_customer_gps_lat: gps.lat,
          p_customer_gps_lng: gps.lng,
          p_customer_gps_method: gps.method,
        }
      : {}),
  })
}

/** El pedido creado, con lo que hace falta mirar de él. */
interface PedidoCreado {
  id: string
  shortId: string
  status: string
}

function registrar(data: unknown): PedidoCreado {
  const creado = data as PedidoCreado
  pedidosCreados.push(creado.id)
  return creado
}

async function estado(orderId: string) {
  const { data, error } = await db
    .from('orders')
    .select(
      'status, pickup_timing, requires_validation, validation_reason_code, risk_flags, ' +
        'appears_in_queue_at, ready_for_pickup_at, commission_amount, delivery_fee_charged, ' +
        'tindivo_commission, cash_owed_at_delivery, payment_real, cancel_reason',
    )
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`no se pudo leer el pedido: ${error.message}`)
  return data
}

async function avanzar(
  orderId: string,
  actorUserId: string,
  role: 'business' | 'driver',
  action: string,
  params?: Record<string, unknown>,
) {
  return db.rpc('advance_order', {
    p_order_id: orderId,
    p_actor_user_id: actorUserId,
    p_actor_role: role,
    p_action: action,
    ...(params ? { p_params: params } : {}),
  })
}

/**
 * Aceptar un recojo «ahora» ES COBRARLO (0224). `advance_order` exige
 * `paymentReal` para mandarlo a cocina: el cliente está de pie en la caja y ese
 * es el único instante en que se le puede cobrar. Sin el parámetro la RPC corta
 * — que es justo lo que afirma el caso «no deja aceptarlo sin cobrarlo».
 */
async function aceptarCobrando(orderId: string, comoPago: 'paid_cash' | 'paid_yape' = 'paid_cash') {
  const { error } = await avanzar(orderId, bizUserId, 'business', 'accept', {
    prepTimeMinutes: 20,
    paymentReal: comoPago,
  })
  if (error) throw new Error(`accept falló: ${error.message}`)
}

/**
 * UN RECOJO QUE LLEGA AL MOSTRADOR SIN COBRAR, que desde la 0224 solo puede ser
 * uno: el MANUAL de la cajera.
 *
 * Los del canal cliente ya no existen sin pagar — un «más tarde» es prepago por
 * el CHECK de la 0223, y un «ahora» se cobra al aceptarlo. El que queda es el
 * que ella toma por teléfono para más tarde y cobra al entregar. Ese sí es una
 * pérdida si nadie viene (y por eso sigue dejando strike), y es el único sitio
 * donde quedan vivas las guardas de `handover` que miran `paymentReal`.
 *
 * Se siembra por SQL y no por la RPC porque `create_customer_order` es el canal
 * del cliente: un manual no pasa por ahí.
 */
async function recojoManualSinCobrar(minutos: number): Promise<{ id: string; tel9: string }> {
  const tel9 = `9${Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0')}`
  const { data, error } = await db
    .from('orders')
    .insert({
      business_id: BUSINESS_ID,
      source: 'business_manual',
      delivery_method: 'pickup',
      pickup_timing: 'later',
      payment_intent: 'pending_cash',
      customer_name: 'Vecino de la cajera',
      customer_phone: tel9,
      order_amount: 24,
      delivery_fee: 0,
      status: 'ready_for_pickup',
      prep_time_minutes: 20,
      ready_for_pickup_at: new Date(Date.now() - minutos * 60_000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  pedidosCreados.push(data.id)
  return { id: data.id, tel9 }
}

async function borrarPedido(id: string) {
  await db.from('domain_events').delete().eq('aggregate_id', id)
  await db.from('order_event_log').delete().eq('order_id', id)
  await db.from('customer_order_items').delete().eq('order_id', id)
  await db.from('business_charges').delete().eq('order_id', id)
  await db.from('customer_strikes').delete().eq('order_id', id)
  await db.from('orders').delete().eq('id', id)
}

/** `businesses.user_id` del negocio del seed: el actor de las acciones de negocio. */
let bizUserId = ''
/** Un motorizado autorizado en ese negocio, para probar que NO puede tomarlo. */
let driverUserId = ''

describe('0219/0220 · el recojo en el local', () => {
  beforeAll(async () => {
    const { data: biz } = await db
      .from('businesses')
      .select('user_id, accepts_web_pickup')
      .eq('id', BUSINESS_ID)
      .maybeSingle()
    if (!biz?.user_id) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')
    bizUserId = biz.user_id as string

    const { data: dr } = await db
      .from('driver_restaurants')
      .select('drivers(user_id)')
      .eq('business_id', BUSINESS_ID)
      .limit(1)
      .maybeSingle()
    const drv = (dr as { drivers?: { user_id?: string } } | null)?.drivers
    if (!drv?.user_id) throw new Error('Falta el motorizado del mundo e2e')
    driverUserId = drv.user_id
  })

  afterEach(async () => {
    for (const id of pedidosCreados.splice(0)) await borrarPedido(id)
    for (const id of strikesCreados.splice(0)) {
      await db.from('customer_strikes').delete().eq('id', id)
    }
  })

  afterAll(async () => {
    for (const c of clientesCreados.splice(0)) {
      await db.from('customer_profiles').delete().eq('user_id', c.id)
      // LAS DOS TABLAS: `public.users` no tiene FK a `auth.users`.
      await db.from('users').delete().eq('id', c.id)
      await db.auth.admin.deleteUser(c.id)
    }
  })

  // ── Quién entra y quién no ──────────────────────────────────────────────

  describe('el recojo «ahora»: la garantía es la persona', () => {
    /**
     * EL CASO QUE ABRE EL CANAL. Antes de la 0220 este pedido moría con «Pago
     * adelantado requerido»: el guard de contraentrega corre ANTES de ramificar
     * por método, y sin GPS `customer_gps_in_coverage` da false. O sea que el
     * mostrador estaba CERRADO al vecino que estaba de pie delante de él — el
     * problema era el contrario del que se suponía.
     */
    it('sin historial y sin GPS entra igual, porque la cajera lo tiene delante', async () => {
      const cliente = await crearCliente()

      const { data, error } = await pedirRecojo(cliente, 'now')

      expect(error, `debería entrar: ${error?.message}`).toBeNull()
      const creado = registrar(data)
      expect(creado.status).toBe('pending_acceptance')

      const fila = await estado(creado.id)
      expect(fila.pickup_timing).toBe('now')
      expect((fila.risk_flags as Record<string, unknown>).pickupNowPresence).toBe(true)
    })

    /**
     * `validando` SIGNIFICA «LA CAJERA LLAMA POR TELÉFONO», y no se llama a
     * quien está al otro lado del mostrador. Un cliente sin historial dispara
     * `standard_validation_rule` (es su primer pedido con ese teléfono), así
     * que sin la rama de la 0220 acabaría ahí — y su pedido se cancelaría solo
     * a los 5 minutos esperando una llamada que nadie iba a hacer.
     */
    it('nunca entra a `validando`, pero las señales de riesgo NO se pierden', async () => {
      const cliente = await crearCliente()

      const { data, error } = await pedirRecojo(cliente, 'now')
      expect(error).toBeNull()
      const creado = registrar(data)

      expect(creado.status).not.toBe('validando')
      const fila = await estado(creado.id)
      // El hecho se guarda aunque no cambie el estado: la tarjeta lo enseña, y
      // quien resuelve la duda es la persona que lo tiene delante.
      expect(fila.requires_validation).toBe(true)
      expect(fila.validation_reason_code).toBe('standard_validation_rule')
      expect((fila.risk_flags as Record<string, unknown>).resolvedAtCounter).toBe(true)
    })

    /**
     * EL LÍMITE DEL CANAL, Y EL CASO QUE NO SE PUEDE BORRAR.
     *
     * Estar de pie en el mostrador no levanta una sanción de cuenta. Si esta
     * rama se relaja «porque total, es presencial», el recojo se convierte en
     * la puerta de atrás de todo cliente con strikes de DECISIONS §8.
     */
    it('un cliente con strikes sigue bloqueado aunque diga estar en el local', async () => {
      const cliente = await crearCliente()
      const { data: st, error: stErr } = await db
        .from('customer_strikes')
        .insert([
          { phone: cliente.tel9, reason: 'no_show' },
          { phone: cliente.tel9, reason: 'no_show' },
        ])
        .select('id')
      if (stErr) throw new Error(stErr.message)
      for (const s of st ?? []) strikesCreados.push(s.id)

      const { error } = await pedirRecojo(cliente, 'now')

      expect(error?.message).toContain('Pago adelantado requerido')
    })
  })

  /**
   * EL RECOJO «MÁS TARDE» VA PREPAGADO Y PUNTO. (0223)
   *
   * Este bloque decía «mismo antifraude que un delivery» y probaba que el
   * crédito de GPS de la 0211 le abría la contraentrega igual. La regla del
   * restaurante lo cerró, y la razón es que un recojo «más tarde» NO es como un
   * delivery: en un delivery hay un motorizado en la puerta a quien pagarle, y
   * aquí no hay nadie. Es el único camino del sistema donde se cocina sin nadie
   * delante Y sin cobrador al final — si el cliente no viene, el plato se
   * perdió y no hay a quién reclamarle.
   *
   * Con el dinero dentro antes de encender la sartén, el plantón deja de costar
   * comida. Por eso el antifraude de contraentrega ya no se aplica en esta rama:
   * no es que se haya relajado, es que protege comida fiada y aquí no se fía.
   */
  describe('el recojo «más tarde»: va prepagado y punto', () => {
    it('sin historial y sin GPS exige prepago', async () => {
      const cliente = await crearCliente()

      const { error } = await pedirRecojo(cliente, 'later')

      expect(error?.message).toContain('Pago adelantado requerido')
    })

    /**
     * EL CASO QUE CAMBIÓ DE SIGNO, y por eso se afirma explícitamente.
     *
     * Este pedido ENTRABA hasta la 0223, a `validando`, por el crédito de GPS
     * de la 0211: cliente sin historial pero geolocalizado en San Jacinto. La
     * llamada de la cajera era la salvaguarda. Ya no basta — una llamada
     * confirma que existes, no que vayas a venir a por tu comida.
     */
    it('el crédito de GPS ya no abre la contraentrega: sigue exigiendo prepago', async () => {
      const cliente = await crearCliente()

      const { error } = await pedirRecojo(cliente, 'later', {
        lat: LAT,
        lng: LNG,
        method: 'gps_high_accuracy',
      })

      expect(error).not.toBeNull()
      expect(error?.message).toContain('orders_pickup_payment_chk')
    })

    it('prepagado sí entra, y es el único camino', async () => {
      const cliente = await crearCliente()

      const { data, error } = await pedirRecojo(cliente, 'later', undefined, 'prepaid')

      expect(error, `debería entrar: ${error?.message}`).toBeNull()
      const creado = registrar(data)

      const fila = await estado(creado.id)
      expect(fila.pickup_timing).toBe('later')
    })
  })

  /**
   * EN EL MOSTRADOR NO SE FÍA. (0223)
   *
   * El espejo en SQL de `customerPaymentIntents`. Los tests del contrato cubren
   * el mensaje legible; esto cubre el suelo, que es lo que queda si alguien
   * llega a la RPC sin pasar por el contrato.
   */
  describe('el pago que un recojo puede traer', () => {
    /**
     * `pending_yape` significa que el cliente le transfiere AL MOTORIZADO al
     * recibir la bolsa. En un mostrador no hay motorizado: cobra la caja, y la
     * caja ya declara al cerrar si entró efectivo o Yape (`payment_real`).
     * Antes esto entraba, y el sistema lo reinterpretaba en silencio como
     * «cobrar en caja» — funcionaba de casualidad.
     */
    it('rechaza el Yape contraentrega aunque el cliente esté en el mostrador', async () => {
      const cliente = await crearCliente()

      const { error } = await pedirRecojo(cliente, 'now', undefined, 'pending_yape')

      expect(error?.message).toContain('orders_pickup_payment_chk')
    })

    /**
     * LA MITAD QUE FALTA DE LA REGLA (0224). La 0223 dice CON QUÉ se puede
     * pagar; esto dice CUÁNDO. Sin el cobro declarado no se manda a cocina:
     * entre aceptar y entregar hay una cocción entera, y quien se va en ese rato
     * dejaría un plato hecho y sin pagar.
     */
    it('no deja mandar a cocina un recojo «ahora» sin cobrarlo', async () => {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      expect(error).toBeNull()
      const creado = registrar(data)

      const { error: aceptErr } = await avanzar(creado.id, bizUserId, 'business', 'accept', {
        prepTimeMinutes: 20,
      })

      expect(aceptErr?.message).toContain('Cobra el pedido antes de mandarlo a cocina')
      expect((await estado(creado.id)).status, 'sigue sin cocinarse').toBe('pending_acceptance')
    })

    it('cobrar al aceptar sella quién vio el dinero, y el pie ya no lo pregunta', async () => {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      expect(error).toBeNull()
      const creado = registrar(data)

      await aceptarCobrando(creado.id, 'paid_yape')

      const { data: fila } = await db
        .from('orders')
        .select('status, payment_real, payment_verified_at, payment_verified_by')
        .eq('id', creado.id)
        .single()
      expect(fila?.status).toBe('preparing')
      expect(fila?.payment_real).toBe('paid_yape')
      expect(fila?.payment_verified_at).not.toBeNull()
      expect(fila?.payment_verified_by).toBe(bizUserId)

      // Y al entregar NO se reescribe: el pie del mostrador ya no pregunta, así
      // que no manda `paymentReal`. Sin el COALESCE nuevo, el default
      // 'paid_cash' convertiría este Yape en efectivo y el corte de caja
      // cuadraría contra un número que nadie declaró.
      await avanzar(creado.id, bizUserId, 'business', 'ready')
      await avanzar(creado.id, bizUserId, 'business', 'handover')
      expect((await estado(creado.id)).payment_real).toBe('paid_yape')
    })

    it('un recojo «ahora» sí puede pagar en caja: hay a quién cobrarle', async () => {
      const cliente = await crearCliente()

      const { data, error } = await pedirRecojo(cliente, 'now')

      expect(error, `debería entrar: ${error?.message}`).toBeNull()
      registrar(data)
    })

    /**
     * EL DELIVERY NO SE TOCÓ. La regla es del mostrador, y ahí el motorizado
     * existe. Sin esta aserción, un guard escrito de más se llevaría por
     * delante el canal principal sin que ningún rojo lo dijera.
     */
    it('el delivery sigue aceptando Yape al recibir', async () => {
      const cliente = await crearCliente()

      const { data, error } = await db.rpc('create_customer_order', {
        p_customer_user_id: cliente.id,
        p_business_id: BUSINESS_ID,
        p_delivery_method: 'delivery',
        p_payment_intent: 'pending_yape',
        p_customer_name: 'Vecino',
        p_customer_phone: cliente.tel9,
        p_delivery_address: 'Jr. Los Pinos 123',
        p_delivery_reference: 'Portón azul',
        p_delivery_lat: LAT,
        p_delivery_lng: LNG,
        p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
        p_source: 'customer_pwa',
        p_customer_gps_lat: LAT,
        p_customer_gps_lng: LNG,
        p_customer_gps_method: 'gps_high_accuracy',
      })

      // Entra o lo corta el antifraude de contraentrega, pero NUNCA el CHECK
      // del mostrador: eso significaría que la regla se derramó al delivery.
      expect(error?.message ?? '').not.toContain('orders_pickup_payment_chk')
      // Si entró hay que registrarlo o el barrido del globalSetup se estrella
      // contra la FK a `users` al borrar el cliente de este test.
      if (!error) registrar(data)
    })

    /**
     * EL PEDIDO MANUAL DE LA CAJERA NO PASA POR ESTA REGLA, y no es un olvido:
     * ella ya tuvo el dinero en la mano antes de crear la fila. Un CHECK sin
     * condicionar por `source` le rompería el mostrador a la única persona que
     * de verdad puede cobrar en él.
     */
    it('el recojo manual de la cajera puede ser para más tarde y en efectivo', async () => {
      const { data, error } = await db
        .from('orders')
        .insert({
          business_id: BUSINESS_ID,
          source: 'business_manual',
          delivery_method: 'pickup',
          pickup_timing: 'later',
          payment_intent: 'pending_cash',
          customer_name: 'Vecino de la cajera',
          customer_phone: '939000111',
          order_amount: 20,
          delivery_fee: 0,
          status: 'pending_acceptance',
        })
        .select('id')
        .single()

      expect(error, `el manual no debería tropezar: ${error?.message}`).toBeNull()
      if (data?.id) pedidosCreados.push(data.id)
    })
  })

  /**
   * EL DEFAULT ES EL LADO CARO. Un llamador que omita el argumento cae en el
   * camino estricto. Si el default fuera 'now', olvidarse de mandarlo regalaría
   * la exención por presencia física a cualquiera.
   */
  it('omitir `p_pickup_timing` cae en «más tarde», no en «ahora»', async () => {
    const cliente = await crearCliente()

    const { error } = await db.rpc('create_customer_order', {
      p_customer_user_id: cliente.id,
      p_business_id: BUSINESS_ID,
      p_delivery_method: 'pickup',
      p_payment_intent: 'pending_cash',
      p_customer_name: 'Vecino',
      p_customer_phone: cliente.tel9,
      p_delivery_address: '',
      p_delivery_reference: '',
      p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
      p_source: 'customer_pwa',
    })

    expect(error?.message).toContain('Pago adelantado requerido')
  })

  // ── Que ningún recojo acabe en la cola de reparto ────────────────────────

  describe('el recojo no entra en el flujo del motorizado', () => {
    async function recojoEnCocina(): Promise<string> {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      if (error) throw new Error(error.message)
      const creado = registrar(data)
      await aceptarCobrando(creado.id)
      return creado.id
    }

    /**
     * `appears_in_queue_at` es el reloj que ABRE el pedido a `apps/motorizados`
     * (guarda 2 de `take` y la lista de `use-driver-orders`). NULL ahí
     * significa «la ventana no se abre nunca», que es lo que queremos.
     */
    it('aceptar un recojo no abre la ventana de la cola', async () => {
      const id = await recojoEnCocina()

      const fila = await estado(id)
      expect(fila.status).toBe('preparing')
      expect(fila.appears_in_queue_at).toBeNull()
    })

    it('un motorizado no puede tomarlo, ni aunque llame a la RPC directo', async () => {
      const id = await recojoEnCocina()

      const { error } = await avanzar(id, driverUserId, 'driver', 'take')

      expect(error?.message).toContain('recojo en el local')
    })

    /**
     * `waiting_driver` es literalmente lo que mete el pedido en la cola. Un
     * recojo listo tiene que ir a `ready_for_pickup` o el primer motorizado que
     * mire su pantalla se lleva una bolsa de mostrador.
     */
    it('marcar «lista» lo deja en el mostrador, no en la cola', async () => {
      const id = await recojoEnCocina()

      const { error } = await avanzar(id, bizUserId, 'business', 'ready')
      expect(error, error?.message).toBeNull()

      const fila = await estado(id)
      expect(fila.status).toBe('ready_for_pickup')
      expect(fila.ready_for_pickup_at).not.toBeNull()
      // `least(NULL, now())` en Postgres IGNORA el NULL y devuelve now(): la
      // rama de `ready` sin la guarda de método habría abierto la cola aquí.
      expect(fila.appears_in_queue_at).toBeNull()
    })
  })

  // ── Que un recojo se pueda cerrar, y que cobre ───────────────────────────

  describe('cerrar el recojo', () => {
    async function recojoEnMostrador(): Promise<{ id: string; cliente: Cliente }> {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      if (error) throw new Error(error.message)
      const creado = registrar(data)
      await aceptarCobrando(creado.id)
      await avanzar(creado.id, bizUserId, 'business', 'ready')
      return { id: creado.id, cliente }
    }

    /**
     * SIN ESTO EL RECOJO ERA GRATIS. `generate_delivery_charges` deriva el
     * cargo de `commission_amount`/`delivery_fee_charged`, y esas dos las
     * escribía solo la acción `pickup` del motorizado. Sin motorizado se
     * quedaban NULL y el trigger salía por `(fee + comisión) <= 0`.
     */
    it('`handover` cierra en `delivered` y genera la comisión de recojo', async () => {
      const { id } = await recojoEnMostrador()

      const { error } = await avanzar(id, bizUserId, 'business', 'handover', {
        paymentReal: 'paid_cash',
      })
      expect(error, error?.message).toBeNull()

      const fila = await estado(id)
      expect(fila.status).toBe('delivered')
      expect(fila.payment_real).toBe('paid_cash')
      expect(Number(fila.delivery_fee_charged)).toBe(0)
      expect(Number(fila.commission_amount)).toBeGreaterThan(0)
      // El dinero entra a la caja, no al bolsillo de un motorizado: no hay nada
      // que rendir en el corte de la noche.
      expect(Number(fila.cash_owed_at_delivery)).toBe(0)

      const { data: cargos } = await db
        .from('business_charges')
        .select('charge_type, amount')
        .eq('order_id', id)
      expect(cargos).toHaveLength(1)
      expect(cargos?.[0]?.charge_type).toBe('commission')
      expect(Number(cargos?.[0]?.amount)).toBe(Number(fila.commission_amount))
    })

    /**
     * LA PIEZA DE CRECIMIENTO, Y NO HAY QUE TOCAR NINGUNA FUNCIÓN PARA TENERLA.
     * La cláusula (1) de `customer_contraentrega_decision` pregunta por
     * `status = 'delivered'` sin mirar `delivery_method`, así que quien recoge
     * una vez ya puede pedir a domicilio pagando al recibir. Este test es lo que
     * avisa si alguien mete un `delivery_method` en esa cláusula.
     */
    it('un recojo entregado abre la contraentrega para el siguiente pedido', async () => {
      const { id, cliente } = await recojoEnMostrador()
      const antes = await db.rpc('customer_contraentrega_decision', {
        p_customer_user_id: cliente.id,
      })
      expect(antes.data).toBe('no_history')

      await avanzar(id, bizUserId, 'business', 'handover', { paymentReal: 'paid_cash' })

      const despues = await db.rpc('customer_contraentrega_decision', {
        p_customer_user_id: cliente.id,
      })
      expect(despues.data).toBe('trusted')
    })

    /**
     * `paid_mixed` existe porque el motorizado lleva efectivo y el cliente
     * completa por Yape. En el mostrador no hay tal reparto que declarar, y
     * aceptarlo metería un desglose inventado en la liquidación.
     */
    it('no acepta un cobro mixto: en el mostrador no hay dos partes', async () => {
      // SOBRE UN PEDIDO SIN COBRAR, que desde la 0224 es donde esta guarda sigue
      // viva: en uno ya cobrado el `paymentReal` que llegue aquí ni se mira
      // —manda lo que la cajera declaró en la caja— así que un `paid_mixed` no
      // llegaría a la validación, se ignoraría.
      const { id } = await recojoManualSinCobrar(60)

      const { error } = await avanzar(id, bizUserId, 'business', 'handover', {
        paymentReal: 'paid_mixed',
      })

      expect(error?.message).toContain('no valido')
    })

    it('un delivery no se puede cerrar por el mostrador', async () => {
      const { data: pedido, error: insErr } = await db
        .from('orders')
        .insert({
          business_id: BUSINESS_ID,
          delivery_method: 'delivery',
          payment_intent: 'pending_cash',
          customer_phone: telefonoNuevo(),
          order_amount: 20,
          delivery_fee: 2,
          status: 'waiting_driver',
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      pedidosCreados.push(pedido.id)

      const { error } = await avanzar(pedido.id, bizUserId, 'business', 'handover', {
        paymentReal: 'paid_cash',
      })

      expect(error?.message).toContain('solo para pedidos de recojo')
    })
  })

  /**
   * EL RECOJO «MÁS TARDE», DE PUNTA A PUNTA.
   *
   * POR QUÉ HACÍA FALTA. Todo lo que este fichero prueba del ciclo de vida —
   * `cerrar el recojo`, el plantón, el aviso de WhatsApp— se siembra con
   * `'now'`, y los tres casos de «más tarde» que había se paraban en el
   * NACIMIENTO: comprueban quién entra y quién no, nunca qué pasa después.
   * Medido el 2026-09-10: ni un solo test recorría captura → validar → cocina →
   * mostrador → entregado.
   *
   * Y es el camino que más lo necesita. Es el único del sistema donde se cocina
   * SIN NADIE DELANTE y sin cobrador al final (DECISIONS §8): si algo se rompe
   * aquí, se rompe con la comida ya hecha y el dinero ya cobrado.
   *
   * Además es el único recojo que llega a cocina por `validate_order` en vez de
   * por `advance_order`, y esa diferencia no era cosmética: ahí estaba el
   * defecto que arregla la 0225.
   */
  describe('el recojo «más tarde», de punta a punta', () => {
    /**
     * La captura del cliente, como la sube el API.
     *
     * Se escribe por SQL porque la ruta que lo hace en producción
     * (`/customer/orders/[id]/prepay-proof`) sube el fichero a Storage antes de
     * tocar la fila, y lo que este test prueba es lo que pasa DESPUÉS. Los tres
     * campos son los que escribe esa ruta, `validation_context` incluido: sin
     * él `validate_order` toma la rama de antifraude y devuelve el pedido a
     * `pending_acceptance`, que es un camino distinto del que se quiere probar.
     */
    async function subirCaptura(orderId: string) {
      const { error } = await db
        .from('orders')
        .update({
          status: 'validando',
          validation_context: 'proof',
          comprobante_prepago_url: 'https://ejemplo.local/captura.jpg',
          payment_proof_status: 'pending',
        })
        .eq('id', orderId)
      if (error) throw new Error(`no se pudo subir la captura: ${error.message}`)
    }

    it('el camino entero: prepago, captura, cocina, mostrador y entregado', async () => {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'later', undefined, 'prepaid')
      expect(error, `debería entrar: ${error?.message}`).toBeNull()
      const creado = registrar(data)

      // 1. Nace esperando respuesta del negocio, como cualquier prepago (0093).
      expect((await estado(creado.id)).status).toBe('pending_acceptance')

      // 2. Aceptarlo NO es cobrarlo: aquí el dinero no está en la caja, así que
      //    `advance_order` no pide `paymentReal` y abre la ventana de pago.
      //    Es la diferencia exacta con el «ahora», y por eso se afirma sin
      //    pasar por `aceptarCobrando`.
      const { error: errAccept } = await avanzar(creado.id, bizUserId, 'business', 'accept', {
        prepTimeMinutes: 20,
      })
      expect(errAccept, errAccept?.message).toBeNull()
      expect((await estado(creado.id)).status).toBe('awaiting_payment')

      // 3. El cliente paga y sube su captura.
      await subirCaptura(creado.id)
      expect((await estado(creado.id)).status).toBe('validando')

      // 4. La cajera la aprueba. ESTE es el único camino por el que un recojo
      //    llega a cocina sin pasar por `advance_order`.
      const { data: validado, error: errVal } = await db.rpc('validate_order', {
        p_order_id: creado.id,
        p_actor_user_id: bizUserId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 20,
      })
      expect(errVal, errVal?.message).toBeNull()
      expect(validado).toMatchObject({ ok: true, status: 'preparing', context: 'proof' })

      // El sello del dinero lo pone la aprobación de la captura, no la caja.
      const { data: enCocina } = await db
        .from('orders')
        .select('status, payment_proof_status, payment_verified_at, payment_verified_by')
        .eq('id', creado.id)
        .single()
      expect(enCocina?.status).toBe('preparing')
      expect(enCocina?.payment_proof_status).toBe('verified')
      expect(enCocina?.payment_verified_at).not.toBeNull()
      expect(enCocina?.payment_verified_by).toBe(bizUserId)

      // 5. Lista: se queda en el mostrador, no sale a la calle.
      const { error: errReady } = await avanzar(creado.id, bizUserId, 'business', 'ready')
      expect(errReady, errReady?.message).toBeNull()
      const lista = await estado(creado.id)
      expect(lista.status).toBe('ready_for_pickup')
      expect(lista.ready_for_pickup_at).not.toBeNull()

      // 6. Se lo llevó. SIN `paymentReal`: ya estaba pagado, y el pie del
      //    mostrador no vuelve a preguntar (0224).
      const { error: errHandover } = await avanzar(creado.id, bizUserId, 'business', 'handover')
      expect(errHandover, errHandover?.message).toBeNull()
      const cerrado = await estado(creado.id)
      expect(cerrado.status).toBe('delivered')
      expect(cerrado.payment_real).toBe('paid_prepaid')

      // Y deja su comisión, sin cargo de envío: no hubo viaje que cobrar.
      const { data: cargos } = await db
        .from('business_charges')
        .select('charge_type, amount')
        .eq('order_id', creado.id)
      expect(cargos).toHaveLength(1)
      expect(cargos?.[0]).toMatchObject({ charge_type: 'commission' })
    })

    /**
     * 0225 · LA VENTANA DE LA COLA NO SE ABRE PARA EL MOSTRADOR.
     *
     * `advance_order` ya lo cuidaba —hay un caso, «aceptar un recojo no abre la
     * ventana de la cola», que lo afirma para el «ahora»— pero `validate_order`
     * escribía `appears_in_queue_at` en sus tres rutas a `preparing` sin mirar
     * el canal. Y el «más tarde» entra a cocina precisamente por ahí, así que
     * era el ÚNICO recojo que salía de la validación con la ventana abierta.
     *
     * Que hoy ningún motorizado lo viera es mérito de la policy
     * `ord_driver_read`, que exige `delivery_method = 'delivery'`. Esa policy es
     * lo único que separaba un recojo prepagado de figurar como tomable, y no
     * es un sitio donde apoyarse en silencio.
     */
    it('validar la captura no lo mete en la cola del motorizado', async () => {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'later', undefined, 'prepaid')
      expect(error, error?.message).toBeNull()
      const creado = registrar(data)

      await avanzar(creado.id, bizUserId, 'business', 'accept', { prepTimeMinutes: 20 })
      await subirCaptura(creado.id)
      await db.rpc('validate_order', {
        p_order_id: creado.id,
        p_actor_user_id: bizUserId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 20,
      })

      const fila = await estado(creado.id)
      expect(fila.status, 'la precondición del caso es que esté en cocina').toBe('preparing')
      expect(
        fila.appears_in_queue_at,
        'NULL significa «la ventana nunca se abre»: en el mostrador no hay cola',
      ).toBeNull()
    })
  })

  // ── Que el plantón cuente ────────────────────────────────────────────────

  describe('el cliente que no viene', () => {
    async function recojoEsperandoDesde(minutos: number): Promise<{ id: string; tel9: string }> {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      if (error) throw new Error(error.message)
      const creado = registrar(data)
      await aceptarCobrando(creado.id)
      await avanzar(creado.id, bizUserId, 'business', 'ready')
      if (minutos > 0) {
        // El trigger `orders_before_write` pisa los sellos con now() en el
        // INSERT/cambio de estado, así que la espera se simula DESPUÉS.
        const { error: upErr } = await db
          .from('orders')
          .update({
            ready_for_pickup_at: new Date(Date.now() - minutos * 60_000).toISOString(),
          })
          .eq('id', creado.id)
        if (upErr) throw new Error(upErr.message)
      }
      return { id: creado.id, tel9: cliente.tel9 }
    }

    /**
     * El suelo contra el toque accidental justo después de marcar «lista». No
     * es la espera de verdad —esa la decide la cajera mirando la repisa—, pero
     * sin él un doble toque le cuesta un strike a alguien que iba de camino.
     */
    it('no deja declararlo antes de la espera mínima', async () => {
      const { id } = await recojoEsperandoDesde(0)

      const { error } = await avanzar(id, bizUserId, 'business', 'pickup_no_show')

      expect(error?.message).toContain('Espera')
    })

    /**
     * EL ESCRITOR QUE FALTABA. Hasta la 0220 solo el motorizado podía escribir
     * en `customer_strikes`, así que un plantón en el mostrador no dejaba
     * rastro y el mismo cliente podía repetirlo cada noche. Sigue vivo, pero
     * solo para el pedido que de verdad costó comida: el que nadie pagó.
     */
    it('un recojo sin cobrar deja el strike anclado al teléfono', async () => {
      const { id, tel9 } = await recojoManualSinCobrar(60)

      const { error } = await avanzar(id, bizUserId, 'business', 'pickup_no_show')
      expect(error, error?.message).toBeNull()

      const fila = await estado(id)
      expect(fila.status).toBe('cancelled')
      expect(fila.cancel_reason).toBe('no_show')

      const { data: strikes } = await db
        .from('customer_strikes')
        .select('phone, delivery_reference, delivery_coordinates_lat, reason')
        .eq('order_id', id)
      expect(strikes).toHaveLength(1)
      expect(strikes?.[0]?.phone).toBe(tel9)
      expect(strikes?.[0]?.reason).toBe('no_show')
      // En un recojo no hay domicilio del cliente: no hay nada que anclar ahí,
      // y `customer_contraentrega_blocked` cuenta por teléfono O por
      // referencia, así que esa mitad simplemente no suma.
      expect(strikes?.[0]?.delivery_reference).toBeNull()
      expect(strikes?.[0]?.delivery_coordinates_lat).toBeNull()
    })

    /**
     * EL PLANTÓN DE UN PEDIDO PAGADO NO ES UNA FALTA. (0224)
     *
     * Es la contrapartida directa de cobrar antes de cocinar: el strike existe
     * para frenar a quien le genera PÉRDIDAS al negocio, y aquí no hay ninguna
     * — el negocio se queda con el dinero y con el plato. Marcarlo igual
     * empujaría a prepago obligado, y a los tres a un bloqueo de 30 días, a un
     * vecino que pagó su pollo y tuvo una emergencia.
     *
     * El pedido SÍ se cancela: la bolsa deja de ocupar el mostrador.
     */
    it('un recojo ya cobrado se cancela SIN dejarle falta al cliente', async () => {
      const { id, tel9 } = await recojoEsperandoDesde(60)

      const { error } = await avanzar(id, bizUserId, 'business', 'pickup_no_show')
      expect(error, error?.message).toBeNull()

      const fila = await estado(id)
      expect(fila.status).toBe('cancelled')
      expect(fila.cancel_reason).toBe('no_show')

      const { data: strikes } = await db.from('customer_strikes').select('id').eq('order_id', id)
      expect(strikes, 'quien pagó no se lleva una falta').toHaveLength(0)

      const { data: bloqueado } = await db.rpc('customer_contraentrega_blocked', {
        p_phone: tel9,
        p_reference: null,
      })
      expect(bloqueado).toBe(false)
    })

    /**
     * Y EL EVENTO SALE IGUAL, pagado o no: hay que poder contar los plantones.
     * `paid` es lo que distingue los dos casos para quien lea el outbox, que si
     * no tendría que deducirlo de la AUSENCIA de una fila en `customer_strikes`.
     */
    it('el evento del plantón dice si el pedido estaba pagado', async () => {
      const pagado = await recojoEsperandoDesde(60)
      await avanzar(pagado.id, bizUserId, 'business', 'pickup_no_show')

      const { data } = await db
        .from('domain_events')
        .select('payload')
        .eq('aggregate_id', pagado.id)
        .eq('event_type', 'CustomerNoShow')
        .single()

      expect(data?.payload?.paid).toBe(true)
      expect(data?.payload?.strike).toBe(false)
      expect(data?.payload?.channel).toBe('pickup')
    })

    /** DECISIONS §8 vale igual venga el strike de la puerta o del mostrador. */
    it('el segundo plantón deja al cliente en prepago obligado', async () => {
      const primero = await recojoManualSinCobrar(60)
      const { data: st, error: stErr } = await db
        .from('customer_strikes')
        .insert({ phone: primero.tel9, reason: 'no_show' })
        .select('id')
        .single()
      if (stErr) throw new Error(stErr.message)
      strikesCreados.push(st.id)

      await avanzar(primero.id, bizUserId, 'business', 'pickup_no_show')

      const { data: bloqueado } = await db.rpc('customer_contraentrega_blocked', {
        p_phone: primero.tel9,
        p_reference: null,
      })
      expect(bloqueado).toBe(true)
    })
  })

  // ── Avisar al cliente que ya puede venir (0221) ──────────────────────────

  describe('el aviso de WhatsApp', () => {
    async function recojoEnMostrador(): Promise<{ id: string; cliente: Cliente }> {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      if (error) throw new Error(error.message)
      const creado = registrar(data)
      await aceptarCobrando(creado.id)
      await avanzar(creado.id, bizUserId, 'business', 'ready')
      return { id: creado.id, cliente }
    }

    async function avisar(orderId: string, actorUserId: string) {
      return db.rpc('mark_pickup_notified', {
        p_order_id: orderId,
        p_business_user_id: actorUserId,
      })
    }

    /**
     * SELLA SOBRE COLUMNAS QUE YA EXISTÍAN SIN ESCRITOR desde la 0002
     * (`tracking_link_sent_at`/`_by`, 0 de 4 filas con valor). No hubo columna
     * nueva: se diseñaron para exactamente esto.
     */
    it('sella cuándo se abrió el aviso, y quién lo abrió', async () => {
      const { id } = await recojoEnMostrador()

      const { error } = await avisar(id, bizUserId)
      expect(error, error?.message).toBeNull()

      const { data: fila } = await db
        .from('orders')
        .select('tracking_link_sent_at, tracking_link_sent_by')
        .eq('id', id)
        .single()
      expect(fila?.tracking_link_sent_at).not.toBeNull()
      expect(fila?.tracking_link_sent_by).toBe(bizUserId)
    })

    /**
     * REPETIBLE A PROPÓSITO, Y PISANDO LA MARCA. Si la cajera insiste veinte
     * minutos después, lo que quiere ver en la tarjeta es ESA insistencia, no
     * el primer intento: el sello responde «¿cuándo fue la última vez?».
     */
    it('volver a avisar mueve la marca hacia adelante', async () => {
      const { id } = await recojoEnMostrador()
      await avisar(id, bizUserId)
      const { data: primera } = await db
        .from('orders')
        .select('tracking_link_sent_at')
        .eq('id', id)
        .single()

      await new Promise((r) => setTimeout(r, 50))
      const { error } = await avisar(id, bizUserId)
      expect(error, 'insistir no puede estar prohibido').toBeNull()

      const { data: segunda } = await db
        .from('orders')
        .select('tracking_link_sent_at')
        .eq('id', id)
        .single()
      expect(Date.parse(segunda?.tracking_link_sent_at as string)).toBeGreaterThan(
        Date.parse(primera?.tracking_link_sent_at as string),
      )
    })

    /**
     * AVISAR ANTES DE TIEMPO ES PEOR QUE NO AVISAR: manda al cliente a esperar
     * de pie en el mostrador, ocupando el sitio, contra un reloj que todavía no
     * había empezado.
     */
    it('no deja avisar de un pedido que sigue en cocina', async () => {
      const cliente = await crearCliente()
      const { data, error } = await pedirRecojo(cliente, 'now')
      if (error) throw new Error(error.message)
      const creado = registrar(data)
      await aceptarCobrando(creado.id)

      const res = await avisar(creado.id, bizUserId)

      expect(res.error?.message).toContain('todavia no esta listo')
    })

    it('no deja avisar de un delivery: no hay mostrador al que venir', async () => {
      const { data: pedido, error: insErr } = await db
        .from('orders')
        .insert({
          business_id: BUSINESS_ID,
          delivery_method: 'delivery',
          payment_intent: 'pending_cash',
          customer_phone: telefonoNuevo(),
          order_amount: 20,
          delivery_fee: 2,
          status: 'waiting_driver',
        })
        .select('id')
        .single()
      if (insErr) throw new Error(insErr.message)
      pedidosCreados.push(pedido.id)

      const res = await avisar(pedido.id, bizUserId)

      expect(res.error?.message).toContain('solo para pedidos de recojo')
    })

    /**
     * `orders` solo tiene policy de escritura para admin, así que el sello pasa
     * por esta función — y la función comprueba el dueño. Sin esta guarda, un
     * negocio podría sellar el pedido de otro.
     */
    it('un negocio no puede sellar el pedido de otro', async () => {
      const { id } = await recojoEnMostrador()

      const res = await avisar(id, crypto.randomUUID())

      expect(res.error?.message).toContain('No autorizado')
    })
  })

  // ── El esquema no deja mentir ────────────────────────────────────────────

  describe('el CHECK de `pickup_timing`', () => {
    /**
     * Sin esta mitad, un 'now' colado en una fila de delivery pasaría, y desde
     * ahí se leería como «cliente en el mostrador»: presencia física declarada
     * sin mostrador, que es justo el hueco que todo esto cierra.
     */
    it('un delivery no puede llevar `pickup_timing`', async () => {
      const { error } = await db.from('orders').insert({
        business_id: BUSINESS_ID,
        delivery_method: 'delivery',
        payment_intent: 'pending_cash',
        customer_phone: telefonoNuevo(),
        order_amount: 20,
        delivery_fee: 2,
        status: 'pending_acceptance',
        pickup_timing: 'now',
      })

      expect(error?.message).toContain('orders_pickup_timing_chk')
    })

    /**
     * El manual de la cajera SÍ puede dejarlo NULL: ahí nadie hizo la pregunta.
     * Rellenarlo con 'now' por comodidad sería inventar un hecho que nadie
     * comprobó.
     */
    it('el recojo manual de la cajera puede no traerlo', async () => {
      const { data, error } = await db
        .from('orders')
        .insert({
          business_id: BUSINESS_ID,
          source: 'business_manual',
          delivery_method: 'pickup',
          payment_intent: 'pending_cash',
          customer_phone: telefonoNuevo(),
          order_amount: 20,
          delivery_fee: 0,
          status: 'preparing',
        })
        .select('id')
        .single()

      expect(error, error?.message).toBeNull()
      if (data) pedidosCreados.push(data.id)
    })
  })

  /**
   * Una bolsa esperando en el mostrador es un pedido ABIERTO. Sin esto, quien
   * no pasa a recoger puede seguir pidiendo al mismo restaurante y acumular
   * comida hecha que nadie va a llevarse.
   */
  it('un recojo en el mostrador bloquea un pedido nuevo del mismo cliente', async () => {
    const cliente = await crearCliente()
    const { data, error } = await pedirRecojo(cliente, 'now')
    if (error) throw new Error(error.message)
    const creado = registrar(data)
    await aceptarCobrando(creado.id)
    await avanzar(creado.id, bizUserId, 'business', 'ready')
    expect((await estado(creado.id)).status).toBe('ready_for_pickup')

    const segundo = await pedirRecojo(cliente, 'now')

    expect(segundo.error?.message).toContain('pedido activo')
  })
})
