'use client'

import { pushSupported, subscribeToPush } from '@tindivo/ui'
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
  return subscribeToPush(VAPID, (s) => api.post('/push/subscriptions', s)).catch(
    () => 'denied' as const,
  )
}

/**
 * Da de alta este navegador si el permiso YA estaba concedido.
 *
 * No es redundante con `pedirPermiso`: el permiso vive en el navegador y la
 * suscripción en nuestra tabla, y las dos se desincronizan solas —el endpoint
 * rota, el cliente entra desde otro dispositivo, alguien limpió la fila—. Sin
 * esto, un cliente con el permiso dado deja de recibir avisos en silencio y no
 * hay ninguna pantalla que se lo diga.
 *
 * EXIGE SESIÓN. `POST /push/subscriptions` va autenticado, así que sin sesión la
 * suscripción del navegador se crearía para no colgarse de nadie y el alta
 * moriría en un 401 que nadie mira. La comprobación va aquí y no en quien
 * llama: es una condición de esta operación, no del sitio donde se monte.
 *
 * `subscribeToPush` es idempotente y nunca lanza hacia fuera.
 */
export async function reengancharSiConcedido(): Promise<void> {
  if (estadoPush() !== 'concedido') return
  const { data } = await getSupabaseBrowser().auth.getSession()
  if (!data.session) return
  await subscribeToPush(VAPID, (s) => api.post('/push/subscriptions', s)).catch(() => {})
}
