'use client'

import { Icon } from '@tindivo/ui'
import { useMySlots } from '@/hooks/use-driver-orders'

const MAX_SLOTS = 3

/**
 * Indicador compacto de ocupación de mochila (slots) para el GlassTopBar.
 * Verde si hay capacidad, amarillo en 2/3, rojo cuando está llena.
 *
 * SIN RELOJ. Este componente cuelga de `DriverShell`, o sea que está montado en
 * todas las rutas del grupo `(driver)`. Pedía `useNow()` solo para poder llamar
 * a `useDriverOrders(now)`, y el precio eran dos cosas: un board entero por su
 * cuenta —50 pedidos cada 15s en `/perfil` o `/restaurantes`, donde no hay
 * ningún tablero— y un repintado por segundo de un número que no cambia con el
 * tiempo. `useMySlots()` lee del mismo store sin ninguna de las dos.
 */
export function CapacityIndicator() {
  const mySlots = useMySlots()

  const isOverflow = mySlots > MAX_SLOTS
  const isFull = mySlots >= MAX_SLOTS
  const isNear = !isFull && mySlots >= MAX_SLOTS - 1

  const palette = isOverflow
    ? {
        bg: 'bg-danger border border-white/20',
        text: 'text-white',
        icon: 'warning' as const,
        label: `Mochila sobrecargada: ${mySlots}/${MAX_SLOTS}`,
      }
    : isFull
      ? {
          bg: 'bg-danger',
          text: 'text-white',
          icon: 'block' as const,
          label: `Mochila llena: ${mySlots}/${MAX_SLOTS}`,
        }
      : isNear
        ? {
            bg: 'bg-warning-soft',
            text: 'text-warning',
            icon: 'hourglass_top' as const,
            label: `Mochila casi llena: ${mySlots}/${MAX_SLOTS}`,
          }
        : {
            bg: 'bg-success/15',
            text: 'text-success',
            icon: 'delivery_dining' as const,
            label: `Mochila ${mySlots}/${MAX_SLOTS}`,
          }

  return (
    <div
      role="status"
      aria-label={palette.label}
      title={palette.label}
      className={`flex items-center gap-2 rounded-full py-2 pr-3 pl-2.5 text-sm font-bold ${palette.bg} ${palette.text}`}
    >
      <Icon name={palette.icon} size={18} filled />
      <span className="font-mono tabular-nums leading-none tracking-[-0.01em]">
        {mySlots}/{MAX_SLOTS}
      </span>
    </div>
  )
}
