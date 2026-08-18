'use client'

import { cn, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'tindivo:driver:toast'

let listener: ((text: string) => void) | null = null

/** Dispara un toast de éxito en la app del motorizado (persistente a través de redirecciones). */
export function notifyDriverSuccess(text: string): void {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, text)
    } catch {
      /* fail-open */
    }
  }
  listener?.(text)
}

/**
 * Host del toast para motorizados. Vive en DriverShell y muestra confirmaciones
 * flotantes sin interrumpir el flujo.
 */
export function DriverToastHost() {
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    function trigger(text: string) {
      if (timer) clearTimeout(timer)
      setToast({ text, id: Date.now() })
      timer = setTimeout(() => {
        setToast(null)
      }, 4000)
    }

    listener = trigger

    // Revisar si hay un toast pendiente de una navegación reciente
    if (typeof window !== 'undefined') {
      try {
        const pending = sessionStorage.getItem(STORAGE_KEY)
        if (pending) {
          sessionStorage.removeItem(STORAGE_KEY)
          trigger(pending)
        }
      } catch {
        /* ignore */
      }
    }

    return () => {
      listener = null
      if (timer) clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!toast) {
      setShown(false)
      return
    }
    setShown(false)
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [toast])

  if (!toast) return null

  return (
    <div
      key={toast.id}
      role="status"
      className={cn(
        'fixed left-1/2 top-[72px] z-[300] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full bg-success px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-[0_8px_24px_-6px_rgba(22,163,74,0.55)] transition-[transform,opacity] duration-200 pointer-events-none',
        shown ? 'translate-y-0 opacity-100' : '-translate-y-2.5 opacity-0',
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1), ease',
      }}
    >
      <Icon name="check_circle" size={18} filled className="shrink-0" />
      <span className="truncate">{toast.text}</span>
    </div>
  )
}
