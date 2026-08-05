'use client'

import { Icon } from '@tindivo/ui'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'

const MAX_SLOTS = 3

/**
 * Indicador compacto de ocupación de mochila (slots) para el GlassTopBar.
 * Verde si hay capacidad, amarillo en 2/3, rojo cuando está llena.
 */
export function CapacityIndicator() {
  const now = useNow()
  const { mySlots } = useDriverOrders(now)

  const isFull = mySlots >= MAX_SLOTS
  const isNear = !isFull && mySlots >= MAX_SLOTS - 1

  const palette = isFull
    ? { bg: 'bg-danger', text: 'text-white', icon: 'block' as const }
    : isNear
      ? { bg: 'bg-warning-soft', text: 'text-warning', icon: 'hourglass_top' as const }
      : { bg: 'bg-success/15', text: 'text-success', icon: 'delivery_dining' as const }

  return (
    <div
      role="status"
      aria-label={`Mochila ${mySlots} de ${MAX_SLOTS} slots`}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${palette.bg} ${palette.text}`}
    >
      <Icon name={palette.icon} size={16} filled />
      <span className="font-mono tabular-nums leading-none tracking-[-0.01em]">
        {mySlots}/{MAX_SLOTS}
      </span>
    </div>
  )
}
