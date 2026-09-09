'use client'

import { subscribeToPush } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * ¿ESTE EQUIPO ESTÁ RECIBIENDO AVISOS DE VERDAD?
 *
 * Existe porque conceder el permiso y estar suscrito eran dos cosas distintas y
 * nada las juntaba. El gate de alertas llamaba a `Notification.requestPermission()`
 * y se despedía; quien mandaba el token al backend era `PushManager`, que solo
 * mira el permiso UNA VEZ, al montar la página. La secuencia real era esta:
 *
 *   1. carga la página → `PushManager` ve el permiso en `default`, así que
 *      enseña su botón flotante y NO suscribe;
 *   2. sale el gate → la cajera toca «Activar notificaciones» → el permiso pasa
 *      a `granted`… y ahí se acaba todo;
 *   3. `PushManager` ya no vuelve a mirar.
 *
 * Resultado: el token no llegaba al backend hasta que ella tocara ADEMÁS el otro
 * botón, o hasta la siguiente recarga. Y el gate está pensado justo para quien
 * no va a hacer ninguna de las dos cosas.
 *
 * NO ES EL HOOK DE MOTORIZADOS, y no se comparte todavía. El de
 * `apps/motorizados/hooks/use-push-subscription.ts` lleva además lista de
 * dispositivos, revocación por id y validación de propiedad del endpoint —cosas
 * de una pantalla de perfil con varios teléfonos—. Aquí hay un equipo por local
 * y la pregunta es una sola: si suena o no. Cuando aparezca el tercer consumidor
 * (o negocios necesite la lista) toca subirlo a `packages/`; mientras tanto
 * duplicar 477 líneas para usar 40 sería peor.
 */

export type PushStatus =
  /** El navegador no puede: sin service worker, sin PushManager o sin VAPID. */
  | 'unsupported'
  /** Nunca se preguntó. Se puede arreglar desde aquí. */
  | 'default'
  /** Lo bloqueó la persona. NO se puede arreglar desde la web: ajustes del sistema. */
  | 'denied'
  /** Permiso concedido pero el token no está registrado: el caso de este bug. */
  | 'granted'
  /** Todo en orden: hay suscripción viva en este navegador. */
  | 'subscribed'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function soportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function usePushStatus(): {
  status: PushStatus
  busy: boolean
  /** Registra el token. Debe llamarse DENTRO de un gesto del usuario. */
  enable: () => Promise<boolean>
  refresh: () => Promise<void>
} {
  const [status, setStatus] = useState<PushStatus>('default')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!soportado() || !VAPID) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    if (Notification.permission === 'default') {
      setStatus('default')
      return
    }
    // Con el permiso concedido, la única prueba de que llegan avisos es que
    // haya una suscripción viva. Es la diferencia entre `granted` y
    // `subscribed`, y es exactamente donde se colaba el fallo.
    try {
      const reg = await navigator.serviceWorker.ready
      setStatus((await reg.pushManager.getSubscription()) ? 'subscribed' : 'granted')
    } catch {
      setStatus('granted')
    }
  }, [])

  const enable = useCallback(async (): Promise<boolean> => {
    if (!soportado() || !VAPID) return false

    /**
     * EL PERMISO SE PIDE AQUÍ Y NO DENTRO DE `subscribeToPush`.
     *
     * `subscribeToPush` registra el service worker y espera a
     * `serviceWorker.ready` ANTES de pedir el permiso, y esos dos `await`
     * rompen el contexto del gesto del usuario en iOS Safari: el diálogo del
     * sistema no llega a aparecer. Pidiéndolo aquí —lo primero, sin nada
     * asíncrono por delante— el permiso ya está concedido cuando
     * `subscribeToPush` lo consulta, así que su `requestPermission()` resuelve
     * al instante y no necesita gesto ninguno.
     *
     * Es el mismo razonamiento, y la misma cicatriz, que documenta
     * `handleEnableNotifications` en el perfil del motorizado.
     */
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        await refresh()
        return false
      }
    }
    if (Notification.permission !== 'granted') {
      await refresh()
      return false
    }

    // Sin sesión el POST termina en 401 y la suscripción quedaría viva en el
    // navegador pero ausente de la base: el peor de los dos mundos, porque
    // `getSubscription()` diría que sí y no llegaría nada.
    const { data } = await getSupabaseBrowser().auth.getSession()
    if (!data.session) {
      await refresh()
      return false
    }

    setBusy(true)
    try {
      const r = await subscribeToPush(VAPID, (s) => api.post('/push/subscriptions', s))
      await refresh()
      if (r !== 'subscribed') {
        // El motivo crudo va siempre a consola: sin él, un fallo en la tablet
        // de otra persona es indepurable.
        console.error('[push] no se pudo suscribir este equipo', r)
      }
      return r === 'subscribed'
    } catch (err) {
      console.error('[push] error al suscribir', err)
      await refresh()
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
    // El permiso se puede conceder desde los ajustes del navegador, sin pasar
    // por la app. Al volver a la pestaña se vuelve a mirar.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [refresh])

  return { status, busy, enable, refresh }
}
