'use client'

import { registerServiceWorker } from '@tindivo/ui'
import { useEffect } from 'react'
import { reengancharSiConcedido } from '@/lib/push'

/** Cada cuánto se revalida la suscripción sin que nadie cambie de pestaña. */
const POLL_INTERVAL_MS = 60_000

/**
 * Registra el service worker y reengancha la suscripción push. No pinta nada.
 *
 * AQUÍ YA NO SE PIDE EL PERMISO. Antes, este mismo componente pintaba un botón
 * flotante «🔔 Activar avisos» abajo a la derecha —encima de la barra inferior—
 * en cualquier página en la que hubiera sesión. Ese botón tenía tres problemas
 * y el tercero es el caro:
 *
 *   · No decía para qué servía, así que se tocaba por curiosidad o no se tocaba.
 *   · Se pisaba con la `BottomNav`.
 *   · El permiso del navegador es un cartucho de un solo disparo (ver
 *     `lib/push.ts`): un «Bloquear» ahí deja al cliente sin avisos para
 *     siempre, sin forma de volver a preguntarle. Gastarlo en una esquina de
 *     la portada es tirarlo.
 *
 * Ahora se ofrece donde la pregunta se contesta sola: en el seguimiento de un
 * pedido vivo, con una hoja que explica los tres avisos que va a recibir
 * (`PushPermissionSheet` + `usePushOffer`).
 *
 * Lo que sí sigue viviendo en el layout es esto: el registro del SW —que hace
 * falta para el push y para que la app sea instalable, tenga o no permiso— y el
 * reenganche de la suscripción cuando el permiso YA estaba dado, que es lo que
 * evita que un cliente con avisos activados se quede mudo en silencio cuando su
 * endpoint rota.
 *
 * ANTES SOLO CORRÍA UNA VEZ, AL MONTAR. Un cliente que deja el seguimiento
 * abierto mientras espera su pedido —el caso normal— podía tener un endpoint
 * roto (o un POST que se perdió al activar) durante todo ese rato sin que
 * nada lo revisara de nuevo. Ahora se repite al volver a la pestaña, al
 * enterarse por el service worker de una rotación (`pushsubscriptionchange`
 * en `public/sw.js`, que casi nunca dispara) y cada 60s por si ninguna de las
 * dos anteriores pasa. Mismo patrón que `apps/negocios`.
 */
export function PushManager() {
  useEffect(() => {
    void registerServiceWorker()
    void reengancharSiConcedido()

    const alVolver = () => {
      if (document.visibilityState === 'visible') void reengancharSiConcedido()
    }
    document.addEventListener('visibilitychange', alVolver)

    const alMensajeDelSw = (ev: MessageEvent) => {
      if ((ev.data as { type?: string } | null)?.type === 'push-subscription-changed') {
        void reengancharSiConcedido()
      }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', alMensajeDelSw)
    }

    const interval = window.setInterval(() => void reengancharSiConcedido(), POLL_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', alMensajeDelSw)
      }
      window.clearInterval(interval)
    }
  }, [])

  return null
}
