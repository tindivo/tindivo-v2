'use client'

import { Icon } from '@tindivo/ui'
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
        <div className="mt-3 overflow-hidden rounded-[22px] border border-ink/5 bg-white">
          <MapReadonly
            lat={order.deliveryCoordinatesLat as number}
            lng={order.deliveryCoordinatesLng as number}
            heightPx={180}
          />
          <div className="p-4">
            <p className="t-eyebrow">Entregar en</p>
            {order.deliveryAddress && <p className="mt-1 text-[14px]">{order.deliveryAddress}</p>}
            {order.deliveryReference && (
              <p className="mt-0.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                {order.deliveryReference}
              </p>
            )}
            <a
              href={mapsDirToCoords(
                order.deliveryCoordinatesLat as number,
                order.deliveryCoordinatesLng as number,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="t-btn t-btn-secondary t-btn-block mt-3"
              style={{ padding: '12px 16px', fontSize: 15 }}
            >
              <span className="mr-1.5 inline-flex align-middle">
                <Icon.Pin />
              </span>
              Cómo llegar
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-[22px] border border-ink/5 bg-white p-[18px]">
          <p className="t-eyebrow">Referencia del cliente</p>
          <p className="mt-2 font-semibold text-[17px] leading-snug">
            {order.deliveryReference ?? 'Sin referencia — llama al cliente'}
          </p>
          {order.deliveryAddress && (
            <p className="mt-1 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
              {order.deliveryAddress}
            </p>
          )}
        </div>
      )}

      <CollectCard detail={detail} />

      <button
        type="button"
        onClick={onReport}
        className="mt-4 px-1 text-[13px] text-ink-subtle underline"
      >
        Reportar un problema
      </button>
    </div>
  )
}
