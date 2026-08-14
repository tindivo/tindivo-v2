'use client'

import { useEffect, useState } from 'react'
import { queueSize, reconcileOptimistic } from '@/lib/offline-queue'
import { flushQueue } from '@/lib/transitions'

/** Estado online/offline del dispositivo + flush de la cola al reconectar. */
export function useOnline(): { online: boolean; justRestored: boolean } {
  const [online, setOnline] = useState(true)
  const [justRestored, setJustRestored] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)
    // Al arrancar, barrer los optimistas sin transición detrás. Cubre al que ya
    // se quedó con uno pegado de una sesión anterior: sin esto, ese pedido
    // seguiría invisible aunque la cola esté vacía y no haya nada que
    // reintentar, y solo se arreglaba borrando el localStorage a mano.
    reconcileOptimistic()
    if (navigator.onLine && queueSize() > 0) void flushQueue()

    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const onOnline = () => {
      setOnline(true)
      setJustRestored(true)
      void flushQueue()
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setJustRestored(false), 2500)
    }
    const onOffline = () => {
      setOnline(false)
      setJustRestored(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearTimeout(hideTimer)
    }
  }, [])

  return { online, justRestored }
}
