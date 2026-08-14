'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { NocheCerrada } from '../hooks/use-cash-settlements'

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
 * Las noches ya cerradas, una fila por (motorizado, noche).
 *
 * NO una tarjeta por liquidación. Desde 0157 hay una liquidación por cliente, y
 * la lista plana que había antes —una tarjeta grande por fila— pasaba de tres
 * tarjetas por semana a setenta. El historial se consulta para responder «¿cuánto
 * cerró Ernesto el martes?», que es exactamente esta agrupación; el detalle por
 * cliente sigue estando, a un toque.
 */
export function HistorialNoches({ noches }: { noches: NocheCerrada[] }) {
  if (noches.length === 0) return null

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2.5">
        <Icon name="history" size={20} className="text-ink-muted" />
        <div className="text-base font-bold">Noches cerradas</div>
      </div>
      <div className="flex flex-col gap-2">
        {noches.map((n) => (
          <FilaNoche key={n.key} noche={n} />
        ))}
      </div>
    </div>
  )
}

function FilaNoche({ noche }: { noche: NocheCerrada }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="rounded-2xl border border-ink/[0.04] bg-card shadow-elev-1">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
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
        <ul className="flex flex-col gap-1.5 border-t border-ink/[0.04] px-4 py-2.5">
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
