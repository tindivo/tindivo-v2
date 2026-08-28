'use client'

import { BottomSheet, Button, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { NocheCerrada } from '../hooks/use-cash-settlements'
import { useHistorialNoches } from '../hooks/use-historial-noches'

const horaLima = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})

/** `2026-08-13` -> `mié 13 ago`. Se formatea desde las partes y no con `new
 *  Date(fecha)`, que interpreta el string como UTC y en Lima retrocede un día. */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Lima',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

/**
 * Modal BottomSheet con el historial de noches cerradas, cargado bajo demanda.
 *
 * No se consulta con cada carga de la pantalla principal de liquidaciones:
 * solo cuando la cajera pulsa el botón para consultar jornadas pasadas.
 */
export function HistorialNochesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { noches, loading, error, reload } = useHistorialNoches(open)

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex max-h-[80vh] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 pb-3 pt-1">
          <div className="flex items-center gap-2">
            <Icon name="history" size={22} className="text-ink-muted" />
            <div>
              <h2 className="text-[17px] font-bold">Noches cerradas</h2>
              <p className="text-xs text-ink-muted">Historial de liquidaciones anteriores</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-ink/[0.06] hover:text-ink"
            aria-label="Cerrar"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <SkeletonList count={3} />
          ) : error ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-danger-soft p-4 text-center text-sm text-danger">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={reload}>
                Reintentar
              </Button>
            </div>
          ) : noches.length === 0 ? (
            <EmptyState
              icon="history"
              heading="Sin noches cerradas"
              description="Las liquidaciones de jornadas anteriores aparecerán aquí una vez confirmadas."
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              {noches.map((n) => (
                <FilaNoche key={n.key} noche={n} />
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

function FilaNoche({ noche }: { noche: NocheCerrada }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="rounded-2xl border border-ink/[0.06] bg-card shadow-elev-1 transition-all">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-ink/[0.02]"
      >
        <Icon name="check_circle" size={18} filled className="shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{noche.driverName}</div>
          <div className="text-xs text-ink-muted">
            {fechaLarga(noche.fecha)} · {noche.count} {noche.count === 1 ? 'cliente' : 'clientes'}
          </div>
        </div>
        <div className="font-mono shrink-0 text-[15px] font-bold tabular-nums">
          {soles(noche.total)}
        </div>
        <Icon name={abierto ? 'expand_less' : 'expand_more'} size={18} className="text-ink-muted" />
      </button>

      {abierto && (
        <ul className="flex flex-col gap-1.5 border-t border-ink/[0.04] bg-surface-subtle/50 px-4 py-2.5">
          {noche.lines.map((l) => (
            <li key={l.orderId} className="flex items-baseline gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-ink">{l.customerName?.trim() || `#${l.shortId}`}</span>
                {l.deliveredAt && (
                  <span className="ml-1.5 font-mono text-[11px] text-ink-muted">
                    {horaLima.format(Date.parse(l.deliveredAt))}
                  </span>
                )}
              </span>
              <span className="font-mono shrink-0 font-semibold tabular-nums">
                {soles(l.cashOwed)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
