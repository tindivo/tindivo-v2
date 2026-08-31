// Utilidades de Web Push para el cliente (se ejecutan solo en el browser).
// El service worker vive en /sw.js de cada app; la suscripción se envía a POST /push/subscriptions.

export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
  /**
   * Etiqueta legible para una persona que mire la tabla. NO identifica un
   * dispositivo — para eso está `installId`.
   */
  userAgent?: string
  /** Identidad real de esta instalación. Ver `getInstallId`. */
  installId?: string
}

/**
 * Clave de `localStorage` del id de instalación. Vecina de
 * `tindivo:push:last-sent-endpoint`, que guarda el motorizado.
 */
const INSTALL_ID_KEY = 'tindivo:push:install-id'

/**
 * ID ESTABLE DE ESTA INSTALACIÓN, Y POR QUÉ NO VALE EL `user_agent`.
 *
 * El servidor limpia suscripciones zombis antes de dar de alta: misma persona,
 * mismo dispositivo, endpoint distinto = el endpoint rotó, se borra el viejo.
 * Para eso hace falta saber que dos altas vienen del MISMO dispositivo, y el
 * `user_agent` no lo dice: desde la *UA reduction* de Chrome, el de Android
 * está congelado en `Android 10; K` y es idéntico byte a byte entre teléfonos
 * distintos. En `tindivo-prod` hay nueve dispositivos compartiendo la cadena
 * exacta. Con esa clave, dos Android de la misma persona se borraban la
 * suscripción mutuamente: el último en abrir la app dejaba al otro sin avisos,
 * en silencio.
 *
 * Este UUID lo genera el cliente una vez y vive en `localStorage`. Sobrevive a
 * la rotación del endpoint —que es justo lo que hay que detectar— y no
 * colisiona entre dos dispositivos.
 *
 * DEVUELVE `undefined` SI NO HAY DÓNDE GUARDARLO (modo privado, storage lleno,
 * cookies de terceros bloqueadas). No se inventa uno en memoria: un id que
 * cambia en cada carga es peor que ninguno, porque acumularía una fila por
 * visita. Sin id, el servidor no limpia nada y la fila rancia la recoge la
 * purga por 404/410 de `send-push`.
 */
export function getInstallId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const guardado = window.localStorage.getItem(INSTALL_ID_KEY)
    if (guardado) return guardado
    const nuevo = crypto.randomUUID()
    window.localStorage.setItem(INSTALL_ID_KEY, nuevo)
    // Releer y no confiar en el `setItem`: en modo privado de Safari escribir
    // puede no lanzar y aun así no persistir. Un id que no persiste es el caso
    // de arriba, y se trata igual que no tenerlo.
    return window.localStorage.getItem(INSTALL_ID_KEY) ?? undefined
  } catch {
    return undefined
  }
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

/**
 * Techo de espera para `serviceWorker.ready`, que NO resuelve nunca —tampoco
 * rechaza— si el SW no llegó a registrarse: 404 de `/sw.js`, modo privado, o un
 * navegador sin soporte. Sin él, dar de baja el push cuelga para siempre a quien
 * lo llame, y quien lo llama es el botón de cerrar sesión.
 */
const SW_READY_TIMEOUT_MS = 3_000

/** `serviceWorker.ready` acotado: `null` si no hay registro a tiempo. */
async function registroListo(): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)),
  ])
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
    installId: getInstallId(),
  })
  return 'subscribed'
}

/**
 * Suelta la suscripción de ESTE navegador sin avisar al backend.
 *
 * Para el flujo de «cerrar sesión en todos los dispositivos», donde las filas
 * ya se borran de golpe en el servidor con `{ all: true }` y lo único que falta
 * es que este navegador deje de tener una suscripción viva. Llamar al DELETE
 * por endpoint además del masivo sería una petición de más contra una fila que
 * ya no existe.
 *
 * Nunca lanza.
 */
export async function dropLocalPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await registroListo()
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return false
    return await sub.unsubscribe()
  } catch {
    return false
  }
}

export type UnsubscribeResult = 'unsubscribed' | 'nothing-to-do' | 'failed' | 'unsupported'

/**
 * Da de baja el push de ESTE dispositivo: primero en el backend, después en el
 * navegador.
 *
 * Pensado para llamarse al cerrar sesión, y ANTES del `signOutLocal`: el
 * `DELETE /push/subscriptions` va autenticado, así que sin sesión ya no hay JWT
 * con el que borrar la fila. Si no se llama, el dispositivo se queda con una
 * suscripción viva y sigue recibiendo avisos de una cuenta de la que el usuario
 * acaba de salir.
 *
 * El orden importa y es el mismo que ya aprendió el hook del motorizado: si el
 * DELETE falla y aun así hiciéramos `sub.unsubscribe()`, quedaría una fila viva
 * apuntando a un endpoint muerto y el backend seguiría intentando enviarle hasta
 * que el proveedor devolviera 410. Ante un DELETE fallido no se toca nada local:
 * devuelve `'failed'` y la verdad sigue siendo "suscrito".
 *
 * Nunca lanza: cerrar sesión tiene que funcionar aunque no haya red.
 */
export async function unsubscribeFromPush(
  del: (endpoint: string) => Promise<unknown>,
): Promise<UnsubscribeResult> {
  if (!pushSupported()) return 'unsupported'
  try {
    const reg = await registroListo()
    if (!reg) return 'nothing-to-do'
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return 'nothing-to-do'

    await del(sub.endpoint)
    await sub.unsubscribe()
    return 'unsubscribed'
  } catch {
    return 'failed'
  }
}
