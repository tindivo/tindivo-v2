import webpush from 'web-push'
import { createServiceClient } from '../supabase/service'

// VAPID configuration
const vapidPublicKey = (process.env.VAPID_PUBLIC_KEY ?? '').replace(/"/g, '')
const vapidPrivateKey = (process.env.VAPID_PRIVATE_KEY ?? '').replace(/"/g, '')
const vapidSubject = (process.env.VAPID_SUBJECT ?? '').replace(/"/g, '')

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

/**
 * Envía una notificación Web Push a todos los dispositivos registrados activos del usuario.
 * Es de tipo best-effort y nunca arroja excepciones.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  const service = createServiceClient()

  try {
    // 1. Obtener todas las suscripciones activas del usuario (failure_count < 5)
    const { data: subscriptions, error } = await service
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .lt('failure_count', 5)

    if (error || !subscriptions || subscriptions.length === 0) {
      return
    }

    const payloadStr = JSON.stringify(payload)

    // 2. Enviar a cada dispositivo en paralelo
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          }

          await webpush.sendNotification(pushSubscription, payloadStr)

          // Registrar envío exitoso
          await service.from('push_delivery_log').insert({
            subscription_id: sub.id,
            event_type: payload.tag ?? 'unknown',
            status: 'ok',
          })

          // Si tenía fallos acumulados, restablecer el contador
          await service
            .from('push_subscriptions')
            .update({
              last_successful_at: new Date().toISOString(),
              failure_count: sub.failure_count > 0 ? 0 : sub.failure_count,
            })
            .eq('id', sub.id)
        } catch (err: any) {
          const status = err.statusCode || err.status || 0
          const message = err.message || String(err)

          // Registrar fallo de envío
          await service.from('push_delivery_log').insert({
            subscription_id: sub.id,
            event_type: payload.tag ?? 'unknown',
            status: 'error',
            error_code: status || null,
            error_message: message,
          })

          if (status === 404 || status === 410) {
            // Suscripción expirada o inexistente -> Eliminar de inmediato
            await service.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            // Error transitorio -> Incrementar contador de fallos
            await service
              .from('push_subscriptions')
              .update({
                failure_count: sub.failure_count + 1,
                last_failed_at: new Date().toISOString(),
              })
              .eq('id', sub.id)
          }
        }
      }),
    )
  } catch {
    // Silenciar errores para garantizar el diseño best-effort de la utilidad
  }
}
