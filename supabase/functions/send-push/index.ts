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

/** Datos del pedido que aparecen en el cuerpo de cualquier aviso al motorizado. */
async function orderBrief(orderId: string) {
  const { data: o } = await db
    .from('orders')
    .select('short_id,business_id,driver_id,status,prep_time_minutes,order_amount')
    .eq('id', orderId)
    .maybeSingle()
  if (!o) return null
  const { data: biz } = await db
    .from('businesses')
    .select('name')
    .eq('id', o.business_id)
    .maybeSingle()
  return {
    sid: (o.short_id as string) ?? '',
    bizName: (biz?.name as string) ?? 'el restaurante',
    driverId: o.driver_id as string | null,
    status: o.status as string,
    prepMinutes: Number(o.prep_time_minutes ?? 0),
    amount: `S/ ${Number(o.order_amount ?? 0).toFixed(2)}`,
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
  return userIds.map((userId) => ({
    userId,
    title: `Pedido en cocina — ${o.bizName}`,
    body: `${o.amount} · estará listo en ${o.prepMinutes} min. Atento.`,
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
    const push = (userId: string | null, title: string, body: string, o2?: { url?: string; req?: boolean }) => {
      if (!userId) return
      out.push({
        userId,
        title,
        body,
        tag: tagOf(sid),
        url: o2?.url ?? custUrl,
        requireInteraction: Boolean(o2?.req),
        vibrate: Boolean(o2?.req),
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
       *
       * Filtrar aquí creaba un bloqueo circular, medido en producción: el cron
       * `close-driver-shifts` apaga la disponibilidad de todos al cerrar el
       * horario (23:00 Perú). Al día siguiente entra un pedido, `is_available`
       * es false para todos, nadie recibe el aviso, y por tanto nadie se entera
       * de que hay trabajo — así que nadie abre la app para volver a activarse.
       * La única salida era que el motorizado entrase por azar.
       *
       * El v1 ya había llegado a esta conclusión y la dejó escrita en su propio
       * `send-push` ("dejándolos en un limbo donde no podían volver a
       * participar sin entrar primero a la PWA por azar"). v2 reintrodujo el
       * filtro al reescribir la función.
       */
      const { data: drivers, error: driversErr } = await db
        .from('drivers')
        .select('user_id')
        .eq('is_active', true)
      // Este error SÍ se mira: si la consulta falla, el resultado es
      // indistinguible de "no hay motorizados" — un 200 con recipients 0 que
      // parece normal. Es justo el silencio que costó tres días de diagnóstico.
      if (driversErr) throw new Error(`drivers query: ${driversErr.message}`)
      for (const d of drivers ?? []) {
        if (d.user_id) {
          // Deeplink al pedido, no a la raíz: tocar el aviso tiene que abrir
          // LO que se está avisando.
          push(d.user_id as string, 'Nuevo pedido disponible', `${bizName} · #${sid}`, {
            url: `/pedido/${aggregateId}`,
            req: true,
          })
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
      push(
        await driverUserId(o.driver_id),
        'Pedido cancelado',
        `#${sid} se canceló · no lo recojas`,
        { url: `/pedido/${aggregateId}`, req: true },
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
     * `appears_in_queue_at` = `listo - queueLeadMinutes` (0117). Era el único
     * camino de entrada a la bandeja que no avisaba, así que el pedido aparecía
     * en silencio y solo lo veía quien tuviera la app abierta por azar.
     *
     * Es el aviso accionable —"ya puedes tomarlo"—, de ahí `requireInteraction`.
     * El de `headsUpNotes` es el previo ("va a tardar, atento") y no compite:
     * ese solo sale con `prep > 10`, que es exactamente cuando hay hueco entre
     * los dos momentos.
     */
    const o = await orderBrief(aggregateId)
    if (o) {
      const mins = Number(payload?.minutesToReady ?? 0)
      const when = mins > 1 ? `estará listo en ~${mins} min` : 'está por salir'
      for (const userId of await allDriverUserIds()) {
        out.push({
          userId,
          title: `Ya puedes tomarlo — ${o.bizName}`,
          body: `#${o.sid} · ${o.amount} · ${when}`,
          tag: `OrderQueued-${o.sid}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
        })
      }
    }
  } else if (eventType === 'OrderReleased') {
    // El motorizado soltó el pedido y vuelve a la bolsa. Se avisa a todos los
    // demás, no al que lo soltó.
    const o = await orderBrief(aggregateId)
    if (o) {
      for (const userId of await allDriverUserIds(payload?.driverId)) {
        out.push({
          userId,
          title: `Pedido libre — ${o.bizName}`,
          body: `#${o.sid} · ${o.amount} · se liberó, tómalo`,
          tag: `OrderReleased-${o.sid}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
        })
      }
    }
  } else if (eventType === 'OrderOverdue') {
    const o = await orderBrief(aggregateId)
    if (o) {
      const mins = Number(payload?.minutesWaiting ?? 0)
      for (const userId of await allDriverUserIds()) {
        out.push({
          userId,
          title: `Se está enfriando — ${o.bizName}`,
          body: `#${o.sid} lleva ${mins} min sin motorizado · ${o.amount}`,
          tag: `OrderOverdue-${o.sid}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
        })
      }
    }
  } else if (eventType === 'TransferRequested') {
    // Al dueño actual (`fromDriverId`), no al solicitante: tiene una ventana de
    // segundos para responder y, desde la 0130, callarse le cede el pedido.
    // Por eso `requireInteraction`: en Android con Doze, un aviso sin él se
    // clasifica como baja prioridad y puede no llegar a verse.
    const o = await orderBrief(aggregateId)
    const owner = await driverUserId(payload?.fromDriverId)
    if (o && owner) {
      const seconds = Math.max(
        0,
        Math.round((new Date(String(payload?.expiresAt)).getTime() - Date.now()) / 1000),
      )
      out.push({
        userId: owner,
        title: `Te piden tu pedido — #${o.sid}`,
        body: `Un compañero quiere llevarlo. Responde en ${seconds || 30}s o se lo llevará.`,
        tag: `TransferRequested-${payload?.requestId ?? aggregateId}`,
        url: '/',
        requireInteraction: true,
        vibrate: true,
      })
    }
  } else if (eventType === 'TransferResolved') {
    const o = await orderBrief(aggregateId)
    const resolution = (payload?.resolution as string) ?? ''
    const transferred = payload?.transferred === true
    const reqId = payload?.requestId ?? aggregateId
    // `fromDriverId`/`toDriverId` vienen del payload desde la 0134. Si falta
    // (evento anterior a la migración, o Edge Function desplegada antes que
    // ella), se recuperan de la solicitud: el acoplamiento código↔migración ya
    // dejó producción sin pedidos una vez, y aquí sale gratis no repetirlo.
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

    if (o && resolution === 'accepted' && requester) {
      out.push({
        userId: requester,
        title: `Aceptó — #${o.sid} es tuyo`,
        body: `${o.bizName} · ${o.amount} · ya está en tu mochila`,
        tag: `TransferResolved-accepted-${reqId}`,
        url: `/pedido/${aggregateId}`,
        requireInteraction: true,
        vibrate: true,
      })
    } else if (o && resolution === 'rejected' && requester) {
      out.push({
        userId: requester,
        title: `Rechazó — #${o.sid}`,
        body: 'Tu compañero se queda con el pedido.',
        tag: `TransferResolved-rejected-${reqId}`,
        url: '/',
        requireInteraction: false,
        vibrate: false,
      })
    } else if (o && resolution === 'expired' && transferred) {
      // Doble aviso con TAGS DISTINTOS. Con el mismo tag, FCM/APNs colapsan los
      // dos en uno y el que perdió el pedido vería el mensaje del que lo ganó.
      if (owner) {
        out.push({
          userId: owner,
          title: `Perdiste #${o.sid}`,
          body: 'No respondiste a tiempo · el pedido pasó a tu compañero',
          tag: `TransferResolved-expired-from-${reqId}`,
          url: '/',
          requireInteraction: true,
          vibrate: true,
        })
      }
      if (requester) {
        out.push({
          userId: requester,
          title: `#${o.sid} es tuyo`,
          body: `${o.bizName} · ${o.amount} · nadie respondió, te lo quedas`,
          tag: `TransferResolved-expired-to-${reqId}`,
          url: `/pedido/${aggregateId}`,
          requireInteraction: true,
          vibrate: true,
        })
      }
    } else if (o && resolution === 'expired' && !transferred && requester) {
      // Venció y el pedido NO se movió. El único motivo que hoy produce la
      // 0130 es la mochila llena; se nombra para que el solicitante entienda
      // por qué no calificó en vez de creer que el sistema falló.
      const reason = (payload?.reason as string) ?? ''
      out.push({
        userId: requester,
        title: `Se venció — #${o.sid}`,
        body:
          reason === 'requester_no_capacity'
            ? 'Tu mochila está llena, el pedido se quedó con su dueño.'
            : 'La solicitud venció y el pedido se quedó con su dueño.',
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
      const money = (n: unknown) => `S/ ${Number(n ?? 0).toFixed(2)}`
      const base = { userId: driverUser, url: '/efectivo', vibrate: false }
      if (eventType === 'CashConfirmed') {
        // COLAPSADA POR (motorizado, negocio). Desde 0157 la cajera confirma
        // cliente por cliente, así que cuatro confirmaciones seguidas son cuatro
        // eventos. Con un tag por liquidación, el motorizado recibía cuatro
        // notificaciones apiladas diciendo casi lo mismo; con este tag la
        // notificación se REEMPLAZA y el cuerpo describe el estado actual —
        // cuánto le queda abierto— en vez del último delta.
        const abierto = await openCashTotal(cs?.driver_id, cs?.business_id)
        out.push({
          ...base,
          title: 'Efectivo confirmado',
          body:
            abierto.count === 0
              ? `El negocio confirmó ${money(cs?.confirmed_amount)}. No queda nada por confirmar.`
              : `El negocio confirmó ${money(cs?.confirmed_amount)}. Te quedan ${money(abierto.total)} por confirmar (${abierto.count}).`,
          tag: `CashConfirmed-${cs?.driver_id}-${cs?.business_id}`,
          requireInteraction: false,
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
          ...(note.vibrate ? { vibrate: [120, 60, 120] } : {}),
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
