'use client'

import { Badge, Card, EmptyState, Icon, SkeletonList } from '@tindivo/ui'
import { useMemo } from 'react'
import { useOverdueFeedback } from '@/hooks/use-overdue-feedback'
import type { BoardOrder } from '@/lib/types'
import { orderUrgency } from '@/lib/urgency'
import { OrderCard } from './order-card'
import { OverdueBanner } from './overdue-banner'
import { UpcomingOrdersSection } from './upcoming-orders-section'

/** Bandeja de disponibles: prioriza vencidos (HU-D-013), capa de capacidad
 *  (HU-D-014) y sección colapsable de "Próximos" en cola fría (HU-D-012). */
export function AvailableTab({
  available,
  upcoming,
  mySlots,
  hasOverdueAvailable: _hasOverdueAvailable,
  lastSyncOk,
  loading,
  now,
}: {
  available: BoardOrder[]
  upcoming: BoardOrder[]
  mySlots: number
  hasOverdueAvailable: boolean
  lastSyncOk: boolean
  /** Primera carga sin resolver: no se sabe si está vacío. */
  loading: boolean
  now: number
}) {
  const full = mySlots >= 3

  const overdueSet = useMemo(() => {
    const set = new Set<string>()
    for (const o of available) {
      if (orderUrgency(o, now) === 'overdue') set.add(o.id)
    }
    return set
  }, [available, now])

  const overdueCount = overdueSet.size
  const hasOverdue = overdueCount > 0

  // Feedback háptico + audible cuando se detectan pedidos vencidos nuevos
  useOverdueFeedback(overdueSet)

  const sorted = useMemo(() => {
    return [...available].sort((a, b) => {
      const ua = orderUrgency(a, now) === 'overdue' ? 0 : 1
      const ub = orderUrgency(b, now) === 'overdue' ? 0 : 1
      if (ua !== ub) return ua - ub
      return Date.parse(a.created_at) - Date.parse(b.created_at)
    })
  }, [available, now])

  // UN VACÍO SOLO SE AFIRMA CUANDO SE SABE VACÍO.
  //
  // El board arranca con `orders: []`, así que el primer render decía "Sin
  // pedidos disponibles" y un instante después aparecían las tarjetas: la
  // pantalla afirmaba lo contrario de la verdad justo cuando el motorizado la
  // mira para decidir si tiene trabajo.
  if (loading) return <SkeletonList count={3} />

  return (
    <div>
      {!lastSyncOk && (
        <Badge variant="default" size="sm" className="mb-3 font-mono uppercase tracking-widest">
          Datos sin conexión
        </Badge>
      )}

      {full && (
        <Card className="mb-3 flex items-start gap-2.5 border border-ink/[0.06] bg-ink/[0.03] p-4 shadow-none">
          <Icon name="shopping_basket" size={20} className="shrink-0 text-ink" />
          <p className="font-semibold text-[14px]">
            Mochila llena {mySlots}/3. Entrega un pedido para tomar otro.
          </p>
        </Card>
      )}

      <OverdueBanner count={overdueCount} />

      <div className="flex flex-col gap-2.5">
        {sorted.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            now={now}
            variant="available"
            // Mochila llena = NO se puede tomar, y así se comporta la tarjeta.
            // La razón viaja con ella: el cartel de arriba se pierde en cuanto
            // la lista scrollea.
            blocked={full}
            blockedReason={full ? `Mochila llena ${mySlots}/3` : undefined}
            // La prioridad de vencidos sigue siendo solo visual hasta T6.
            dimmed={!full && hasOverdue && orderUrgency(o, now) !== 'overdue'}
          />
        ))}
      </div>

      {sorted.length === 0 && upcoming.length === 0 && (
        <EmptyState
          icon="local_shipping"
          heading="Sin pedidos disponibles"
          description="Vuelve en unos minutos, pronto llegarán nuevas entregas."
        />
      )}

      <UpcomingOrdersSection items={upcoming} now={now} />
    </div>
  )
}
