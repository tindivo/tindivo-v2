/**
 * El techo de vuelto lo pone la caja de esta noche, no una constante. (0185)
 *
 * QUÉ AMARRA. Hasta la 0185 el vuelto máximo era `app_settings.max_change` = 50,
 * un número global calibrado una vez y aplicado igual a todas las noches de
 * todos los negocios. Pero el sencillo no lo pone Tindivo: lo adelanta la cajera
 * de su propio bolsillo, y es la única que sabe si a las nueve le quedan S/20 o
 * S/80.
 *
 * LO QUE SE MIDE AQUÍ, Y POR QUÉ NINGUNO SOBRA:
 *
 *  · SIN DECLARAR MANDA EL GLOBAL. Es el caso que garantiza que la 0185 no
 *    cambia el comportamiento de nadie que no haya tocado nada. Si esto se
 *    rompe, la migración deja de ser retrocompatible y no lo sabríamos.
 *
 *  · DECLARAR ABRE LO QUE EL GLOBAL CERRABA. Con S/47 de total, pagar con S/100
 *    exige S/53 de vuelto y el global de S/50 lo rechaza. Ese es exactamente el
 *    caso que motivó la migración: S/100 es el tercer billete más declarado del
 *    piloto y el que el checkout apagaba casi siempre.
 *
 *  · CERO ES UN VALOR, NO UN VACÍO. "Hoy no tengo sencillo, solo pago exacto" es
 *    una declaración legítima. Si alguien resuelve el fallback con un descarte
 *    por falsy, el cero se confunde con "no declaró" y la noche sin sencillo
 *    vuelve a aceptar S/50 de vuelto. Este test es el único que lo notaría.
 *
 *  · LA DECLARACIÓN DE AYER NO RIGE HOY. Es la razón entera de colgar el dato de
 *    `business_service_days` en vez de `businesses`: el reinicio nocturno sale
 *    del PK (business_id, service_date) y no de un cron. Si alguien lo mueve a
 *    la tabla de negocios «porque es más simple», esto se pone rojo.
 *
 *  · R2 SIGUE SIENDO GLOBAL. El billete máximo que acepta el motorizado no
 *    depende de la caja del negocio: una cajera con S/200 de vuelto no puede
 *    autorizar que le paguen con S/150. Sin este caso, «arreglar» R3 pasando
 *    todo el bloque al valor de la noche también daría verde.
 *
 * POR QUÉ CLIENTE PROPIO. `pending_cash` exige un cliente de confianza (0171), y
 * `delivered` es terminal: apoyarse en el historial que otra suite le haya
 * dejado a `e2e...003` es apoyarse en el orden de ejecución. Este test se
 * fabrica el suyo y lo borra.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { localClient as db } from './helpers/local-db'

const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_POLLO_ID = 'e2e00000-0000-4000-8000-000000000031'

/** Verificadas dentro del polígono de cobertura (ver `e2e-fixtures.ts`). */
const LAT = -9.151
const LNG = -78.28

/** Pollo entero S/45 + delivery de banda cercana S/2. */
const TOTAL = 47

let clienteId: string
let tel9: string
let serviceDate: string
const pedidosCreados: string[] = []

/**
 * Las jornadas del negocio TAL COMO estaban antes de este fichero.
 *
 * Hace falta desde que `declararVuelto` pasó a `upsert`: antes hacía `UPDATE` y
 * no podía crear nada, así que no había qué restaurar. Ahora puede crear la fila
 * de HOY, y esa fila no es inerte — enciende el banner «Atendiendo hoy» en el
 * chrome de negocios, que empuja el contenido de TODAS sus pantallas hacia
 * abajo. Medido: dejarla puesta tumba los siete snapshots visuales del panel a
 * la vez, y el fallo apunta a la UI en vez de a este fichero.
 */
let jornadasPrevias: { service_date: string; status: string; change_available: number | null }[] = []

async function pagarCon(monto: number) {
  return db.rpc('create_customer_order', {
    p_customer_user_id: clienteId,
    p_business_id: BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: 'pending_cash',
    p_customer_name: 'Vecino',
    p_customer_phone: tel9,
    p_delivery_address: 'Jr. Los Pinos 123',
    p_delivery_reference: 'Portón azul, frente al parque',
    p_delivery_lat: LAT,
    p_delivery_lng: LNG,
    p_items: [{ menu_item_id: ITEM_POLLO_ID, quantity: 1, modifiers: [] }],
    p_source: 'customer_pwa',
    p_client_pays_with: monto,
  })
}

/**
 * `null` deja la noche sin declarar, que es como la encuentra el seed.
 *
 * UPSERT, no UPDATE. Era un UPDATE y eso lo hacía depender de que YA existiera
 * la fila de la jornada, cosa que nadie garantiza: `business_service_days` la
 * crea el negocio al confirmar apertura, no el seed. Cuando no existía, el
 * UPDATE no casaba ninguna fila, PostgREST no lo considera un error, y la
 * declaración se perdía en silencio: `effective_max_change` devolvía el global
 * y los tres casos de este fichero fallaban con «expected 50 to be 80».
 *
 * El síntoma es de los que se curan solos y vuelven: pasa los días en que
 * alguien confirmó la apertura y falla los demás. Visto en verde toda una
 * sesión y en rojo al cruzar las 05:00 de Lima, cuando `current_service_date()`
 * avanzó a una jornada sin fila.
 */
async function declararVuelto(monto: number | null, fecha?: string) {
  const { error } = await db.from('business_service_days').upsert(
    {
      business_id: BUSINESS_ID,
      service_date: fecha ?? serviceDate,
      status: 'open',
      change_available: monto,
    },
    { onConflict: 'business_id,service_date' },
  )
  if (error) throw new Error(`no se pudo declarar el vuelto: ${error.message}`)
}

async function techoVigente(): Promise<number> {
  const { data, error } = await db.rpc('effective_max_change', { p_business_id: BUSINESS_ID })
  if (error) throw new Error(`effective_max_change falló: ${error.message}`)
  return Number(data)
}

describe('0185 · el vuelto de la noche manda sobre la constante', () => {
  beforeAll(async () => {
    const { count } = await db
      .from('businesses')
      .select('id', { count: 'exact', head: true })
      .eq('id', BUSINESS_ID)
    if (!count) throw new Error('Falta el mundo e2e: corre `pnpm db:seed:e2e`')

    const { data: hoy, error: sdErr } = await db.rpc('current_service_date')
    if (sdErr || !hoy) throw new Error(`current_service_date falló: ${sdErr?.message}`)
    serviceDate = hoy as string

    const { data: jornadas } = await db
      .from('business_service_days')
      .select('service_date,status,change_available')
      .eq('business_id', BUSINESS_ID)
    jornadasPrevias = (jornadas ?? []) as typeof jornadasPrevias

    tel9 = `9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`
    const { data: auth, error: authErr } = await db.auth.admin.createUser({
      email: `vuelto-${tel9}@integration.local`,
      password: 'test-password-12345',
      email_confirm: true,
      user_metadata: { full_name: 'Vecino del Vuelto' },
    })
    if (authErr) throw new Error(`no se pudo crear el auth user: ${authErr.message}`)
    clienteId = auth.user.id

    const { error: perfErr } = await db.from('customer_profiles').insert({
      user_id: clienteId,
      full_name: 'Vecino del Vuelto',
      phone: `+51${tel9}`,
      phone_verified_at: new Date().toISOString(),
      contraentrega_blocked: false,
    })
    if (perfErr) throw new Error(`no se pudo crear el perfil: ${perfErr.message}`)

    // Una entrega ya consumada lo vuelve de confianza (0171). Sin esto la RPC
    // corta en «Pago adelantado requerido» y R3 no llega a evaluarse nunca.
    const { data: entrega, error: entErr } = await db
      .from('orders')
      .insert({
        business_id: BUSINESS_ID,
        customer_user_id: clienteId,
        source: 'customer_pwa',
        status: 'delivered',
        delivery_method: 'delivery',
        payment_intent: 'pending_cash',
        customer_name: 'Vecino del Vuelto',
        customer_phone: tel9,
        order_amount: 20,
        delivery_fee: 2,
      })
      .select('id')
      .single()
    if (entErr) throw new Error(`no se pudo sembrar la entrega: ${entErr.message}`)
    pedidosCreados.push(entrega.id)
  })

  afterEach(async () => {
    // La fila de la jornada es del mundo e2e y se comparte: se devuelve a «sin
    // declarar» para no dejarle el techo movido a la siguiente suite.
    await declararVuelto(null)

    // El guard de «un pedido activo por cliente y negocio» haría fallar al
    // siguiente caso por un motivo que no es el suyo.
    const { data } = await db
      .from('orders')
      .select('id')
      .eq('customer_user_id', clienteId)
      .not('status', 'in', '("delivered","cancelled")')
    for (const o of data ?? []) {
      await db.from('domain_events').delete().eq('aggregate_id', o.id)
      await db.from('customer_order_items').delete().eq('order_id', o.id)
      await db.from('orders').delete().eq('id', o.id)
    }
  })

  afterAll(async () => {
    for (const id of pedidosCreados.splice(0)) {
      await db.from('domain_events').delete().eq('aggregate_id', id)
      await db.from('customer_order_items').delete().eq('order_id', id)
      await db.from('orders').delete().eq('id', id)
    }
    await db.from('customer_profiles').delete().eq('user_id', clienteId)
    await db.auth.admin.deleteUser(clienteId)

    // Devolver las jornadas exactamente como estaban: borrar las que este
    // fichero creó y restaurar el vuelto de las que ya existían. Ver la nota de
    // `jornadasPrevias`.
    const previas = new Set(jornadasPrevias.map((j) => j.service_date))
    const { data: ahora } = await db
      .from('business_service_days')
      .select('service_date')
      .eq('business_id', BUSINESS_ID)

    for (const j of (ahora ?? []) as { service_date: string }[]) {
      if (!previas.has(j.service_date)) {
        await db
          .from('business_service_days')
          .delete()
          .eq('business_id', BUSINESS_ID)
          .eq('service_date', j.service_date)
      }
    }
    for (const j of jornadasPrevias) {
      await db
        .from('business_service_days')
        .update({ status: j.status, change_available: j.change_available })
        .eq('business_id', BUSINESS_ID)
        .eq('service_date', j.service_date)
    }
  })

  it('sin declarar nada, manda `app_settings.max_change`', async () => {
    expect(await techoVigente()).toBe(50)

    // S/100 sobre un total de S/47 pide S/53 de vuelto: tres más que el global.
    const { error } = await pagarCon(100)
    expect(error?.message).toContain('supera el vuelto disponible')
  })

  it('declarar S/80 habilita el billete de S/100 que el global rechazaba', async () => {
    await declararVuelto(80)
    expect(await techoVigente()).toBe(80)

    const { data, error } = await pagarCon(100)
    expect(error, `debería entrar: ${error?.message}`).toBeNull()

    const id = (data as { id: string }).id
    const { data: fila } = await db
      .from('orders')
      .select('client_pays_with, change_to_give')
      .eq('id', id)
      .single()
    expect(Number(fila?.client_pays_with)).toBe(100)
    expect(Number(fila?.change_to_give)).toBe(100 - TOTAL)
  })

  it('declarar cero es «solo pago exacto», no «no declaré»', async () => {
    await declararVuelto(0)
    expect(await techoVigente()).toBe(0)

    // Con el fallback roto esto valdría 50 y el billete de S/50 pasaría.
    const { error: rechazo } = await pagarCon(50)
    expect(rechazo?.message).toContain('supera el vuelto disponible')

    const { error: exacto } = await pagarCon(TOTAL)
    expect(exacto, `el pago exacto debería entrar: ${exacto?.message}`).toBeNull()
  })

  it('lo que se declaró ayer no rige hoy', async () => {
    const ayer = new Date(`${serviceDate}T12:00:00Z`)
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    const fechaAyer = ayer.toISOString().slice(0, 10)

    await db.from('business_service_days').upsert(
      {
        business_id: BUSINESS_ID,
        service_date: fechaAyer,
        status: 'open',
        change_available: 5,
      },
      { onConflict: 'business_id,service_date' },
    )

    expect(await techoVigente()).toBe(50)

    await declararVuelto(null, fechaAyer)
  })

  it('el billete máximo (R2) sigue siendo global: la caja no lo puede subir', async () => {
    await declararVuelto(200)
    expect(await techoVigente()).toBe(200)

    // El vuelto alcanzaría de sobra, pero `max_cash_bill` = 100 no es negociable
    // desde la caja del negocio.
    const { error } = await pagarCon(150)
    expect(error?.message).toContain('El billete máximo aceptado es S/100')
  })
})
