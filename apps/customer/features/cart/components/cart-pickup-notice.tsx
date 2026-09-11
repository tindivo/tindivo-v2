'use client'

import { Icon } from '@tindivo/ui'
import { useCart } from '@/lib/cart'

/**
 * «Este pedido lo recoges tú», dicho en la bolsa.
 *
 * POR QUÉ HACE FALTA SI YA SE ELIGIÓ ARRIBA. La elección se hace en la ficha del
 * negocio y no se vuelve a ver hasta el checkout, con toda la carta y varios
 * toques en medio. El recojo cambia dos cosas que se dan por supuestas —no viene
 * nadie a tu puerta y no se paga envío—, así que llegar al pago y encontrárselo
 * es la clase de sorpresa que termina en una llamada a la cajera.
 *
 * SOLO SE PINTA EN RECOJO, y eso es deliberado: el delivery es el supuesto por
 * defecto de la app, así que anunciarlo no informa de nada y le mete una fila a
 * la vista que más se usa. Además deja el caso común exactamente como estaba.
 *
 * NO DICE UN TIEMPO. No hay estimación de solo-preparación en `businesses` (ver
 * `business-identity.tsx`), y un número inventado aquí es un número que la caja
 * tendrá que defender.
 */
export function CartPickupNotice() {
  const deliveryMethod = useCart((s) => s.deliveryMethod)
  if (deliveryMethod !== 'pickup') return null

  return (
    <div className="flex items-center gap-2 rounded-[12px] bg-brand-soft/40 px-3 py-2 text-[12.5px] text-ink-muted">
      <Icon name="store" size={16} className="shrink-0 text-brand-dark" />
      <span className="min-w-0">
        Lo <strong className="font-semibold text-ink">recoges en el local</strong> · sin costo de
        envío
      </span>
    </div>
  )
}
