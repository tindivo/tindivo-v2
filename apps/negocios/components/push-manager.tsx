'use client'

import { subscribeToPush } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/**
 * Registra el service worker (instalabilidad) y gestiona la suscripción push.
 * Se auto-suscribe si el permiso ya está concedido; si está "default" y hay sesión,
 * muestra un botón flotante para activarlo (el prompt va dentro del gesto del usuario).
 */
export function PushManager() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
    getSupabaseBrowser()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session || !VAPID || typeof Notification === 'undefined') return
        if (Notification.permission === 'granted') {
          await subscribeToPush(VAPID, (s) => api.post('/push/subscriptions', s)).catch(() => {})
        } else if (Notification.permission === 'default') {
          setShow(true)
        }
      })
  }, [])

  if (!show) return null
  return (
    <button
      type="button"
      onClick={async () => {
        const r = await subscribeToPush(VAPID, (s) => api.post('/push/subscriptions', s)).catch(
          () => 'denied' as const,
        )
        if (r !== 'unsupported') setShow(false)
      }}
      className="fixed right-3 bottom-3 z-50 rounded-full bg-ink px-4 py-2 font-semibold text-[13px] text-white shadow-lg"
    >
      🔔 Activar avisos
    </button>
  )
}
