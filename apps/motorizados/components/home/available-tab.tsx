'use client'

import { Badge, Card, EmptyState, Icon } from '@tindivo/ui'
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
        <Badge variant="default" size="sm" className="mb-3 font-mono uppercase tracking-widest">
          Datos sin conexión
        </Badge>
      )}

      {full && (
        <Card className="mb-3 flex items-start gap-2.5 border-none bg-ink/[0.04] p-4 shadow-none">
          <Icon name="shopping_basket" size={20} className="shrink-0 text-ink" />
          <p className="font-semibold text-[14px]">
            Mochila llena (3/3). Entrega un pedido para tomar otro.
          </p>
        </Card>
      )}

      {hasOverdueAvailable && (
        <Card className="mb-3 border-danger/15 bg-danger-soft p-4 shadow-none">
          <p className="flex items-center gap-2 font-semibold text-[13px] text-danger">
            <Icon name="warning" size={18} />
            Prioriza los pedidos vencidos
          </p>
        </Card>
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
        <EmptyState
          icon="local_shipping"
          heading="Sin pedidos disponibles"
          description="Vuelve en unos minutos, pronto llegarán nuevas entregas."
        />
      )}

      {upcoming.length > 0 && (
        <div className="mt-5">
          <button
            type="button"
            className="flex w-full items-center justify-between"
            onClick={() => setUpcomingOpen((v) => !v)}
          >
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
              Próximos ({upcoming.length})
            </span>
            <span
              aria-hidden
              className={`inline-flex text-ink-subtle transition-transform duration-200 ${
                upcomingOpen ? 'rotate-90' : '-rotate-90'
              }`}
            >
              <Icon name="arrow_back" size={20} />
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
