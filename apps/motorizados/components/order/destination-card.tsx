'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { mapsDirToCoords, mapsSearchAddress } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * A dónde va DESPUÉS de recoger. Se enseña ya en el trayecto al local: saber
 * si la entrega queda al lado o al otro extremo del pueblo cambia cómo se
 * organiza el motorizado, y hasta ahora ese dato no aparecía hasta tener el
 * pedido en la mochila.
 */
export function DestinationCard({ detail }: { detail: OrderDetailResponse }) {
  const { order } = detail
  const where = order.deliveryReference ?? order.deliveryAddress
  if (order.deliveryMethod === 'pickup' || !where) return null

  const mapsHref =
    order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null
      ? mapsDirToCoords(order.deliveryCoordinatesLat, order.deliveryCoordinatesLng)
      : mapsSearchAddress(where)

  return (
    <Card className="mt-3.5 p-[18px]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted">
          <Icon name="flag" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Entregar en
          </span>
          <p className="mt-0.5 text-body-lg font-semibold leading-snug text-ink">{where}</p>
          {/* En los manuales `delivery_address` es el relleno 'Pedido manual'
              que pone create_business_manual_order: solo estorba. */}
          {!order.isManual && order.deliveryAddress && order.deliveryReference && (
            <p className="mt-0.5 text-caption text-ink-subtle">{order.deliveryAddress}</p>
          )}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-3 w-full"
        as="a"
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="map" size={20} />
        Ver la entrega en Maps
      </Button>
    </Card>
  )
}
