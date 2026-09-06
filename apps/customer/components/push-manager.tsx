'use client'

import { registerServiceWorker } from '@tindivo/ui'
import { useEffect } from 'react'
import { reengancharSiConcedido } from '@/lib/push'

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
 */
export function PushManager() {
  useEffect(() => {
    void registerServiceWorker()
    void reengancharSiConcedido()
  }, [])

  return null
}
