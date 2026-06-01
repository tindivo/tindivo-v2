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

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
}
const db = createClient(url, serviceKey)

type Note = {
  userId: string
  title: string
  body: string
  tag: string
  url: string
  requireInteraction: boolean
  vibrate: boolean
}

function unwrapAvailability(v: unknown): boolean {
  if (Array.isArray(v)) return Boolean((v[0] as { is_available?: boolean })?.is_available)
  return Boolean((v as { is_available?: boolean })?.is_available)
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
    } else if (action === 'ready') {
      const { data: drivers } = await db
        .from('drivers')
        .select('user_id,driver_availability(is_available)')
        .eq('is_active', true)
      for (const d of drivers ?? []) {
        if (unwrapAvailability(d.driver_availability) && d.user_id) {
          push(d.user_id as string, 'Nuevo pedido disponible', `${bizName} · #${sid}`, { url: '/', req: true })
        }
      }
    } else if (action === 'take') {
      push(bizUser, 'Motorizado en camino', `Un motorizado va por #${sid}`, { url: '/' })
    } else if (action === 'arrived') {
      push(bizUser, 'Motorizado en tu local', `Está esperando #${sid}`, { url: '/', req: true })
    } else if (action === 'pickup') {
      push(cust, 'Tu pedido salió', 'Va camino a la entrega')
      push(bizUser, 'Pedido recogido', `#${sid} salió a entrega`, { url: '/' })
    } else if (action === 'deliver') {
      push(cust, 'Pedido entregado', '¡Gracias por usar Tindivo!')
      push(bizUser, 'Pedido entregado', `#${sid} fue entregado`, { url: '/' })
    } else if (action === 'cancel') {
      const reason = (o.cancel_reason as string) ?? ''
      push(cust, 'Pedido cancelado', `#${sid} cancelado`)
      push(bizUser, 'Pedido cancelado', `#${sid} cancelado · ${reason}`, { url: '/' })
    }
  } else if (eventType === 'CashDelivered') {
    const { data: cs } = await db
      .from('cash_settlements')
      .select('delivered_amount,businesses(user_id)')
      .eq('id', aggregateId)
      .maybeSingle()
    const bizUser = (cs?.businesses as { user_id?: string } | null)?.user_id ?? null
    if (bizUser) {
      out.push({
        userId: bizUser,
        title: 'Efectivo por confirmar',
        body: `El motorizado dice que te entregó S/ ${Number(cs?.delivered_amount ?? 0).toFixed(2)}`,
        tag: `CashDelivered-${aggregateId}`,
        url: '/efectivo',
        requireInteraction: true,
        vibrate: false,
      })
    }
  }
  return out
}

Deno.serve(async (req: Request) => {
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
