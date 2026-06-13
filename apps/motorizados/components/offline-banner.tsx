'use client'

import { useOnline } from '@/hooks/use-online'
import { queueSize } from '@/lib/offline-queue'

/** Barra superior de conectividad (HU-D-038) + contador de la cola offline. */
export function OfflineBanner() {
  const { online, justRestored } = useOnline()

  if (online && !justRestored) return null

  if (!online) {
    const pending = queueSize()
    return (
      <div className="fixed inset-x-0 top-0 z-[90] bg-danger py-2 text-center font-semibold text-[13px] text-white">
        Sin conexión. Reintentando…
        {pending > 0 && (
          <span className="ml-1.5 font-mono text-[11px] opacity-80">
            · {pending} {pending === 1 ? 'acción' : 'acciones'} en cola
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[90] bg-success py-2 text-center font-semibold text-[13px] text-white">
      ✓ Conexión restablecida
    </div>
  )
}
