'use client'

import { subscribeToPush, unsubscribeFromPush } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

/**
 * ¿ESTE EQUIPO ESTÁ RECIBIENDO AVISOS DE VERDAD? Y SI NO, ¿DÓNDE SÍ?
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
 * AHORA TAMBIÉN APAGA Y LISTA EQUIPOS, como el perfil del motorizado. El panel
 * solo sabía encender: no había forma de apagar los avisos en un aparato sin
 * irse a los ajustes del navegador —y eso los deja en `denied`, que es un
 * callejón sin salida— ni de ver qué OTROS aparatos siguen recibiendo pedidos
 * con el nombre del cliente y el monto en la vista previa. Un celular viejo
 * olvidado en un cajón del local aparece igual de vivo que la tablet del
 * mostrador: los dos aceptan las entregas.
 *
 * SIGUE SIN SER EL HOOK DE MOTORIZADOS, y sigue sin compartirse. El de
 * `apps/motorizados/hooks/use-push-subscription.ts` lleva además validación de
 * propiedad del endpoint, auto-heal con debounce propio y reacción al login
 * —cosas de un aparato personal que cambia de dueño entre turnos—. Aquí el
 * auto-heal vive en `PushManager`, que es un sitio y no cinco. Cuando negocios
 * necesite lo de la propiedad del endpoint tocará subir el hook a `packages/`;
 * mientras tanto, adelantar esa mudanza sería mover 477 líneas para usar 60.
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
  /**
   * Apagado A MANO en este equipo, con el permiso todavía concedido.
   *
   * Mirando solo al navegador es indistinguible de `granted` —permiso sí,
   * suscripción no— y por eso hace falta recordarlo aparte: `granted` es una
   * avería que `PushManager` repara sin preguntar, y esto es una decisión que
   * repararla desharía. Sin esta diferencia, el interruptor de Configuración se
   * vuelve a encender solo al cambiar de pestaña.
   */
  | 'off'
  /** Todo en orden: hay suscripción viva en este navegador. */
  | 'subscribed'

/**
 * Un equipo suscrito de esta cuenta, tal y como lo cuenta el servidor.
 *
 * NO LLEVA EL `endpoint`, y no es un olvido: es una credencial de entrega y no
 * pinta nada en el navegador. Para revocar basta el `id`, que no sirve para
 * nada fuera de `DELETE /push/subscriptions`.
 */
export interface PushDevice {
  id: string
  platform: 'apple' | 'android' | 'windows' | 'otro'
  /** El `user_agent` crudo. Etiqueta, no identidad: dos Android comparten uno. */
  label: string | null
  createdAt: string
  /** Último aviso ENTREGADO, no último uso. Ver `AvisosSection`. */
  lastNotifiedAt: string | null
  /** El que está mirando esta pantalla ahora mismo. */
  current: boolean
}

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/**
 * Marca de «aquí los apagó una persona». Vecina de `tindivo:push:install-id`,
 * que guarda `@tindivo/ui`.
 *
 * Es local al aparato a propósito: la pregunta que contesta es «¿quiere ESTA
 * tablet sonar?», y eso no se hereda a los otros equipos de la cuenta. Se borra
 * al cerrar sesión (`olvidarApagado`) para que el siguiente turno no arranque
 * mudo por una decisión que tomó otra persona hace semanas.
 */
const APAGADO_KEY = 'tindivo:push:apagado'

function estaApagado(): boolean {
  try {
    return window.localStorage.getItem(APAGADO_KEY) === '1'
  } catch {
    return false
  }
}

function recordarApagado(): void {
  try {
    window.localStorage.setItem(APAGADO_KEY, '1')
  } catch {
    // Sin `localStorage` el apagado no sobrevive a un cambio de pestaña: el
    // auto-heal de `PushManager` lo vuelve a encender. Molesto, y preferible a
    // no dejar apagarlo en absoluto.
  }
}

/**
 * Olvida el apagado manual de este aparato. La llama `signOutDevice`: la
 * decisión de no sonar es de quien la tomó, no del navegador, y dejarla puesta
 * dejaría al siguiente que entre en esta tablet sin avisos y sin saber por qué.
 */
export function olvidarApagado(): void {
  try {
    window.localStorage.removeItem(APAGADO_KEY)
  } catch {
    // ignore
  }
}

function soportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/** ¿Hay sesión? Sin ella los endpoints de push devuelven 401. Resuelve de memoria. */
async function haySesion(): Promise<boolean> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  return Boolean(data.session)
}

export function usePushStatus(): {
  status: PushStatus
  busy: boolean
  /** Registra el token. Debe llamarse DENTRO de un gesto del usuario. */
  enable: () => Promise<boolean>
  /** Apaga los avisos en ESTE equipo: baja del backend y del navegador. */
  disable: () => Promise<boolean>
  refresh: () => Promise<void>
  /** `null` = todavía no se sabe (cargando o falló). Distinto de lista vacía. */
  devices: PushDevice[] | null
  devicesLoading: boolean
  loadDevices: () => Promise<void>
  revokeDevice: (id: string) => Promise<boolean>
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
      if (await reg.pushManager.getSubscription()) {
        // Una suscripción viva CONTRADICE la marca de apagado, así que la marca
        // se cae. Pasa cuando el `DELETE` de `disable()` funcionó pero el
        // `unsubscribe()` del navegador no: la verdad es que sigue suscrito.
        olvidarApagado()
        setStatus('subscribed')
        return
      }
      setStatus(estaApagado() ? 'off' : 'granted')
    } catch {
      setStatus(estaApagado() ? 'off' : 'granted')
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

    // Encender es la respuesta a la pregunta que guardaba la marca, así que se
    // borra ANTES de suscribir: si el POST falla, el estado tiene que quedar en
    // `granted` —una avería que se reintenta sola— y no en `off`, que no se
    // reintenta nunca.
    olvidarApagado()

    // Sin sesión el POST termina en 401 y la suscripción quedaría viva en el
    // navegador pero ausente de la base: el peor de los dos mundos, porque
    // `getSubscription()` diría que sí y no llegaría nada.
    if (!(await haySesion())) {
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

  /**
   * APAGA LOS AVISOS EN ESTE EQUIPO.
   *
   * La marca se pone PRIMERO y no al final. `PushManager` repara todo lo que
   * vea en `granted`, y entre el `DELETE` y el `refresh()` este navegador está
   * exactamente así: permiso concedido, suscripción muerta. Si la marca llegara
   * después, un `visibilitychange` en ese hueco volvería a suscribir y el
   * interruptor se encendería solo.
   *
   * El orden del resto lo pone `unsubscribeFromPush`: primero el backend,
   * después el navegador. Al revés quedaría una fila viva apuntando a un
   * endpoint muerto y el backend seguiría intentando enviarle hasta que el
   * proveedor devolviera 410, mientras la cajera cree que apagó los avisos.
   */
  const disable = useCallback(async (): Promise<boolean> => {
    setBusy(true)
    recordarApagado()
    try {
      const r = await unsubscribeFromPush((endpoint) =>
        api.request<void>('/push/subscriptions', { method: 'DELETE', body: { endpoint } }),
      )
      if (r === 'failed') {
        // La fila sigue en la base: los avisos van a seguir llegando. Se deshace
        // la marca para no dejar la pantalla diciendo «apagados» mientras suenan.
        console.error('[push] no se pudo apagar los avisos de este equipo')
        olvidarApagado()
        await refresh()
        return false
      }
      await refresh()
      return true
    } catch (err) {
      console.error('[push] error al apagar los avisos', err)
      olvidarApagado()
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

  // ── La lista de equipos ─────────────────────────────────────────────────────
  //
  // Va aparte del `status`: `status` contesta «¿me llegan avisos AQUÍ?» y se
  // recalcula en cada `visibilitychange`; esto contesta «¿en qué otros sitios
  // llegan?» y solo interesa cuando alguien abre Configuración a mirar.
  const [devices, setDevices] = useState<PushDevice[] | null>(null)
  const [devicesLoading, setDevicesLoading] = useState(false)

  const loadDevices = useCallback(async (): Promise<void> => {
    if (!(await haySesion())) return
    setDevicesLoading(true)
    try {
      // El endpoint propio va como parámetro para que el servidor marque cuál
      // de la lista es este aparato. Si no hay suscripción viva aquí, no se
      // manda y no se marca ninguno — que es la verdad, no un fallo.
      let propio: string | null = null
      try {
        const reg = await navigator.serviceWorker.ready
        propio = (await reg.pushManager.getSubscription())?.endpoint ?? null
      } catch {
        propio = null
      }
      const qs = propio ? `?endpoint=${encodeURIComponent(propio)}` : ''
      const res = await api.get<{ data: { devices: PushDevice[] } }>(`/push/subscriptions${qs}`)
      setDevices(res.data.devices)
    } catch (err) {
      console.error('[push] no se pudo listar los equipos', err)
      // `null` es «no lo sé», que la UI pinta distinto de «no tienes ninguno».
      setDevices(null)
    } finally {
      setDevicesLoading(false)
    }
  }, [])

  /**
   * Quita UN equipo por su id.
   *
   * Devuelve `false` también cuando el servidor responde 200 pero `removed: 0`
   * —un id que ya no está, o que no es de esta cuenta—. Un 200 no es prueba de
   * que se borrara algo, y quitar la fila de la pantalla sin haberla quitado de
   * la base es la mentira que esta lista no se puede permitir: la persona se
   * iría creyendo que apagó un aparato que sigue recibiendo pedidos con el
   * nombre del cliente y el monto en la vista previa.
   */
  const revokeDevice = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await api.request<{ data: { removed: number } }>('/push/subscriptions', {
          method: 'DELETE',
          body: { id },
        })
        const borrado = res.data.removed > 0
        await loadDevices()
        // Quitar el propio deja este navegador suscrito contra una fila que ya
        // no existe: `refresh` lo detecta y lo recoloca.
        await refresh()
        return borrado
      } catch (err) {
        console.error('[push] no se pudo quitar el equipo', err)
        return false
      }
    },
    [loadDevices, refresh],
  )

  return {
    status,
    busy,
    enable,
    disable,
    refresh,
    devices,
    devicesLoading,
    loadDevices,
    revokeDevice,
  }
}
