'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { BoardOrder } from '@/lib/types'
import { OrderCard } from './order-card'

/** Mis pedidos activos + historial del turno (Entregados hoy, HU-D-037). */
export function MineTab({
  mine,
  deliveredToday,
  now,
}: {
  mine: BoardOrder[]
  deliveredToday: BoardOrder[]
  now: number
}) {
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {mine.map((o) => (
          <OrderCard key={o.id} order={o} now={now} variant="mine" />
        ))}
      </div>

      {mine.length === 0 && (
        <div className="py-14 text-center">
          <span className="inline-block text-ink-subtle">
            <Icon.Truck style={{ width: 28, height: 28 }} />
          </span>
          <p className="t-muted mt-2 text-[14px]">
            No tienes pedidos activos. Toma uno en Disponibles.
          </p>
        </div>
      )}

      {deliveredToday.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span className="t-eyebrow" style={{ marginBottom: 0 }}>
              Entregados hoy ({deliveredToday.length})
            </span>
            <span
              aria-hidden
              className="inline-flex text-ink-subtle"
              style={{
                transform: historyOpen ? 'rotate(90deg)' : 'rotate(-90deg)',
                transition: 'transform 200ms ease',
              }}
            >
              <Icon.Back />
            </span>
          </button>
          {historyOpen && (
            <div className="mt-2 flex flex-col gap-2.5">
              {deliveredToday.map((o) => (
                <OrderCard key={o.id} order={o} now={now} variant="delivered" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
