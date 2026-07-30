'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { mapsDirToCoords } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'
import { CollectCard } from './collect-card'
import { CustomerCard } from './customer-card'
import { MapReadonly } from './map-readonly'

/** Momento 3 (picked_up): destino + cliente + cobro. Online = mapa; manual = referencia. */
export function MomentPickedUp({
  detail,
  onReport,
}: {
  detail: OrderDetailResponse
  onReport: () => void
}) {
  const { order } = detail
  const hasCoords = order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null

  return (
    <div>
      <CustomerCard order={order} />

      {hasCoords ? (
        <Card className="mt-3 overflow-hidden p-0">
          <MapReadonly
            lat={order.deliveryCoordinatesLat as number}
            lng={order.deliveryCoordinatesLng as number}
            heightPx={180}
          />
          <div className="p-4">
            <p className="t-eyebrow">Entregar en</p>
            {order.deliveryAddress && <p className="mt-1 text-[14px]">{order.deliveryAddress}</p>}
            {order.deliveryReference && (
              <p className="mt-0.5 text-[13px] text-ink-muted">{order.deliveryReference}</p>
            )}
            <Button
              size="sm"
              className="mt-3 w-full"
              as="a"
              href={mapsDirToCoords(
                order.deliveryCoordinatesLat as number,
                order.deliveryCoordinatesLng as number,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="location_on" size={20} />
              Cómo llegar
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="mt-3 p-[18px]">
          <p className="t-eyebrow">Referencia del cliente</p>
          <p className="mt-2 text-[17px] font-semibold leading-snug">
            {order.deliveryReference ?? 'Sin referencia — llama al cliente'}
          </p>
          {order.deliveryAddress && (
            <p className="mt-1 text-[14px] text-ink-muted">{order.deliveryAddress}</p>
          )}
        </Card>
      )}

      <CollectCard detail={detail} />

      <button
        type="button"
        onClick={onReport}
        className="mt-4 px-1 text-[13px] text-ink-subtle underline transition-colors hover:text-ink"
      >
        Reportar un problema
      </button>
    </div>
  )
}
