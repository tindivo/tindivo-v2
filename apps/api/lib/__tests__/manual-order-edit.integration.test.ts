/**
 * Edición de pedidos manuales por la cajera (0190).
 *
 * LO QUE ESTO AMARRA, por orden de lo que más duele si se rompe:
 *
 *   · LA FRONTERA DEL SENCILLO. El dinero se congela un estado ANTES que el
 *     resto, en `waiting_at_restaurant`, porque `ChangeHeadsUp` le dice al
 *     motorizado «lleva S/X de vuelto, consíguelo aquí antes de salir»: el
 *     efectivo cambia de manos AHÍ, y el sistema solo lee `change_to_give` al
 *     entregar. Si alguien amplía esa ventana, el motorizado sale con un
 *     adelanto distinto del que se le va a rendir y el descuadre no aparece
 *     hasta el corte de caja. Los casos 3-bis a 3-quater son eso.
 *
 *   · EL TESTIGO DE VERSIÓN. Payload completo sin testigo deja que una pestaña
 *     vieja revierta un total que otra ya corrigió, y encima pisando campos que
 *     ni tocó. Solo se ve con dos llamadas de verdad (transacciones separadas):
 *     dentro de una sola, `now()` no avanza y el testigo parece funcionar
 *     aunque no lo haga. Casos 3-quinquies a 3-septies.
 *
 *   · LAS DOS VÍAS VALIDAN IGUAL. Crear y editar comparten
 *     `manual_order_money`. El caso 14 recorre los mismos rechazos por las dos
 *     vías: si alguien duplica la regla, se pone rojo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db, E2E } from './helpers/local-db'

/** Prefijo propio, registrado en `PREFIJO_TELEFONO_EDICION` del globalSetup. */
const TEL = '987654'
let tel = 0
const nextTel = () => `${TEL}${String(100 + ++tel).slice(-3)}`

const REF = 'Porton azul frente al parque'
const OWNER = E2E.BUSINESS_USER_ID
/** Dueño del segundo negocio del seed, para el caso de «pedido ajeno». */
const OTRO_OWNER = 'e2e00000-0000-4000-8000-0000000000a1'

const creados: string[] = []

interface Manual {
  id: string
  updatedAt: string
  phone: string
}

async function crear(
  opts: {
    total?: number
    intent?: 'pending_cash' | 'pending_yape' | 'pending_mixed' | 'prepaid'
    paysWith?: number | null
    yape?: number | null
    cash?: number | null
  } = {},
): Promise<Manual> {
  const phone = nextTel()
  const { data, error } = await db.rpc('create_business_manual_order', {
    p_business_user_id: OWNER,
    p_delivery_method: 'delivery',
    p_payment_intent: opts.intent ?? 'pending_cash',
    p_total_amount: opts.total ?? 30,
    p_customer_name: 'Vecino Edicion',
    p_customer_phone: phone,
    p_prep_time_minutes: 20,
    p_delivery_reference: REF,
    p_client_pays_with: opts.paysWith === undefined ? 50 : opts.paysWith,
    p_yape_amount: opts.yape ?? null,
    p_cash_amount: opts.cash ?? null,
  })
  if (error) throw new Error(`crear: ${error.message}`)
  const id = (data as { id: string }).id
  creados.push(id)
  return { id, updatedAt: await leerToken(id), phone }
}

async function leerToken(id: string): Promise<string> {
  const { data } = await db.from('orders').select('updated_at').eq('id', id).single()
  return (data as { updated_at: string }).updated_at
}

async function fila(id: string) {
  const { data } = await db
    .from('orders')
    .select(
      'short_id,order_number,order_amount,delivery_fee,payment_intent,client_pays_with,change_to_give,yape_amount,cash_amount,customer_name,customer_phone,delivery_reference,delivery_distance_band,status,prep_time_minutes,estimated_ready_at',
    )
    .eq('id', id)
    .single()
  // biome-ignore lint/suspicious/noExplicitAny: los tipos se regeneran tras el push
  return data as any
}

interface EditOpts {
  total?: number
  intent?: 'pending_cash' | 'pending_yape' | 'pending_mixed' | 'prepaid'
  name?: string | null
  phone?: string | null
  ref?: string | null
  paysWith?: number | null
  yape?: number | null
  cash?: number | null
  reason?: string | null
  owner?: string
}

/**
 * Payload COMPLETO siempre: es el contrato de la RPC. Los valores que el test
 * no especifica salen de la fila actual, que es justo lo que hace la UI al
 * abrir el formulario.
 */
async function editar(m: Manual, token: string, o: EditOpts = {}) {
  const f = await fila(m.id)
  return db.rpc('update_business_manual_order', {
    p_order_id: m.id,
    p_business_user_id: o.owner ?? OWNER,
    p_expected_updated_at: token,
    p_total_amount: o.total ?? Number(f.order_amount) + Number(f.delivery_fee),
    p_payment_intent: o.intent ?? f.payment_intent,
    p_customer_name: o.name === undefined ? f.customer_name : o.name,
    p_customer_phone: o.phone === undefined ? f.customer_phone : o.phone,
    p_delivery_reference: o.ref === undefined ? f.delivery_reference : o.ref,
    p_client_pays_with: o.paysWith === undefined ? f.client_pays_with : o.paysWith,
    p_yape_amount: o.yape === undefined ? f.yape_amount : o.yape,
    p_cash_amount: o.cash === undefined ? f.cash_amount : o.cash,
    p_reason: o.reason ?? null,
  })
}

/** Mueve el estado sin pasar por la máquina: aquí se prueba el guard, no el flujo. */
async function setStatus(id: string, status: string): Promise<string> {
  await db.from('orders').update({ status }).eq('id', id)
  return leerToken(id)
}

async function conMotorizado(id: string): Promise<string> {
  await db.from('orders').update({ driver_id: E2E.DRIVER_ID }).eq('id', id)
  return leerToken(id)
}

async function logs(id: string) {
  const { data } = await db
    .from('order_event_log')
    .select('event_type,data')
    .eq('order_id', id)
    .eq('event_type', 'order.manual_edited')
  // biome-ignore lint/suspicious/noExplicitAny: los tipos se regeneran tras el push
  return (data ?? []) as any[]
}

beforeAll(async () => {
  // Los pedidos manuales cuelgan del negocio del SEED, que no se borra.
  await db.from('orders').delete().like('customer_phone', `${TEL}%`)
})

afterAll(async () => {
  for (const id of creados) {
    await db.from('order_event_log').delete().eq('order_id', id)
    await db.from('domain_events').delete().eq('aggregate_id', id)
    await db.from('business_charges').delete().eq('order_id', id)
  }
  await db.from('orders').delete().like('customer_phone', `${TEL}%`)
  await db.from('address_directory').delete().like('phone', `${TEL}%`)
})

// ═══════════════════════════════════════════════════════════════════════════
describe('edición de pedido manual · lo que se puede', () => {
  it('1 · edita el total en preparing, re-partido y sin tocar la identidad', async () => {
    const m = await crear({ total: 30 })
    const antes = await fila(m.id)
    expect(Number(antes.order_amount)).toBe(28) // 30 − 2 de envío

    const { error } = await editar(m, m.updatedAt, {
      total: 45,
      paysWith: 50,
      reason: 'agregó dos gaseosas',
    })
    expect(error).toBeNull()

    const d = await fila(m.id)
    expect(Number(d.order_amount)).toBe(43) // 45 − 2, re-partido contra el envío de la fila
    expect(Number(d.delivery_fee)).toBe(2) // el envío NO se toca
    expect(Number(d.change_to_give)).toBe(5) // 50 − 45, recalculado
    // La identidad del pedido sobrevive: es la razón de ser de la feature.
    expect(d.short_id).toBe(antes.short_id)
    expect(d.order_number).toBe(antes.order_number)
  })

  it('2 · edita el dinero con el motorizado ya asignado y en camino', async () => {
    const m = await crear({ total: 30 })
    await conMotorizado(m.id)
    const t = await setStatus(m.id, 'heading_to_restaurant')

    const { error } = await editar(m, t, { total: 40, paysWith: 50, reason: 'sumó un postre' })
    expect(error).toBeNull()
    expect(Number((await fila(m.id)).order_amount)).toBe(38)
  })

  it('7 · de efectivo a Yape deja el billete y el vuelto en NULL', async () => {
    const m = await crear({ total: 30, paysWith: 50 })
    expect(Number((await fila(m.id)).change_to_give)).toBe(20)

    const { error } = await editar(m, m.updatedAt, {
      intent: 'pending_yape',
      paysWith: null,
      reason: 'al final paga por Yape',
    })
    expect(error).toBeNull()

    const d = await fila(m.id)
    expect(d.payment_intent).toBe('pending_yape')
    expect(d.client_pays_with).toBeNull()
    // NULL, no 0: ya no hay vuelto que dar, que es distinto de «el vuelto es cero».
    expect(d.change_to_give).toBeNull()
  })

  it('8 · de Yape a efectivo con billete recalcula el vuelto', async () => {
    const m = await crear({ total: 30, intent: 'pending_yape', paysWith: null })
    expect((await fila(m.id)).change_to_give).toBeNull()

    const { error } = await editar(m, m.updatedAt, {
      intent: 'pending_cash',
      paysWith: 50,
      reason: 'no tiene saldo, paga en efectivo',
    })
    expect(error).toBeNull()
    expect(Number((await fila(m.id)).change_to_give)).toBe(20)
  })

  it('5 · el contacto no necesita motivo', async () => {
    const m = await crear({ total: 30 })
    const { error } = await editar(m, m.updatedAt, {
      name: 'Vecino Corregido',
      ref: 'Portón rojo, casa de dos pisos',
    })
    expect(error).toBeNull()
    expect((await fila(m.id)).customer_name).toBe('Vecino Corregido')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('edición de pedido manual · la frontera del sencillo', () => {
  it('3-bis · en el local, los CINCO campos de dinero se rechazan', async () => {
    const m = await crear({ total: 30, paysWith: 50 })
    const t = await setStatus(m.id, 'waiting_at_restaurant')

    const casos: Array<[string, EditOpts]> = [
      ['total', { total: 40, reason: 'x' }],
      ['payment_intent', { intent: 'pending_yape', paysWith: null, reason: 'x' }],
      ['client_pays_with', { paysWith: 100, reason: 'x' }],
      ['yape_amount', { intent: 'pending_mixed', yape: 10, cash: 20, reason: 'x' }],
      ['cash_amount', { intent: 'pending_mixed', yape: 20, cash: 10, reason: 'x' }],
    ]
    for (const [nombre, opts] of casos) {
      const { error } = await editar(m, t, opts)
      expect(error, `${nombre} debería rechazarse en el local`).not.toBeNull()
      expect(error?.message, nombre).toContain('vuelto')
    }
    // Y nada se movió.
    const d = await fila(m.id)
    expect(Number(d.order_amount)).toBe(28)
    expect(Number(d.client_pays_with)).toBe(50)
  })

  it('3-ter · en el local, el contacto SÍ se puede corregir', async () => {
    const m = await crear({ total: 30 })
    const t = await setStatus(m.id, 'waiting_at_restaurant')

    const { error } = await editar(m, t, {
      ref: 'Me equivoqué: es Jirón Lima 400',
      phone: nextTel(),
    })
    expect(error).toBeNull()
    expect((await fila(m.id)).delivery_reference).toBe('Me equivoqué: es Jirón Lima 400')
  })

  it('3-quater · sin vuelto, el dinero sigue congelado en el local', async () => {
    // Un pedido por Yape no tiene adelanto, así que «no hay sencillo que
    // descuadrar» invita a permitirlo. Pero cambiarlo a efectivo con billete
    // CREARÍA un adelanto que el motorizado no lleva encima: el mismo agujero
    // por el otro lado. La regla mira el estado, no si hay vuelto.
    const m = await crear({ total: 30, intent: 'pending_yape', paysWith: null })
    expect((await fila(m.id)).change_to_give).toBeNull()
    const t = await setStatus(m.id, 'waiting_at_restaurant')

    const { error } = await editar(m, t, {
      intent: 'pending_cash',
      paysWith: 100,
      reason: 'quiere pagar en efectivo',
    })
    expect(error).not.toBeNull()
  })

  it('3 · recogido, entregado y cancelado: nada se edita', async () => {
    for (const status of ['picked_up', 'delivered', 'cancelled']) {
      const m = await crear({ total: 30 })
      const t = await setStatus(m.id, status)
      const { error } = await editar(m, t, { name: 'Otro Nombre' })
      expect(error, `${status} debería rechazarse`).not.toBeNull()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('edición de pedido manual · concurrencia', () => {
  it('3-quinquies · dos ediciones con el mismo testigo: solo una pasa', async () => {
    for (let ronda = 0; ronda < 5; ronda++) {
      const m = await crear({ total: 30 })
      const [a, b] = await Promise.all([
        editar(m, m.updatedAt, { total: 45, paysWith: 50, reason: 'A' }),
        editar(m, m.updatedAt, { total: 60, paysWith: 100, reason: 'B' }),
      ])
      const okCount = [a, b].filter((r) => r.error === null).length
      expect(okCount, `ronda ${ronda}`).toBe(1)

      const perdedor = [a, b].find((r) => r.error !== null)
      expect(perdedor?.error?.message).toContain('cambió mientras lo editabas')

      // 3-septies · la fila es EXACTAMENTE la del que ganó, sin mezcla.
      const d = await fila(m.id)
      const total = Number(d.order_amount) + Number(d.delivery_fee)
      expect([45, 60]).toContain(total)
      expect(Number(d.client_pays_with)).toBe(total === 45 ? 50 : 100)
    }
  }, 60_000)

  it('3-sexies · un cambio del motorizado también invalida el testigo', async () => {
    const m = await crear({ total: 30 })
    // La cajera abrió el formulario con este testigo…
    const suyo = m.updatedAt
    // …y mientras tanto el motorizado tomó el pedido.
    await conMotorizado(m.id)

    const { error } = await editar(m, suyo, { total: 45, paysWith: 50, reason: 'tarde' })
    expect(error).not.toBeNull()
    expect(error?.message).toContain('cambió mientras lo editabas')
  })

  it('3-octies · el conflicto viaja con su marca para que la ruta lo traduzca', async () => {
    const m = await crear({ total: 30 })
    await editar(m, m.updatedAt, { name: 'Primero' })
    const { error } = await editar(m, m.updatedAt, { name: 'Segundo' })
    // `details` es lo que la ruta mira para devolver 409 con el pedido actual.
    expect(error?.details ?? '').toContain('stale_order_edit:')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('edición de pedido manual · guards y efectos', () => {
  it('4 · un total por debajo del envío se rechaza', async () => {
    const m = await crear({ total: 30 })
    const { error } = await editar(m, m.updatedAt, { total: 1.5, paysWith: 50, reason: 'x' })
    expect(error?.message).toContain('mayor que el envío')
  })

  it('5-bis · un mixto cuyas partes no suman el total se rechaza', async () => {
    const m = await crear({ total: 30 })
    const { error } = await editar(m, m.updatedAt, {
      intent: 'pending_mixed',
      yape: 10,
      cash: 5,
      paysWith: 50,
      reason: 'x',
    })
    expect(error?.message).toContain('suma de Yape y Efectivo')
  })

  it('6 · un billete que no cubre el efectivo se rechaza', async () => {
    const m = await crear({ total: 30 })
    const { error } = await editar(m, m.updatedAt, { total: 45, paysWith: 20, reason: 'x' })
    expect(error?.message).toContain('cubrir la parte en efectivo')
  })

  it('4-bis · un cambio de dinero SIN motivo se acepta', async () => {
    // El motivo obligatorio se quito tras probar la pantalla: un texto libre
    // entre la cajera y el boton de guardar es friccion con el cliente al
    // telefono, y lo previsible no es que escriba mejores motivos sino que
    // vuelva a cancelar y retipear. Lo que la auditoria necesita -QUE cambio,
    // con antes y despues- lo sigue guardando el log; ver el caso 12.
    const m = await crear({ total: 30 })
    const { error } = await editar(m, m.updatedAt, { total: 45, paysWith: 50, reason: null })
    expect(error).toBeNull()
    expect(Number((await fila(m.id)).order_amount)).toBe(43)

    const d = (await logs(m.id))[0].data
    expect(d.motivo).toBeNull()
    expect(Number(d.cambios.total.a)).toBe(45)
  })

  it('9 · la banda y el envío no se pueden tocar: no son parámetros', async () => {
    const m = await crear({ total: 30 })
    const antes = await fila(m.id)
    await editar(m, m.updatedAt, { total: 45, paysWith: 50, reason: 'x' })
    const d = await fila(m.id)
    expect(d.delivery_distance_band).toBe(antes.delivery_distance_band)
    expect(Number(d.delivery_fee)).toBe(Number(antes.delivery_fee))
  })

  it('10 · un pedido de otro negocio se rechaza', async () => {
    const m = await crear({ total: 30 })
    const { error } = await editar(m, m.updatedAt, { name: 'Ajeno', owner: OTRO_OWNER })
    expect(error?.message).toContain('No autorizado')
  })

  it('11 · un pedido de la web no se edita por aquí', async () => {
    const m = await crear({ total: 30 })
    await db.from('orders').update({ source: 'customer_pwa' }).eq('id', m.id)
    const t = await leerToken(m.id)
    const { error } = await editar(m, t, { name: 'Web' })
    expect(error?.message).toContain('tomados por el negocio')
  })

  it('12 · el log guarda solo lo que cambió, con antes y después', async () => {
    const m = await crear({ total: 30 })
    await editar(m, m.updatedAt, { total: 45, paysWith: 50, reason: 'agregó gaseosas' })

    const filas = await logs(m.id)
    expect(filas).toHaveLength(1)
    const d = filas[0].data
    expect(d.motivo).toBe('agregó gaseosas')
    expect(d.tocaDinero).toBe(true)
    expect(Number(d.cambios.total.de)).toBe(30)
    expect(Number(d.cambios.total.a)).toBe(45)
    // El nombre y la referencia no cambiaron: no deben aparecer.
    expect(d.cambios.customerName).toBeUndefined()
    expect(d.cambios.deliveryReference).toBeUndefined()
  })

  it('12-bis · guardar sin cambiar nada no deja rastro ni mueve el testigo', async () => {
    const m = await crear({ total: 30 })
    const { data, error } = await editar(m, m.updatedAt, {})
    expect(error).toBeNull()
    expect((data as { sinCambios?: boolean }).sinCambios).toBe(true)
    expect(await logs(m.id)).toHaveLength(0)
    expect(await leerToken(m.id)).toBe(m.updatedAt)
  })

  it('13 · corrige la fila del directorio, sin crear ninguna nueva', async () => {
    // Crear un manual escribe en `address_directory`, el autocompletado por
    // teléfono de la cajera. Si tecleó mal, esa fila nace mal.
    //
    // La primera versión no la tocaba, «para no abrir un segundo camino de
    // acuñar confianza de contraentrega» (0182). El argumento estaba invertido:
    // la fila mala YA se acuñó al crear. No tocarla solo impedía ARREGLARLA.
    //
    // Se corrige ACTUALIZANDO, nunca insertando: cero filas nuevas = cero
    // caminos nuevos de confianza. Eso es lo que amarra el conteo.
    const m = await crear({ total: 30 })
    const antes = await db.from('address_directory').select('id', { count: 'exact', head: true })
    const nuevoRef = 'Jirón Bolognesi 88, tienda azul'

    await editar(m, m.updatedAt, { ref: nuevoRef })

    const { data: fila } = await db
      .from('address_directory')
      .select('reference')
      .eq('phone', m.phone)
      .maybeSingle()
    expect((fila as { reference: string } | null)?.reference).toBe(nuevoRef)

    const despues = await db.from('address_directory').select('id', { count: 'exact', head: true })
    expect(despues.count, 'no puede nacer ninguna fila nueva').toBe(antes.count)
  })

  it('13-bis · corregir el teléfono MUEVE la fila cuando el nuevo no existe', async () => {
    const m = await crear({ total: 30 })
    const nuevo = nextTel()

    const { data } = await editar(m, m.updatedAt, { phone: nuevo })
    expect((data as { directorioCorregido?: boolean }).directorioCorregido).toBe(true)

    const viejo = await db
      .from('address_directory')
      .select('id', { count: 'exact', head: true })
      .eq('phone', m.phone)
    expect(viejo.count, 'el teléfono mal tecleado no puede quedarse en la agenda').toBe(0)

    const movida = await db
      .from('address_directory')
      .select('id', { count: 'exact', head: true })
      .eq('phone', nuevo)
    expect(movida.count).toBe(1)
  })

  it('13-ter · si el teléfono nuevo YA tiene entrada, no se toca nada', async () => {
    // La agenda del número correcto es la buena: el equivocado fue este pedido.
    // Y es lo que esquiva `address_directory_default_unique`
    // (UNIQUE (phone) WHERE is_default), que abortaría la edición entera.
    const ocupante = await crear({ total: 30 })
    const m = await crear({ total: 30 })

    const { error, data } = await editar(m, m.updatedAt, { phone: ocupante.phone })
    expect(error, 'no puede reventar por el índice único').toBeNull()
    expect((data as { directorioCorregido?: boolean }).directorioCorregido).toBe(false)

    const { data: fila } = await db
      .from('address_directory')
      .select('reference')
      .eq('phone', ocupante.phone)
      .maybeSingle()
    expect((fila as { reference: string } | null)?.reference).toBe(REF)
  })

  it('13-quater · una fila compartida por dos pedidos no se toca', async () => {
    // Si la dirección ya servía a otros pedidos es curada: reescribirla por un
    // error de ESTE pedido corrompería datos de terceros.
    const primero = await crear({ total: 30 })
    await db.from('orders').update({ status: 'delivered' }).eq('id', primero.id)

    // Mismo teléfono y misma referencia ⇒ `create_business_manual_order` reusa
    // la fila del directorio en vez de crear otra.
    const { data: creado } = await db.rpc('create_business_manual_order', {
      p_business_user_id: OWNER,
      p_delivery_method: 'delivery',
      p_payment_intent: 'pending_cash',
      p_total_amount: 30,
      p_customer_name: 'Vecino Edicion',
      p_customer_phone: primero.phone,
      p_prep_time_minutes: 20,
      p_delivery_reference: REF,
      p_client_pays_with: 50,
    })
    const segundoId = (creado as { id: string }).id
    creados.push(segundoId)
    const segundo = { id: segundoId, updatedAt: await leerToken(segundoId), phone: primero.phone }

    const { data } = await editar(segundo, segundo.updatedAt, {
      ref: 'Dirección nueva que no debe propagarse 123',
    })
    expect((data as { directorioCorregido?: boolean }).directorioCorregido).toBe(false)

    const { data: fila } = await db
      .from('address_directory')
      .select('reference')
      .eq('phone', primero.phone)
      .maybeSingle()
    expect((fila as { reference: string } | null)?.reference).toBe(REF)
  })

  it('2-bis · la edición no toca los relojes de cocina', async () => {
    const m = await crear({ total: 30 })
    const antes = await fila(m.id)
    await editar(m, m.updatedAt, { total: 45, paysWith: 50, reason: 'x' })
    const d = await fila(m.id)
    expect(d.prep_time_minutes).toBe(antes.prep_time_minutes)
    expect(d.estimated_ready_at).toBe(antes.estimated_ready_at)
    expect(d.status).toBe(antes.status)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('edición de pedido manual · crear y editar validan igual', () => {
  it('14 · los mismos rechazos por las dos vías', async () => {
    // Es el test que amarra que `manual_order_money` se usa DE VERDAD en los
    // dos sitios. Si alguien vuelve a duplicar la regla, aquí se nota.
    const m = await crear({ total: 30 })

    const casos: Array<[string, EditOpts, Record<string, unknown>]> = [
      [
        'total por debajo del envío',
        { total: 1.5, paysWith: 50, reason: 'x' },
        { p_total_amount: 1.5, p_payment_intent: 'pending_cash', p_client_pays_with: 50 },
      ],
      [
        'mixto que no suma',
        { intent: 'pending_mixed', yape: 10, cash: 5, paysWith: 50, reason: 'x' },
        {
          p_total_amount: 30,
          p_payment_intent: 'pending_mixed',
          p_yape_amount: 10,
          p_cash_amount: 5,
          p_client_pays_with: 50,
        },
      ],
      [
        'billete que no cubre',
        { total: 45, paysWith: 20, reason: 'x' },
        { p_total_amount: 45, p_payment_intent: 'pending_cash', p_client_pays_with: 20 },
      ],
    ]

    for (const [nombre, edicion, creacion] of casos) {
      const t = await leerToken(m.id)
      const rEdit = await editar(m, t, edicion)

      const rCreate = await db.rpc('create_business_manual_order', {
        p_business_user_id: OWNER,
        p_delivery_method: 'delivery',
        p_customer_name: 'Vecino Edicion',
        p_customer_phone: nextTel(),
        p_prep_time_minutes: 20,
        p_delivery_reference: REF,
        ...creacion,
      })

      expect(rEdit.error, `${nombre}: la edición debe rechazar`).not.toBeNull()
      expect(rCreate.error, `${nombre}: la creación debe rechazar`).not.toBeNull()
      expect(rEdit.error?.message, `${nombre}: mismo mensaje por las dos vías`).toBe(
        rCreate.error?.message,
      )
    }
  })
})
