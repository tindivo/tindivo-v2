'use client'

import { EmptyState, Icon } from '@tindivo/ui'
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
        <EmptyState
          icon="local_shipping"
          heading="No tienes pedidos activos"
          description="Toma uno de la bandeja Disponibles para empezar a repartir."
        />
      )}

      {deliveredToday.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              Entregados hoy ({deliveredToday.length})
            </span>
            <span
              aria-hidden
              className={`inline-flex text-ink-subtle transition-transform duration-200 ${
                historyOpen ? 'rotate-180' : 'rotate-0'
              }`}
            >
              <Icon name="expand_more" size={20} />
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
