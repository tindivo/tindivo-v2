'use client'

import { ApiError } from '@tindivo/api-client'
import { getInstallId } from '@tindivo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export type PushStatus = 'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed'

/**
 * Causa específica de un fallo al suscribir. La UI mapea cada `reason` a un
 * mensaje accionable. Mantener este union actualizado con cualquier nuevo
 * punto de fallo.
 */
export type SubscribeFailReason =
  | 'no-vapid'
  | 'no-session'
  | 'no-permission'
  | 'incomplete-keys'
  | `subscribe-throw:${string}`
  | `api-error:${string}:${number}`
  | `error:${string}`

export type SubscribeResult = { ok: true } | { ok: false; reason: SubscribeFailReason }

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const AUTO_HEAL_MIN_INTERVAL_MS = 60_000
// Recordamos el último endpoint enviado al backend para detectar rotaciones
// silenciosas. Chrome casi nunca dispara `pushsubscriptionchange`, así que
// comparar el endpoint actual contra el último enviado es la única forma
// fiable de darse cuenta de que rotó.
const LAST_SENT_ENDPOINT_KEY = 'tindivo:push:last-sent-endpoint'

function rememberSentEndpoint(endpoint: string): void {
  try {
    window.localStorage.setItem(LAST_SENT_ENDPOINT_KEY, endpoint)
  } catch {
    // Modo privado o storage lleno — ignorar; se reenviará al próximo tick.
  }
}

function recallSentEndpoint(): string | null {
  try {
    return window.localStorage.getItem(LAST_SENT_ENDPOINT_KEY)
  } catch {
    return null
  }
}

function forgetSentEndpoint(): void {
  try {
    window.localStorage.removeItem(LAST_SENT_ENDPOINT_KEY)
  } catch {
    // ignore
  }
}

/**
 * Indica si hay sesión Supabase activa. Es el guard antes de cualquier fetch a
 * un endpoint protegido: sin sesión devuelven 401 y el ApiClient ensucia la
 * consola al intentar parsear una respuesta que no es JSON.
 *
 * `getSession()` resuelve desde memoria/cookies sin hit de red, así que
 * llamarlo en cada `checkStatus` es despreciable.
 */
async function hasActiveSession(): Promise<boolean> {
  const { data } = await getSupabaseBrowser().auth.getSession()
  return Boolean(data.session)
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

/**
 * Gestiona la suscripción a Web Push del motorizado.
 *
 * Fuente de verdad: `pushManager.getSubscription()`. Tras cualquier operación
 * se revalida contra PushManager para que la UI refleje el estado real y no lo
 * que creemos haber hecho.
 *
 * Auto-heal silencioso: si el navegador rota el endpoint o revoca la
 * suscripción, `checkStatus` ve `permission=granted` con `sub=null` y
 * re-suscribe sin pedir permiso (ya está concedido).
 *
 * Re-sync por tres vías: `visibilitychange`, mensaje del service worker
 * (`push-subscription-changed`) y polling de 60s.
 */
export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>('default')
  const [loading, setLoading] = useState(false)
  const lastAutoHealAtRef = useRef<number>(0)
  const autoHealInFlightRef = useRef<boolean>(false)

  const subscribeInternal = useCallback(async (): Promise<SubscribeResult> => {
    if (!VAPID_PUBLIC_KEY) {
      console.error('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY no configurada')
      return { ok: false, reason: 'no-vapid' }
    }
    if (!(await hasActiveSession())) return { ok: false, reason: 'no-session' }

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        })
      } catch (err) {
        const name = err instanceof Error ? err.name : 'Unknown'
        return { ok: false, reason: `subscribe-throw:${name}` }
      }
    }

    const json = sub.toJSON()
    if (!json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: 'incomplete-keys' }
    }
    try {
      await api.post<void>('/push/subscriptions', {
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        userAgent: navigator.userAgent.slice(0, 300),
        // La identidad del dispositivo para la limpieza de zombis del servidor.
        // El `userAgent` de arriba no sirve: entre dos Android es el mismo. Ver
        // `getInstallId` en @tindivo/ui.
        installId: getInstallId(),
      })
      rememberSentEndpoint(sub.endpoint)
    } catch (err) {
      if (err instanceof ApiError) {
        return { ok: false, reason: `api-error:${err.problem.code}:${err.status}` }
      }
      const name = err instanceof Error ? err.name : 'Unknown'
      return { ok: false, reason: `error:${name}` }
    }
    return { ok: true }
  }, [])

  const tryAutoHeal = useCallback(async (): Promise<void> => {
    // Debounce: como máximo un intento por minuto. Sin esto, un subscribe que
    // falla de forma estable se convierte en un bucle contra el backend.
    const now = Date.now()
    if (autoHealInFlightRef.current) return
    if (now - lastAutoHealAtRef.current < AUTO_HEAL_MIN_INTERVAL_MS) return
    autoHealInFlightRef.current = true
    lastAutoHealAtRef.current = now
    try {
      await subscribeInternal()
    } catch (err) {
      console.warn('[push] auto-heal failed, retrying next cycle', err)
    } finally {
      autoHealInFlightRef.current = false
    }
  }, [subscribeInternal])

  const checkStatus = useCallback(async (): Promise<PushStatus> => {
    if (typeof window === 'undefined') return 'default'
    if (
      !('Notification' in window) ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setStatus('unsupported')
      return 'unsupported'
    }

    if (Notification.permission === 'denied') {
      setStatus('denied')
      return 'denied'
    }

    if (Notification.permission === 'default') {
      setStatus('default')
      return 'default'
    }

    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // Validar la propiedad del endpoint: el SW puede devolver uno válido
        // pero asociado en BD a OTRO usuario (motorizado B entra en el device
        // de A sin cerrar sesión limpiamente). Ante la duda, el fallo es
        // `owned: true`: re-suscribir de más es peor que no hacer nada.
        if (await hasActiveSession()) {
          const me = await api
            .get<{
              data: { owned: boolean; exists: boolean }
            }>(`/push/subscriptions/me?endpoint=${encodeURIComponent(sub.endpoint)}`)
            .catch(() => ({ data: { owned: true, exists: true } }))
          if (!me.data.owned) {
            await sub.unsubscribe().catch(() => null)
            forgetSentEndpoint()
            lastAutoHealAtRef.current = 0
            void tryAutoHeal().then(() => {
              void (async () => {
                const regAfter = await navigator.serviceWorker.ready
                const subAfter = await regAfter.pushManager.getSubscription()
                if (subAfter) setStatus('subscribed')
              })()
            })
            setStatus('granted')
            return 'granted'
          }

          // El endpoint puede haber rotado sin que el SW emita
          // `pushsubscriptionchange`. Si el actual ≠ el último que enviamos al
          // backend, reenviarlo en silencio.
          if (recallSentEndpoint() !== sub.endpoint) {
            lastAutoHealAtRef.current = 0
            void tryAutoHeal()
          }
        }
        setStatus('subscribed')
        return 'subscribed'
      }
      // Permiso concedido y sub=null → el navegador rotó o revocó. Auto-heal
      // silencioso, pero solo con sesión: sin ella el POST termina en 401.
      setStatus('granted')
      if (!(await hasActiveSession())) return 'granted'
      void tryAutoHeal().then(() => {
        void (async () => {
          const regAfter = await navigator.serviceWorker.ready
          const subAfter = await regAfter.pushManager.getSubscription()
          if (subAfter) setStatus('subscribed')
        })()
      })
      return 'granted'
    } catch {
      setStatus('granted')
      return 'granted'
    }
  }, [tryAutoHeal])

  /**
   * Variante de `checkStatus` que salta el debounce del auto-heal. Para usarla
   * al iniciar sesión: el cambio de cuenta tiene que validar la propiedad del
   * endpoint de inmediato, sin esperar al tick de polling.
   */
  const forceRefresh = useCallback(async () => {
    lastAutoHealAtRef.current = 0
    return checkStatus()
  }, [checkStatus])

  useEffect(() => {
    void checkStatus()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkStatus()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const onSwMessage = (ev: MessageEvent) => {
      if ((ev.data as { type?: string } | null)?.type === 'push-subscription-changed') {
        lastAutoHealAtRef.current = 0 // forzar auto-heal aunque esté en debounce
        void checkStatus()
      }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage)
    }

    const interval = window.setInterval(() => {
      void checkStatus()
    }, AUTO_HEAL_MIN_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage)
      }
      window.clearInterval(interval)
    }
  }, [checkStatus])

  /**
   * Reacción al login. Sin esto, el motorizado que acaba de entrar espera hasta
   * un minuto —el tick del polling— antes de quedar suscrito, y un pedido que
   * entre en ese hueco no le suena.
   *
   * `SIGNED_IN` usa `forceRefresh` porque un cambio de cuenta tiene que validar
   * la propiedad del endpoint YA: si el device era de otro motorizado, el
   * debounce de 60s dejaría los avisos yendo a quien no toca.
   *
   * Los tres guards no son defensivos de más: sin ellos esto arrancaría el
   * flujo de suscripción en quien nunca concedió permiso, que es justo lo que
   * el diseño evita (el permiso se pide en el gesto, desde /perfil).
   */
  useEffect(() => {
    const { data } = getSupabaseBrowser().auth.onAuthStateChange((event, session) => {
      if (!session) return
      if (typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return
      if (event === 'SIGNED_IN') void forceRefresh()
      else void checkStatus()
    })
    return () => data.subscription.unsubscribe()
  }, [checkStatus, forceRefresh])

  /**
   * Registra en PushManager y envía el endpoint al backend.
   *
   * ASUME que el permiso ya es `granted`: quien llama debe invocar
   * `Notification.requestPermission()` dentro del propio gesto del usuario,
   * porque iOS Safari rompe el contexto del gesto si hay render de por medio.
   */
  const subscribe = useCallback(async (): Promise<SubscribeResult> => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      console.warn('[push] subscribe called without granted permission')
      await checkStatus()
      return { ok: false, reason: 'no-permission' }
    }
    setLoading(true)
    try {
      const result = await subscribeInternal()
      await checkStatus()
      if (!result.ok) console.error('[push:subscribe]', result.reason)
      return result
    } catch (err) {
      // Red de seguridad: `subscribeInternal` maneja sus errores conocidos,
      // pero `hasActiveSession` y `serviceWorker.ready` pueden lanzar.
      const name = err instanceof Error ? err.name : 'Unknown'
      console.error('[push:subscribe] unexpected throw', err)
      await checkStatus()
      return { ok: false, reason: `error:${name}` }
    } finally {
      setLoading(false)
    }
  }, [checkStatus, subscribeInternal])

  /**
   * Da de baja el dispositivo. Primero el backend, después el navegador.
   *
   * El orden importa y es distinto al del v1: si el DELETE falla y aun así
   * hiciéramos `sub.unsubscribe()`, quedaría una fila viva en BD apuntando a
   * un endpoint muerto mientras el motorizado cree que apagó los avisos. Se
   * seguirían intentando envíos contra ese endpoint hasta que el proveedor
   * devuelva 410. Ante un DELETE fallido no se toca nada local: devuelve
   * `false` y el estado sigue siendo `subscribed`, que es la verdad.
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        // `api.delete` no envía body; el endpoint espera `{ endpoint }`, así
        // que se usa `request`, que es lo que hace también el v1.
        await api.request<void>('/push/subscriptions', {
          method: 'DELETE',
          body: { endpoint: sub.endpoint },
        })
        await sub.unsubscribe()
      }
      forgetSentEndpoint()
      // Evitar que el polling vuelva a suscribir de inmediato.
      lastAutoHealAtRef.current = Date.now()
      await checkStatus()
      return true
    } catch (err) {
      console.error('[push] unsubscribe failed', err)
      await checkStatus()
      return false
    } finally {
      setLoading(false)
    }
  }, [checkStatus])

  return { status, loading, subscribe, unsubscribe, refresh: checkStatus, forceRefresh }
}
