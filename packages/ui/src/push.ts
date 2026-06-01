// Utilidades de Web Push para el cliente (se ejecutan solo en el browser).
// El service worker vive en /sw.js de cada app; la suscripción se envía a POST /push/subscriptions.

export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Registra el SW (idempotente). Necesario para instalación PWA y para suscribir. */
export async function registerServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register('/sw.js')
  } catch {
    // best-effort: la app funciona igual sin SW
  }
}

export type SubscribeResult = 'subscribed' | 'denied' | 'unsupported'

/**
 * Solicita permiso (debe llamarse dentro de un gesto del usuario), se suscribe con la
 * llave VAPID pública y envía la suscripción al backend. Idempotente.
 */
export async function subscribeToPush(
  vapidPublicKey: string,
  post: (sub: PushSubscriptionPayload) => Promise<unknown>,
): Promise<SubscribeResult> {
  if (!pushSupported() || !vapidPublicKey) return 'unsupported'
  await navigator.serviceWorker.register('/sw.js')
  const reg = await navigator.serviceWorker.ready
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    })
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'unsupported'
  await post({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  })
  return 'subscribed'
}
