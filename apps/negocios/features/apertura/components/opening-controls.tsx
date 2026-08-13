'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { useOpeningDay } from '../hooks/use-opening-day'

/**
 * Apertura de la jornada: la pregunta del principio y la franja para cambiar
 * de idea después.
 *
 * Los dos van juntos en un componente porque comparten el hook —y con él, una
 * sola lectura a la base— y porque el estado de uno decide el del otro: el
 * modal solo aparece mientras no haya declaración, y la franja está siempre
 * que el negocio esté en su horario.
 *
 * Nada de esto se muestra fuera del horario semanal. A las diez de la mañana
 * la cajera está cambiando precios, no abriendo el local.
 */
export function OpeningControls() {
  const { status, withinSchedule, loading, saving, error, declare } = useOpeningDay()
  const [postponed, setPostponed] = useState(false)

  if (loading || !withinSchedule) return null

  const askingFirstTime = status === null && !postponed

  return (
    <>
      {askingFirstTime && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-ink/45 p-5">
          <div className="w-full max-w-[380px] rounded-[20px] bg-card p-6 text-center shadow-elev-4">
            <span className="mx-auto mb-3.5 flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <Icon name="store" size={26} filled />
            </span>

            <h3 className="mb-2 text-[17px] font-bold text-ink">¿Abren hoy?</h3>
            <p className="mb-5 text-[14px] leading-relaxed text-ink-muted">
              Los clientes te verán abierto solo si lo confirmas.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={saving}
                onClick={() => declare('open')}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-bold text-white transition-all active:scale-[0.97] disabled:opacity-50"
              >
                <Icon name="check_circle" size={18} filled />
                Sí, abrimos hoy
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => declare('closed')}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink/[0.06] px-4 text-[15px] font-bold text-ink transition-colors hover:bg-ink/[0.1] disabled:opacity-50"
              >
                Hoy no atendemos
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setPostponed(true)}
                className="mt-0.5 text-[13px] font-semibold text-ink-subtle disabled:opacity-50"
              >
                Decidir más tarde
              </button>
            </div>

            {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
          </div>
        </div>
      )}

      <OpeningBar status={status} saving={saving} onChange={declare} />
    </>
  )
}

/**
 * Franja de estado. Existe para que la declaración no sea irreversible: si a
 * media tarde se va la luz, cerrar tiene que costar un toque, no una llamada.
 */
function OpeningBar({
  status,
  saving,
  onChange,
}: {
  status: 'open' | 'closed' | null
  saving: boolean
  onChange: (next: 'open' | 'closed') => void
}) {
  if (status === 'open') {
    return (
      <div className="flex items-center justify-between gap-2 bg-success-soft px-4 py-2 text-[13px] font-semibold text-emerald-900">
        <span className="flex items-center gap-2">
          <Icon name="check_circle" size={16} filled />
          Atendiendo hoy
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={() => onChange('closed')}
          className="shrink-0 rounded-full bg-ink/[0.06] px-3 py-1 font-bold text-ink transition-colors hover:bg-ink/[0.12] disabled:opacity-50"
        >
          Cerrar por hoy
        </button>
      </div>
    )
  }

  const isClosed = status === 'closed'
  return (
    <div className="flex items-center justify-between gap-2 bg-warning-soft px-4 py-2 text-[13px] font-semibold text-amber-900">
      <span className="flex items-center gap-2">
        <Icon name="info" size={16} filled />
        {isClosed ? 'Hoy no atienden. No entran pedidos.' : 'Sin confirmar. No entran pedidos.'}
      </span>
      <button
        type="button"
        disabled={saving}
        onClick={() => onChange('open')}
        className="shrink-0 rounded-full bg-ink px-3 py-1 font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isClosed ? 'Reabrir' : 'Confirmar apertura'}
      </button>
    </div>
  )
}
