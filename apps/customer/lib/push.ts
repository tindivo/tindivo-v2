'use client'

import {
  getInstallId,
  type PushSubscriptionPayload,
  pushSupported,
  subscribeToPush,
} from '@tindivo/ui'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/**
 * EL PERMISO DE NOTIFICACIONES SOLO SE PIDE UNA VEZ EN LA VIDA DEL NAVEGADOR.
 *
 * Chrome y Safari preguntan una sola vez por sitio y dispositivo: si el cliente
 * toca «Bloquear», no hay forma de volver a preguntar desde la web nunca más —
 * hay que ir a los ajustes del sitio a mano, cosa que no hace nadie. El permiso
 * es un cartucho, y solo hay uno.
 *
 * De ahí sale todo lo de este módulo:
 *
 *   · El diálogo del sistema NO se lanza al cargar la página. Se lanza dentro
 *     del toque de un botón nuestro, en una hoja que antes explica para qué.
 *   · Un «Ahora no» en NUESTRA hoja no gasta nada, así que se puede volver a
 *     ofrecer en el siguiente pedido. Un «Bloquear» en la del sistema sí, y por
 *     eso vale la pena gastar una hoja en evitarlo.
 *   · Se deja de ofrecer tras `MAX_OFRECIMIENTOS` descartes. Quien dijo que no
 *     dos veces ya contestó; seguir preguntando es el camino más corto a que
 *     toque «Bloquear» solo para que le dejen en paz.
 */
const MAX_OFRECIMIENTOS = 2

/** `{ veces, ultimoPedido }`. Ver `descartar`. */
const CLAVE_DESCARTES = 'tindivo:push:descartes'

export type EstadoPush =
  /** El navegador no puede, o falta la llave VAPID. No hay nada que ofrecer. */
  | 'no-soportado'
  /** Nunca se le preguntó. Es el único estado en que la hoja tiene sentido. */
  | 'sin-preguntar'
  | 'concedido'
  /** Dijo que no al diálogo del sistema. Ya no se puede volver a preguntar. */
  | 'bloqueado'

interface Descartes {
  veces: number
  /** `shortId` del último pedido en el que descartó. Ver `sePuedeOfrecer`. */
  ultimoPedido: string
}

function leerDescartes(): Descartes {
  try {
    const crudo = window.localStorage.getItem(CLAVE_DESCARTES)
    if (!crudo) return { veces: 0, ultimoPedido: '' }
    const v = JSON.parse(crudo) as Partial<Descartes>
    return {
      veces: Number.isFinite(v.veces) ? Number(v.veces) : 0,
      ultimoPedido: typeof v.ultimoPedido === 'string' ? v.ultimoPedido : '',
    }
  } catch {
    // Modo privado, storage lleno, JSON de una versión vieja. Sin memoria de
    // descartes se ofrece, que es el lado seguro: molesta, no rompe.
    return { veces: 0, ultimoPedido: '' }
  }
}

/**
 * Último endpoint que CONFIRMAMOS recibido por el backend — no el que el
 * navegador dice tener. Mismo problema, misma solución que en motorizados y
 * negocios (`tindivo:push:last-sent-endpoint`): `pushManager.getSubscription()`
 * puede terminar bien y aun así perder el `POST /push/subscriptions` de
 * después —una señal mala, una sesión que caduca a mitad del gesto— y sin
 * este rastro no había forma de notar esa suscripción fantasma.
 */
const ULTIMO_ENDPOINT_ENVIADO_KEY = 'tindivo:push:last-sent-endpoint'

function recordarEndpointEnviado(endpoint: string): void {
  try {
    window.localStorage.setItem(ULTIMO_ENDPOINT_ENVIADO_KEY, endpoint)
  } catch {
    // Modo privado o storage lleno — ignorar; se reintentará en el próximo tick.
  }
}

function endpointYaEnviado(): string | null {
  try {
    return window.localStorage.getItem(ULTIMO_ENDPOINT_ENVIADO_KEY)
  } catch {
    return null
  }
}

function olvidarEndpointEnviado(): void {
  try {
    window.localStorage.removeItem(ULTIMO_ENDPOINT_ENVIADO_KEY)
  } catch {
    // ignore
  }
}

/** Registra el token y recuerda el endpoint para `reengancharSiConcedido`. */
async function postSubscription(sub: PushSubscriptionPayload): Promise<void> {
  await api.post<void>('/push/subscriptions', sub)
  recordarEndpointEnviado(sub.endpoint)
}

/** El estado del permiso en ESTE navegador. `'no-soportado'` en SSR. */
export function estadoPush(): EstadoPush {
  if (!pushSupported() || !VAPID) return 'no-soportado'
  if (Notification.permission === 'granted') return 'concedido'
  if (Notification.permission === 'denied') return 'bloqueado'
  return 'sin-preguntar'
}

/**
 * ¿Toca ofrecer la hoja por el pedido `shortId`?
 *
 * Se ofrece UNA VEZ POR PEDIDO, no una vez por visita: el cliente entra y sale
 * del seguimiento muchas veces mientras espera —vuelve de Yape, mira si ya
 * salió— y una hoja en cada entrada sería justo lo que empuja a bloquear.
 */
export function sePuedeOfrecer(shortId: string): boolean {
  if (estadoPush() !== 'sin-preguntar') return false
  const d = leerDescartes()
  if (d.veces >= MAX_OFRECIMIENTOS) return false
  return d.ultimoPedido !== shortId
}

/** Anota que descartó la hoja en este pedido. Nunca lanza. */
export function descartar(shortId: string): void {
  try {
    const d = leerDescartes()
    window.localStorage.setItem(
      CLAVE_DESCARTES,
      JSON.stringify({ veces: d.veces + 1, ultimoPedido: shortId } satisfies Descartes),
    )
  } catch {
    // Sin memoria del descarte se volverá a ofrecer en el próximo pedido. Es el
    // fallo tolerable de los dos.
  }
}

/**
 * Pide el permiso y da de alta la suscripción en el backend.
 *
 * **TIENE QUE LLAMARSE DENTRO DEL MANEJADOR DE UN TOQUE.** `requestPermission`
 * fuera del gesto del usuario lo ignoran los navegadores modernos, y el gesto
 * no sobrevive a un `await` previo: nada de comprobar la sesión antes de
 * llamar aquí.
 */
export async function pedirPermiso(): Promise<'subscribed' | 'denied' | 'unsupported'> {
  if (!VAPID) return 'unsupported'
  return subscribeToPush(VAPID, postSubscription).catch(() => 'denied' as const)
}

/**
 * Da de alta este navegador si el permiso YA estaba concedido, Y CONFIRMA
 * CONTRA EL BACKEND que lo que el navegador dice tener es real y es nuestro.
 *
 * NO ES REDUNDANTE CON `pedirPermiso`: el permiso vive en el navegador y la
 * suscripción en nuestra tabla, y las dos se desincronizan solas —el endpoint
 * rota, el cliente entra desde otro dispositivo, alguien limpió la fila—. Sin
 * esto, un cliente con el permiso dado deja de recibir avisos en silencio y no
 * hay ninguna pantalla que se lo diga.
 *
 * Y NO BASTA CON MIRAR AL NAVEGADOR. `pushManager.getSubscription()` solo dice
 * lo que EL NAVEGADOR recuerda, no lo que el servidor tiene guardado:
 * `pushManager.subscribe()` puede terminar sin errores y aun así perder el
 * `POST` de después. Caso real — un cliente activó los avisos, el navegador
 * quedó "suscrito" y nunca llegó nada porque esa fila jamás existió en
 * `push_subscriptions` (mismo defecto que tenía `apps/negocios`, arreglado el
 * 2026-09-11). Por eso esto valida dos cosas, no una:
 *
 *   · el endpoint local es NUESTRO en el backend (`/push/subscriptions/me`
 *     dice `owned: false` también cuando la fila simplemente no existe) → si
 *     no, se da de baja localmente y se rehace entero;
 *   · el endpoint SÍ es nuestro, pero no coincide con el último que
 *     confirmamos enviado → se re-envía en silencio, sin gesto ni permiso.
 *
 * EXIGE SESIÓN. `POST /push/subscriptions` va autenticado, así que sin sesión
 * la suscripción del navegador se crearía para no colgarse de nadie y el alta
 * moriría en un 401 que nadie mira.
 *
 * Nunca lanza hacia fuera: es trabajo de fondo, no una acción que el cliente
 * esté esperando. Se llama al montar, al volver a la pestaña y cada 60s — ver
 * `PushManager`.
 */
export async function reengancharSiConcedido(): Promise<void> {
  if (estadoPush() !== 'concedido') return
  const { data } = await getSupabaseBrowser().auth.getSession()
  if (!data.session) return

  let sub: PushSubscription | null = null
  try {
    const reg = await navigator.serviceWorker.ready
    sub = await reg.pushManager.getSubscription()
  } catch {
    return
  }

  if (!sub) {
    // Permiso concedido pero nada suscrito en este navegador: rehacerlo entero.
    await subscribeToPush(VAPID, postSubscription).catch(() => {})
    return
  }

  const me = await api
    .get<{ data: { owned: boolean; exists: boolean } }>(
      `/push/subscriptions/me?endpoint=${encodeURIComponent(sub.endpoint)}`,
    )
    .catch(() => ({ data: { owned: true, exists: true } }))

  if (!me.data.owned) {
    await sub.unsubscribe().catch(() => null)
    olvidarEndpointEnviado()
    await subscribeToPush(VAPID, postSubscription).catch(() => {})
    return
  }

  if (endpointYaEnviado() !== sub.endpoint) {
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
      await postSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        userAgent: navigator.userAgent,
        installId: getInstallId(),
      }).catch(() => {})
    }
  }
}
