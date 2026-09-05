// send-push — Edge Function (Deno). Recibe un evento del outbox (vía trigger pg_net),
// resuelve destinatarios, construye la notificación (doc 11 §7) y envía Web Push (VAPID).
// Registra cada intento en push_delivery_log y purga suscripciones muertas (404/410).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@tindivo.com'

/**
 * Arranque a prueba de configuración rota.
 *
 * `setVapidDetails` y `createClient` LANZAN si su entrada está mal formada, y en
 * el module scope de una Edge Function eso no es un error manejable: mata al
 * worker, y cada invocación responde un `WORKER_ERROR` genérico que no dice
 * nada. Producción estuvo así desde el 2026-08-01 con una `VAPID_PUBLIC_KEY`
 * mal pegada: cero notificaciones enviadas y cero señal de la causa durante dos
 * meses.
 *
 * Ahora el fallo de config se captura y se sirve como 500 con el motivo, así que
 * un curl al endpoint lo revela al primer intento. Deliberadamente NO se sanean
 * las llaves (quitar comillas, recortar espacios): eso enmascara el error de
 * despliegue en vez de exponerlo, que es justo cómo se llegó hasta aquí.
 */
let bootError: string | null = null

if (!vapidPublic || !vapidPrivate) {
  bootError = 'VAPID_PUBLIC_KEY y/o VAPID_PRIVATE_KEY sin configurar'
} else {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  } catch (e) {
    // Los mensajes de web-push describen la FORMA del defecto ("should be 65
    // bytes long when decoded", "must be a URL safe Base 64") y nunca incluyen
    // el valor de la llave, así que son seguros de propagar en la respuesta.
    bootError = `setVapidDetails: ${(e as Error)?.message ?? String(e)}`
  }
}

let dbOrNull: ReturnType<typeof createClient> | null = null
try {
  dbOrNull = createClient(url, serviceKey)
} catch (e) {
  bootError = `createClient: ${(e as Error)?.message ?? String(e)}`
}
// El handler corta con 500 en cuanto hay `bootError`, así que a partir de aquí
// `db` solo se toca cuando la construcción sí funcionó.
const db = dbOrNull as ReturnType<typeof createClient>

type Note = {
  userId: string
  title: string
  body: string
  tag: string
  url: string
  requireInteraction: boolean
  vibrate: boolean
  renotify?: boolean
}

/**
 * Un plazo de `app_settings.timers`, en minutos.
 *
 * Se lee en vez de escribirse a mano porque es un parámetro operativo
 * (CLAUDE.md): el día que alguien mueva `noShowWaitMinutes` en la tabla, el
 * aviso que le da ese plazo al cliente tiene que moverse con él. Un número
 * hardcodeado aquí empezaría a mentir sin que nadie se entere.
 */
async function timerMinutes(name: string, fallback: number): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'timers').maybeSingle()
  const raw = (data?.value as Record<string, unknown> | null)?.[name]
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** `user_id` del motorizado a partir de su `drivers.id`. Null si no existe. */
async function driverUserId(driverId: unknown): Promise<string | null> {
  if (typeof driverId !== 'string' || !driverId) return null
  const { data } = await db.from('drivers').select('user_id').eq('id', driverId).maybeSingle()
  return (data?.user_id as string | null) ?? null
}

/**
 * Cuánto efectivo queda ABIERTO entre un motorizado y un negocio, ahora mismo.
 *
 * Lo que sostiene a las notificaciones de efectivo colapsadas. Desde 0157 hay
 * una liquidación por pedido, así que una entrega de cuatro clientes son cuatro
 * eventos y cuatro llamadas a esta función. Cada notificación reemplaza a la
 * anterior (mismo `tag`) y describe el ESTADO, no el delta — por eso da igual en
 * qué orden lleguen: la última en pintarse dice la verdad de ese momento.
 *
 * `disputed` cuenta como abierto: ese dinero tampoco está cerrado.
 */
async function openCashTotal(
  driverId: unknown,
  businessId: unknown,
): Promise<{ total: number; count: number }> {
  if (typeof driverId !== 'string' || typeof businessId !== 'string') {
    return { total: 0, count: 0 }
  }
  const { data } = await db
    .from('cash_settlements')
    .select('delivered_amount')
    .eq('driver_id', driverId)
    .eq('business_id', businessId)
    .in('status', ['pending_confirmation', 'disputed'])
  const rows = data ?? []
  return {
    total: rows.reduce((s: number, r) => s + Number(r.delivered_amount ?? 0), 0),
    count: rows.length,
  }
}

/**
 * `user_id` de todos los motorizados activos, opcionalmente sin uno.
 *
 * NOTIFICAR NO ES ASIGNAR: igual que en la rama `ready`, no se filtra por
 * `driver_availability.is_available`. El razonamiento largo está donde se tomó
 * la decisión, más abajo.
 *
 * El error se propaga a propósito: una consulta fallida devuelve lo mismo que
 * "no hay motorizados" —cero destinatarios, respuesta 200— y ese silencio es
 * exactamente el que costó tres días de diagnóstico.
 */
async function allDriverUserIds(exceptDriverId?: unknown): Promise<string[]> {
  const { data, error } = await db.from('drivers').select('id,user_id').eq('is_active', true)
  if (error) throw new Error(`drivers query: ${error.message}`)
  return (data ?? [])
    .filter((d) => d.user_id && d.id !== exceptDriverId)
    .map((d) => d.user_id as string)
}

/**
 * Soles para leerse de un vistazo en una pantalla bloqueada.
 *
 * LOS CÉNTIMOS SOLO CUANDO LOS HAY. «S/ 3» y «S/ 2.50» se leen de un golpe;
 * «S/ 3.00» obliga a procesar dos ceros que no dicen nada. Lo que NO se puede
 * hacer es lo que había —redondear a entero con `toFixed(0)`—: un vuelto de
 * S/ 2.50 anunciado como «S/ 3» manda al motorizado con medio sol de menos, y
 * uno de S/ 0.40 anunciado como «S/ 0» lo manda creyendo que no hay vuelto.
 * Es el mismo daño que arregló la migración 0131, rehecho en la capa de arriba.
 *
 * El redondeo a dos decimales es contra la coma flotante, no contra los datos:
 * la columna es `numeric(10,2)` y llega limpia, pero cualquier resta hecha en
 * JS puede devolver 2.4999999999999996 y `Number.isInteger` diría que no.
 */
function soles(n: unknown): string {
  const v = Math.round(Number(n ?? 0) * 100) / 100
  return `S/ ${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2)}`
}

/**
 * Cómo cobra el motorizado, para el cuerpo del aviso.
 *
 * EL VUELTO SALE DE `change_to_give` Y NO SE RECALCULA AQUÍ. Antes se restaba
 * `client_pays_with - (order_amount + delivery_fee)`, que da el número correcto
 * en efectivo puro por casualidad —el pedido manual guarda `order_amount` ya
 * descontada la tarifa, así que la suma cuadra— pero es la fórmula equivocada
 * en cuanto el pago es mixto: ahí la base calcula `client_pays_with -
 * cash_amount`, que es otra cosa. Restar por segunda vez lo que la base ya
 * restó solo puede empatar o divergir, nunca acertar más; y la trampa estaba
 * armada porque el cálculo vivía FUERA del `switch`, listo para que alguien
 * lo enchufara a la rama mixta y se llevara el número malo sin enterarse.
 *
 * DEVUELVE CADENA VACÍA CUANDO EL PEDIDO NO DICE CÓMO SE PAGA. Antes caía en
 * `return 'Efectivo'`, que no es un valor por defecto: es una suposición
 * presentada como dato, en el campo por el que el motorizado decide si tiene
 * que llevar sencillo. Quien recibe la cadena vacía ya sabe omitir el tramo.
 */
function formatPaymentBrief(o: {
  payment_intent?: string | null
  change_to_give?: number | null
  cash_amount?: number | null
}): string {
  // `change_to_give` es NULL cuando no aplica ("no hay parte en efectivo") y
  // solo trae número cuando hay vuelto que dar. Ver 0131, que fija esa
  // semántica a propósito y explica por qué no es 0.
  const vuelto = Number(o.change_to_give ?? 0)
  const conVuelto = (texto: string) =>
    vuelto > 0 ? `${texto} (vuelto ${soles(vuelto)})` : texto

  switch (o.payment_intent) {
    case 'prepaid':
      return 'Prepagado'
    case 'pending_yape':
      return 'Yape/Plin'
    case 'pending_cash':
      return conVuelto('Efectivo')
    case 'pending_mixed':
      // El vuelto también aquí: la base lo guarda para el pago mixto igual que
      // para el efectivo puro, y callarlo deja al motorizado sin sencillo por
      // exactamente el mismo camino.
      return conVuelto(o.cash_amount != null ? `Efectivo ${soles(o.cash_amount)} + Yape` : 'Mixto')
    default:
      return ''
  }
}

/**
 * Destino y cliente, cortos para una pantalla de teléfono.
 *
 * EL NOMBRE DEL CLIENTE YA NO VA DENTRO DEL DESTINO, y se devuelve aparte.
 * `destText` viaja en los avisos que se mandan a TODOS los motorizados activos
 * —pedido disponible, entró en cola, se liberó, lleva rato esperando— o sea a
 * gente que en su mayoría no va a llevar ese pedido. Con el nombre dentro,
 * cada uno de esos avisos publicaba «quién vive en tal referencia» en la
 * pantalla bloqueada de todo el gremio, por un pedido que ninguno tomó. La
 * referencia sola sí se queda: es la distancia, y es lo que el motorizado
 * necesita para decidir si le sirve.
 *
 * `customerName` sigue disponible para los avisos de UN destinatario —el que
 * ya tiene el pedido, o el que acaba de recibirlo en una transferencia—, que
 * es quien tiene motivo para saberlo. Con un motorizado en el piloto esto no
 * cambia nada; con tres, sí.
 */
function formatDestBrief(o: {
  delivery_reference?: string | null
  delivery_address?: string | null
  customer_name?: string | null
}): { destText: string; customerName: string } {
  let ref = (o.delivery_reference ?? o.delivery_address ?? '').trim()
  if (ref.length > 28) ref = `${ref.slice(0, 26)}…`

  let cust = (o.customer_name ?? '').trim()
  if (cust.length > 18) cust = `${cust.slice(0, 16)}…`

  return { destText: ref ? `A: ${ref}` : '', customerName: cust }
}

/** Datos del pedido que aparecen en el cuerpo de cualquier aviso al motorizado. */
async function orderBrief(orderId: string) {
  const { data: o } = await db
    .from('orders')
    /*
     * SOLO LO QUE ALGUIEN LEE. Se cayeron cinco columnas que se pedían y no se
     * usaban: `yape_amount` y `client_pays_with` nunca se leyeron, y
     * `order_amount`/`delivery_fee` se quedaron sin lector cuando el vuelto
     * pasó a salir de `change_to_give`. Una columna en el `select` es una
     * promesa de que alguien la mira; las que no, envejecen mintiendo.
     */
    .select(`
      short_id,
      business_id,
      driver_id,
      status,
      prep_time_minutes,
      customer_name,
      delivery_reference,
      delivery_address,
      payment_intent,
      change_to_give,
      cash_amount
    `)
    .eq('id', orderId)
    .maybeSingle()
  if (!o) return null
  const { data: biz } = await db
    .from('businesses')
    .select('name')
    .eq('id', o.business_id)
    .maybeSingle()

  const { destText, customerName } = formatDestBrief(o)
  const payText = formatPaymentBrief(o)

  return {
    sid: (o.short_id as string) ?? '',
    bizName: (biz?.name as string) ?? 'el restaurante',
    driverId: o.driver_id as string | null,
    status: o.status as string,
    prepMinutes: Number(o.prep_time_minutes ?? 0),
    destText,
    customerName,
    payText,
  }
}

/**
 * Aviso anticipado a los motorizados: la cocina tardará y conviene que lo sepan
 * antes de que la comida esté lista. Se dispara en los dos momentos en que un
 * pedido entra en cocina —`OrderCreated` para el manual, que nace en
 * `preparing`, y `action='accept'` para el del cliente, que sale de
 * `pending_acceptance`— replicando el par `OrderCreated`/`OrderAcceptedByRestaurant`
 * del v1. Por debajo del umbral no se avisa: el aviso de `ready` llega antes de
 * que al motorizado le dé tiempo a moverse, y dos pushes seguidos por el mismo
 * pedido son ruido.
 */
const HEADS_UP_MIN_PREP_MINUTES = 10

async function headsUpNotes(orderId: string, eventType: string): Promise<Note[]> {
  const o = await orderBrief(orderId)
  if (!o) return []
  if (o.status !== 'preparing') return []
  if (o.prepMinutes <= HEADS_UP_MIN_PREP_MINUTES) return []
  const userIds = await allDriverUserIds()
  const dest = o.destText ? `${o.destText} · ` : ''
  return userIds.map((userId) => ({
    userId,
    title: `🍳 ${o.bizName} · En cocina (${o.prepMinutes} min)`,
    body: `${dest}Te avisaremos cuando esté por salir · #${o.sid}`,
    tag: `${eventType}-headsup-${o.sid}`,
    url: '/',
    requireInteraction: false,
    vibrate: false,
  }))
}

/**
 * Aviso a la cajera de que entró un pedido del cliente.
 *
 * Hasta la 0136 esto no salía por aquí sino por Inngest
 * (`order/notify-business` → `apps/api/lib/push/send.ts`): un SEGUNDO camino de
 * push, con su propia pareja VAPID en Vercel, su propio `catch {}` que se comía
 * los fallos y un `tag` constante (`'new-order'`) que hacía que dos pedidos
 * seguidos colapsaran en una sola notificación. Ahora el destinatario se
 * resuelve aquí, con la misma pareja de llaves que los otros doce avisos.
 *
 * Solo los estados en los que la cajera TIENE que hacer algo. El pedido manual
 * nace en `preparing` —lo acaba de teclear ella— y no se avisa a sí misma.
 */
async function newOrderBusinessNotes(orderId: string): Promise<Note[]> {
  const { data: o } = await db
    .from('orders')
    .select('short_id,business_id,status,customer_name,order_amount')
    .eq('id', orderId)
    .maybeSingle()
  if (!o) return []
  const status = o.status as string
  if (status !== 'pending_acceptance' && status !== 'validando') return []
  const { data: biz } = await db
    .from('businesses')
    .select('user_id')
    .eq('id', o.business_id)
    .maybeSingle()
  const bizUser = (biz?.user_id as string | null) ?? null
  if (!bizUser) return []
  const sid = (o.short_id as string) ?? ''
  const who = ((o.customer_name as string) ?? '').trim() || 'Un cliente'
  return [
    {
      userId: bizUser,
      title: `Nuevo pedido #${sid} · S/ ${Number(o.order_amount ?? 0).toFixed(2)}`,
      // Sin el número de minutos: el plazo vive en `app_settings.timers` y
      // escribirlo aquí lo dejaría mintiendo en cuanto alguien lo cambie.
      body:
        status === 'validando'
          ? `${who} · llámalo para validarlo antes de que se cancele`
          : `${who} · acéptalo antes de que se cancele`,
      tag: `OrderCreated-${sid}`,
      url: '/',
      // La cajera puede tener el celular en el mostrador y de espaldas: sin
      // `requireInteraction` el aviso se descarta solo y el pedido se cancela
      // por silencio.
      requireInteraction: true,
      vibrate: true,
    },
  ]
}

async function buildNotes(eventType: string, aggregateId: string, payload: Record<string, unknown>): Promise<Note[]> {
  const out: Note[] = []
  const action = (payload?.action as string) ?? ''
  const tagOf = (sid: string) => `${eventType}-${action}-${sid}`

  if (eventType === 'OrderStatusChanged' || eventType === 'OrderExpired') {
    const { data: o } = await db
      .from('orders')
      .select('short_id,business_id,customer_user_id,driver_id,cancel_reason')
      .eq('id', aggregateId)
      .maybeSingle()
    if (!o) return out
    const sid = o.short_id as string
    const { data: biz } = await db
      .from('businesses')
      .select('name,user_id')
      .eq('id', o.business_id)
      .maybeSingle()
    const bizName = (biz?.name as string) ?? 'el restaurante'
    const bizUser = biz?.user_id as string | null
    const cust = o.customer_user_id as string | null
    const custUrl = `/pedido/${sid}`
    const push = (
      userId: string | null,
      title: string,
      body: string,
      o2?: { url?: string; req?: boolean; renotify?: boolean },
    ) => {
      if (!userId) return
      out.push({
        userId,
        title,
        body,
        tag: tagOf(sid),
        url: o2?.url ?? custUrl,
        requireInteraction: Boolean(o2?.req),
        vibrate: Boolean(o2?.req),
        renotify: Boolean(o2?.renotify ?? o2?.req),
      })
    }

    if (eventType === 'OrderExpired') {
      push(cust, 'Pedido cancelado', `#${sid} cancelado · se agotó el tiempo`)
    } else if (action === 'accept') {
      push(cust, 'Tu pedido fue confirmado', `${bizName} confirmó #${sid} y empezó a prepararlo`)
      // El negocio acaba de meterlo en cocina: si va a tardar, los motorizados
      // lo saben desde ya en vez de enterarse cuando la comida ya está fría.
      out.push(...(await headsUpNotes(aggregateId, eventType)))
    } else if (action === 'ready') {
      /**
       * NOTIFICAR NO ES ASIGNAR.
       *
       * Se avisa a TODOS los motorizados activos con suscripción, SIN filtrar
       * por `driver_availability.is_available`. El filtro sigue vigente donde
       * corresponde —quién puede TOMAR el pedido— pero no puede gobernar quién
       * se ENTERA de que existe.
       */
      const { data: drivers, error: driversErr } = await db
        .from('drivers')
        .select('user_id')
        .eq('is_active', true)
      if (driversErr) throw new Error(`drivers query: ${driversErr.message}`)
      const oBrief = await orderBrief(aggregateId)
      const bName = oBrief?.bizName ?? bizName
      const dest = oBrief?.destText ? `${oBrief.destText} · ` : ''
      const pay = oBrief?.payText ? `${oBrief.payText} · ` : ''
      for (const d of drivers ?? []) {
        if (d.user_id) {
          push(
            d.user_id as string,
            `⚡ ${bName} · ¡Listo para llevar!`,
            `${dest}${pay}#${sid}`,
            {
              url: `/pedido/${aggregateId}`,
              req: true,
              renotify: true,
            },
          )
        }
      }
    } else if (action === 'take') {
      push(bizUser, 'Motorizado en camino', `Un motorizado va por #${sid}`, { url: '/' })
    } else if (action === 'arrived') {
      push(bizUser, 'Motorizado en tu local', `Está esperando #${sid}`, { url: '/', req: true })
    } else if (action === 'pickup') {
      push(cust, 'Tu pedido salió', 'Va camino a la entrega')
      push(bizUser, 'Pedido recogido', `#${sid} salió a entrega`, { url: '/' })
    } else if (action === 'arrived_customer') {
      /**
       * El aviso que más le cuesta al cliente no recibir.
       *
       * Marcar la llegada arranca el reloj de `noShowWaitMinutes`. Cuando vence,
       * el motorizado puede declarar `no_show`, y eso cancela el pedido E
       * inserta una fila en `customer_strikes` — que `create_customer_order`
       * lee para obligar a validación en TODOS los pedidos futuros de ese
       * teléfono. Sin este push, alguien pierde su pedido y se lleva una
       * penalización permanente sin haber sabido nunca que el motorizado estaba
       * en su puerta.
       */
      const wait = await timerMinutes('noShowWaitMinutes', 5)
      push(
        cust,
        'El motorizado está en tu puerta',
        // "puede cancelarlo", no "se cancela": el no-show lo declara la persona
        // cuando vence la espera, no un cron.
        `#${sid} · sal a recibirlo · pasados ${wait} min puede cancelarlo`,
        { req: true },
      )
    } else if (action === 'no_show') {
      push(cust, 'Pedido cancelado', `#${sid} · el motorizado esperó y nadie salió`, { req: true })
      push(bizUser, 'Pedido cancelado', `#${sid} · el cliente no apareció`, { url: '/' })
    } else if (action === 'validate_fail_retry') {
      // La cajera rechazó el comprobante y el pedido volvió a `awaiting_payment`.
      // El cliente tiene que subir otro, con tope de dos intentos y el cron de
      // expiración de prepago corriendo: enterarse tarde le quema la ventana.
      push(cust, 'Comprobante rechazado', `#${sid} · revisa el pago y sube otro comprobante`, {
        req: true,
      })
    } else if (action === 'validate_fail') {
      push(cust, 'Pedido cancelado', `#${sid} · no se pudo verificar el comprobante`, { req: true })
    } else if (action === 'deliver') {
      push(cust, 'Pedido entregado', '¡Gracias por usar Tindivo!')
      push(bizUser, 'Pedido entregado', `#${sid} fue entregado`, { url: '/' })
    } else if (action === 'cancel') {
      const reason = (o.cancel_reason as string) ?? ''
      push(cust, 'Pedido cancelado', `#${sid} cancelado`)
      push(bizUser, 'Pedido cancelado', `#${sid} cancelado · ${reason}`, { url: '/' })
      // Si ya tenía motorizado, es quien más necesita saberlo: puede estar
      // yendo al local o esperando la comida en el mostrador.
      const oBrief = await orderBrief(aggregateId)
      const who = oBrief?.customerName ? ` de ${oBrief.customerName}` : ''
      push(
        await driverUserId(o.driver_id),
        `❌ CANCELADO · ${bizName}`,
        `Pedido${who} (#${sid}) se canceló · no vayas al local`,
        { url: `/pedido/${aggregateId}`, req: true, renotify: true },
      )
    }
  } else if (eventType === 'OrderCreated') {
    // El pedido manual nace en `preparing`, así que aquí ya está en cocina.
    // El del cliente nace en `pending_acceptance` y `headsUpNotes` lo descarta
    // por estado — su aviso al motorizado sale con `action='accept'`.
    out.push(...(await headsUpNotes(aggregateId, eventType)))
    // Y el del cliente es, justamente, el que la cajera tiene que atender.
    out.push(...(await newOrderBusinessNotes(aggregateId)))
  } else if (eventType === 'OrderQueued') {
    /**
     * El pedido entró a la bandeja por RELOJ, no porque nadie pulsara nada:
     * `appears_in_queue_at` = `listo - queueLeadMinutes` (0117).
     */
    const o = await orderBrief(aggregateId)
    if (o) {
      const mins = Number(payload?.minutesToReady ?? 0)
      const when = mins > 1 ? `Listo en ~${mins} min` : 'Por salir'
      const dest = o.destText ? `${o.destText} · ` : ''
      const pay = o.payText ? `${o.payText} · ` : ''
      for (const userId of await allDriverUserIds()) {
        out.push({
          userId,
          title: `🥡 ${o.bizName} · Por salir`,
          body: `${dest}${when} · ${pay}#${o.sid}`,
          tag: `OrderQueued-${o.sid}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
          renotify: true,
        })
      }
    }
  } else if (eventType === 'OrderReleased') {
    // El motorizado soltó el pedido y vuelve a la bolsa. Se avisa a todos los
    // demás, no al que lo soltó.
    const o = await orderBrief(aggregateId)
    if (o) {
      const dest = o.destText ? `${o.destText} · ` : ''
      const pay = o.payText ? `${o.payText} · ` : ''
      for (const userId of await allDriverUserIds(payload?.driverId)) {
        out.push({
          userId,
          title: `🔓 ${o.bizName} · Pedido libre`,
          body: `${dest}Se liberó carrera · ${pay}#${o.sid}`,
          tag: `OrderReleased-${o.sid}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
          renotify: true,
        })
      }
    }
  } else if (eventType === 'OrderOverdue') {
    const o = await orderBrief(aggregateId)
    if (o) {
      const mins = Number(payload?.minutesWaiting ?? 0)
      const dest = o.destText ? `${o.destText} · ` : ''
      for (const userId of await allDriverUserIds()) {
        out.push({
          userId,
          title: `⏰ ${o.bizName} · Espera motorizado`,
          body: `Lleva ${mins} min esperando · ${dest}#${o.sid}`,
          tag: `OrderOverdue-${o.sid}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
          renotify: true,
        })
      }
    }
  } else if (eventType === 'TransferRequested') {
    // Al dueño actual (`fromDriverId`), no al solicitante: tiene una ventana de
    // segundos para responder y, desde la 0130, callarse le cede el pedido.
    const o = await orderBrief(aggregateId)
    const owner = await driverUserId(payload?.fromDriverId)
    if (o && owner) {
      const seconds = Math.max(
        0,
        Math.round((new Date(String(payload?.expiresAt)).getTime() - Date.now()) / 1000),
      )
      const who = o.customerName ? ` de ${o.customerName}` : ''
      out.push({
        userId: owner,
        title: `🔄 Te piden tu pedido · ${o.bizName}`,
        body: `Un compañero pide el pedido${who} (#${o.sid}). Responde en ${seconds || 30}s.`,
        tag: `TransferRequested-${payload?.requestId ?? aggregateId}`,
        url: '/',
        requireInteraction: true,
        vibrate: true,
        renotify: true,
      })
    }
  } else if (eventType === 'TransferResolved') {
    const o = await orderBrief(aggregateId)
    const resolution = (payload?.resolution as string) ?? ''
    const transferred = payload?.transferred === true
    const reqId = payload?.requestId ?? aggregateId
    let fromId = payload?.fromDriverId
    let toId = payload?.toDriverId
    if ((!fromId || !toId) && typeof reqId === 'string') {
      const { data: req } = await db
        .from('order_transfer_requests')
        .select('from_driver_id,to_driver_id')
        .eq('id', reqId)
        .maybeSingle()
      fromId = fromId ?? req?.from_driver_id
      toId = toId ?? req?.to_driver_id
    }
    const owner = await driverUserId(fromId)
    const requester = await driverUserId(toId)
    const dest = o?.destText ? `${o.destText} · ` : ''
    const who = o?.customerName ? ` de ${o.customerName}` : ''

    if (o && resolution === 'accepted' && requester) {
      out.push({
        userId: requester,
        title: `✅ Pedido recibido · ${o.bizName}`,
        body: `${dest}Ya está en tu mochila · #${o.sid}`,
        tag: `TransferResolved-accepted-${reqId}`,
        url: `/pedido/${aggregateId}`,
        requireInteraction: true,
        vibrate: true,
        renotify: true,
      })
    } else if (o && resolution === 'rejected' && requester) {
      out.push({
        userId: requester,
        title: `Rechazado · ${o.bizName}`,
        body: `Tu compañero se queda con el pedido #${o.sid}.`,
        tag: `TransferResolved-rejected-${reqId}`,
        url: '/',
        requireInteraction: false,
        vibrate: false,
      })
    } else if (o && resolution === 'expired' && transferred) {
      if (owner) {
        out.push({
          userId: owner,
          title: `🔄 Pedido transferido · ${o.bizName}`,
          body: `El pedido${who} (#${o.sid}) pasó a tu compañero por tiempo agotado`,
          tag: `TransferResolved-expired-from-${reqId}`,
          url: '/',
          requireInteraction: true,
          vibrate: true,
          renotify: true,
        })
      }
      if (requester) {
        out.push({
          userId: requester,
          title: `✅ Pedido recibido · ${o.bizName}`,
          body: `${dest}Nadie respondió, te lo quedas · #${o.sid}`,
          tag: `TransferResolved-expired-to-${reqId}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
          renotify: true,
        })
      }
    } else if (o && resolution === 'expired' && !transferred && requester) {
      const reason = (payload?.reason as string) ?? ''
      out.push({
        userId: requester,
        title: `Vencido · ${o.bizName}`,
        body:
          reason === 'requester_no_capacity'
            ? `Tu mochila está llena, el pedido #${o.sid} se quedó con su dueño.`
            : `La solicitud venció y el pedido #${o.sid} se quedó con su dueño.`,
        tag: `TransferResolved-expired-none-${reqId}`,
        url: '/',
        requireInteraction: false,
        vibrate: false,
      })
    }
  } else if (
    eventType === 'CashConfirmed' ||
    eventType === 'CashDisputed' ||
    eventType === 'CashResolved'
  ) {
    const { data: cs } = await db
      .from('cash_settlements')
      .select(
        'driver_id,business_id,delivered_amount,reported_amount,resolved_amount,confirmed_amount',
      )
      .eq('id', aggregateId)
      .maybeSingle()
    const driverUser = await driverUserId(cs?.driver_id)
    if (driverUser) {
      /*
       * DOS DECIMALES SIEMPRE, y no el `soles()` de arriba a propósito. Aquel
       * suelta los céntimos cuando son cero porque su trabajo es leerse de un
       * vistazo en una notificación operativa; estos avisos son de CUADRE DE
       * CAJA —lo que el negocio confirmó, lo que queda abierto— y ahí la
       * columna de céntimos se lee contra un papel o contra otra pantalla.
       * Alinear las dos cifras vale más que ahorrar dos ceros.
       */
      const money = (n: unknown) => `S/ ${Number(n ?? 0).toFixed(2)}`
      const base = { userId: driverUser, url: '/efectivo', vibrate: false }
      if (eventType === 'CashConfirmed') {
        const { data: biz } = await db
          .from('businesses')
          .select('name')
          .eq('id', cs?.business_id)
          .maybeSingle()
        const bName = (biz?.name as string) ?? 'El restaurante'
        const abierto = await openCashTotal(cs?.driver_id, cs?.business_id)
        out.push({
          ...base,
          title: `💵 Efectivo confirmado · ${bName}`,
          body:
            abierto.count === 0
              ? `${bName} confirmó ${money(cs?.confirmed_amount)}. No queda nada por confirmar.`
              : `${bName} confirmó ${money(cs?.confirmed_amount)}. Te quedan ${money(abierto.total)} por confirmar (${abierto.count}).`,
          tag: `CashConfirmed-${cs?.driver_id}-${cs?.business_id}`,
          requireInteraction: false,
          renotify: true,
        })
      } else if (eventType === 'CashDisputed') {
        out.push({
          ...base,
          title: 'Diferencia reportada',
          body: `El negocio dice haber recibido ${money(cs?.reported_amount)} de los ${money(cs?.delivered_amount)} que declaraste. Tindivo lo revisa — no discutas en el local.`,
          tag: `CashDisputed-${aggregateId}`,
          requireInteraction: true,
        })
      } else {
        out.push({
          ...base,
          title: 'Caso resuelto por Tindivo',
          body: `Monto final: ${money(cs?.resolved_amount)}.`,
          tag: `CashResolved-${aggregateId}`,
          requireInteraction: false,
        })
      }
    }
  } else if (eventType === 'CashDelivered') {
    const { data: cs } = await db
      .from('cash_settlements')
      .select('driver_id,business_id,delivered_amount,businesses(user_id),drivers(full_name)')
      .eq('id', aggregateId)
      .maybeSingle()
    const bizUser = (cs?.businesses as { user_id?: string } | null)?.user_id ?? null
    if (bizUser) {
      // COLAPSADA POR (motorizado, negocio) — ver el comentario de CashConfirmed.
      // El motorizado entrega nombrando clientes uno tras otro; sin colapsar,
      // la cajera recibía una notificación por cada nombre mientras él seguía
      // hablando. El cuerpo dice el TOTAL abierto, no el último pedido, así que
      // la última notificación que sobrevive al reemplazo sigue siendo correcta
      // aunque las anteriores lleguen desordenadas.
      const abierto = await openCashTotal(cs?.driver_id, cs?.business_id)
      const quien = (cs?.drivers as { full_name?: string } | null)?.full_name ?? 'El motorizado'
      const cliente = (payload?.customerName as string | null) ?? null
      const monto = `S/ ${Number(cs?.delivered_amount ?? 0).toFixed(2)}`
      out.push({
        userId: bizUser,
        title: 'Efectivo por confirmar',
        body:
          abierto.count > 1
            ? `${quien} te entregó S/ ${abierto.total.toFixed(2)} · ${abierto.count} pedidos por confirmar`
            : `${quien} te entregó ${monto}${cliente ? ` de ${cliente}` : ''}`,
        tag: `CashDelivered-${cs?.driver_id}-${cs?.business_id}`,
        url: '/efectivo',
        requireInteraction: true,
        vibrate: false,
      })
    }
  }
  return out
}

Deno.serve(async (req: Request) => {
  // Config rota → 500 con el motivo, para CUALQUIER petición (incluida una
  // inerte de smoke test). Es la diferencia entre "el worker está sano" y "el
  // worker arranca pero no puede firmar nada".
  if (bootError) {
    console.error('[send-push] config invalida:', bootError)
    return new Response(JSON.stringify({ ok: false, error: 'config', detail: bootError }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const { event_type, aggregate_id, payload } = await req.json()
    const notes = await buildNotes(event_type, aggregate_id, payload ?? {})
    let sent = 0
    let failed = 0

    for (const note of notes) {
      const { data: subs } = await db
        .from('push_subscriptions')
        .select('id,endpoint,p256dh,auth,failure_count')
        .eq('user_id', note.userId)
      for (const sub of subs ?? []) {
        const body = JSON.stringify({
          title: note.title,
          body: note.body,
          tag: note.tag,
          url: note.url,
          requireInteraction: note.requireInteraction,
          ...(note.renotify ? { renotify: true } : {}),
          ...(note.vibrate ? { vibrate: [300, 100, 300, 100, 500] } : {}),
        })
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          )
          sent++
          await db.from('push_delivery_log').insert({
            subscription_id: sub.id,
            event_type,
            status: 'ok',
          })
          await db
            .from('push_subscriptions')
            .update({ last_successful_at: new Date().toISOString(), failure_count: 0 })
            .eq('id', sub.id)
        } catch (e) {
          failed++
          const code = (e as { statusCode?: number })?.statusCode ?? null
          await db.from('push_delivery_log').insert({
            subscription_id: sub.id,
            event_type,
            status: 'error',
            error_code: code,
            error_message: String((e as { body?: string })?.body ?? (e as Error)?.message ?? e).slice(0, 500),
          })
          if (code === 404 || code === 410) {
            await db.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            await db
              .from('push_subscriptions')
              .update({
                last_failed_at: new Date().toISOString(),
                failure_count: (sub.failure_count ?? 0) + 1,
              })
              .eq('id', sub.id)
          }
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, recipients: notes.length, sent, failed }), {
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }
})
