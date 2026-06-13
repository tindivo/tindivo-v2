'use client'

import { ApiError } from '@tindivo/api-client'
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
    return <div className="mb-4 h-[58px] animate-pulse rounded-[22px] bg-white" />
  }

  const blocked = !avail.available && !avail.withinSchedule

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || blocked}
        className={`flex w-full items-center justify-between rounded-[22px] px-4 py-3.5 ${
          avail.available
            ? 'border border-success/20 bg-success/10'
            : 'border border-ink/5 bg-white'
        } disabled:opacity-70`}
      >
        <span className="flex items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              avail.available ? 'animate-pulse bg-success' : 'bg-ink-subtle'
            }`}
          />
          <span className="font-semibold text-[15px]">
            {avail.available ? 'Estás disponible' : 'No disponible'}
          </span>
        </span>
        <span
          className="text-[12px]"
          style={{ color: blocked ? '#92400E' : 'rgba(26,22,20,0.55)' }}
        >
          {avail.available
            ? 'Tocar para descansar'
            : blocked
              ? 'Fuera de horario'
              : 'Tocar para recibir pedidos'}
        </span>
      </button>
      {error && <p className="mt-2 px-1 text-[13px] text-danger">{error}</p>}
    </div>
  )
}
