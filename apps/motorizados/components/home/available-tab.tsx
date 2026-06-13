'use client'

import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { BoardOrder } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'
import { OrderCard } from './order-card'

/** Bandeja de disponibles: prioriza vencidos (HU-D-013), capa de capacidad
 *  (HU-D-014) y sección colapsable de "Próximos" en cola fría (HU-D-012). */
export function AvailableTab({
  available,
  upcoming,
  mySlots,
  hasOverdueAvailable,
  lastSyncOk,
  now,
}: {
  available: BoardOrder[]
  upcoming: BoardOrder[]
  mySlots: number
  hasOverdueAvailable: boolean
  lastSyncOk: boolean
  now: number
}) {
  const [upcomingOpen, setUpcomingOpen] = useState(false)
  const full = mySlots >= 3

  const sorted = [...available].sort((a, b) => {
    const ua = orderUrgency(a, now) === 'overdue' ? 0 : 1
    const ub = orderUrgency(b, now) === 'overdue' ? 0 : 1
    if (ua !== ub) return ua - ub
    return Date.parse(a.created_at) - Date.parse(b.created_at)
  })

  return (
    <div>
      {!lastSyncOk && (
        <span
          className="mb-3 inline-block rounded-md px-2 py-1 font-mono text-[10px] text-ink-subtle uppercase"
          style={{ letterSpacing: '0.14em', background: 'rgba(26,22,20,0.06)' }}
        >
          Datos sin conexión
        </span>
      )}

      {full && (
        <div
          className="mb-3 flex items-start gap-2.5 rounded-[18px] px-4 py-3.5"
          style={{ background: 'rgba(26,22,20,0.04)' }}
        >
          <Icon.Bag style={{ flexShrink: 0, marginTop: 2 }} />
          <p className="font-semibold text-[14px]">
            Mochila llena (3/3). Entrega un pedido para tomar otro.
          </p>
        </div>
      )}

      {hasOverdueAvailable && (
        <div className="mb-3 rounded-[18px] border border-danger/20 bg-danger/10 px-4 py-3 font-semibold text-[13px] text-danger">
          ⚠ Prioriza los pedidos vencidos
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {sorted.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            now={now}
            variant="available"
            dimmed={full || (hasOverdueAvailable && orderUrgency(o, now) !== 'overdue')}
          />
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="py-14 text-center">
          <span className="inline-block text-ink-subtle">
            <Icon.Truck style={{ width: 28, height: 28 }} />
          </span>
          <p className="t-muted mt-2 text-[14px]">Sin pedidos disponibles ahora.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setUpcomingOpen((v) => !v)}
          >
            <span className="t-eyebrow" style={{ marginBottom: 0 }}>
              Próximos ({upcoming.length})
            </span>
            <span
              aria-hidden
              className="inline-flex text-ink-subtle"
              style={{
                transform: upcomingOpen ? 'rotate(90deg)' : 'rotate(-90deg)',
                transition: 'transform 200ms ease',
              }}
            >
              <Icon.Back />
            </span>
          </button>
          {upcomingOpen && (
            <div className="mt-2 flex flex-col gap-2.5">
              {upcoming.map((o) => (
                <OrderCard key={o.id} order={o} now={now} variant="upcoming" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
