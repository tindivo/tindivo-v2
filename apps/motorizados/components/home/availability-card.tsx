'use client'

import { ApiError } from '@tindivo/api-client'
import { ColorDot } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Availability {
  available: boolean
  withinSchedule: boolean
}

/** Toggle de disponibilidad con bloqueo fuera de horario (HU-D-008/009). */
export function AvailabilityCard() {
  const [avail, setAvail] = useState<Availability | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api
      .get<{ data: Availability }>('/driver/availability')
      .then((r) => setAvail(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggle() {
    if (!avail || busy) return
    setError(null)
    setBusy(true)
    try {
      await api.post('/driver/availability', { available: !avail.available })
      load()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  if (!avail) {
    return <div className="mb-4 h-[72px] animate-pulse rounded-2xl bg-surface-low" />
  }

  const blocked = !avail.available && !avail.withinSchedule
  const active = avail.available

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || blocked}
        className={`block w-full rounded-2xl border p-4 text-left transition-all active:scale-[0.99] disabled:opacity-70 ${
          active
            ? 'border-success/20 bg-success/10 shadow-elev-2'
            : 'border-ink/[0.04] bg-card shadow-elev-1'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <ColorDot
              color={active ? '#059669' : blocked ? '#9c958e' : '#6b655e'}
              size={10}
              className={active ? 'animate-pulse' : ''}
            />
            <span className="font-semibold text-[15px]">
              {active ? 'Estás disponible' : 'No disponible'}
            </span>
          </span>
          <span
            className={`text-[12px] ${blocked ? 'font-medium text-warning' : 'text-ink-subtle'}`}
          >
            {active
              ? 'Tocar para descansar'
              : blocked
                ? 'Fuera de horario'
                : 'Tocar para recibir pedidos'}
          </span>
        </div>
      </button>
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
    </div>
  )
}
