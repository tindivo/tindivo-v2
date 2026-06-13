'use client'

import { useEffect, useState } from 'react'
import { queueSize } from '@/lib/offline-queue'
import { flushQueue } from '@/lib/transitions'

/** Estado online/offline del dispositivo + flush de la cola al reconectar. */
export function useOnline(): { online: boolean; justRestored: boolean } {
  const [online, setOnline] = useState(true)
  const [justRestored, setJustRestored] = useState(false)

  useEffect(() => {
    setOnline(navigator.onLine)
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
