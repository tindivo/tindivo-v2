'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { mapsDirToCoords } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'
import { CollectCard } from './collect-card'
import { CustomerCard } from './customer-card'
import { MapReadonly } from './map-readonly'

/** Momento 3 (picked_up): destino + cliente + cobro. Online = mapa; manual = referencia. */
export function MomentPickedUp({
  detail,
  onReport,
  onNoShow,
  busy,
}: {
  detail: OrderDetailResponse
  onReport: () => void
  onNoShow: () => void
  busy?: boolean
}) {
  const { order } = detail
  const hasCoords = order.deliveryCoordinatesLat != null && order.deliveryCoordinatesLng != null

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!order.arrivedAtCustomerAt) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [order.arrivedAtCustomerAt])

  const arrivedAt = order.arrivedAtCustomerAt ? Date.parse(order.arrivedAtCustomerAt) : null
  const noShowDurationMs = 5 * 60 * 1000
  const remainingMs = arrivedAt ? Math.max(0, arrivedAt + noShowDurationMs - now) : 0
  const remainingSec = Math.ceil(remainingMs / 1000)
  const minLeft = Math.floor(remainingSec / 60)
  const secLeft = remainingSec % 60
  const countdownFormatted = `${minLeft}:${secLeft.toString().padStart(2, '0')}`
  const canNoShow = arrivedAt != null && remainingMs === 0

  return (
    <div>
      <CustomerCard order={order} />

      {order.arrivedAtCustomerAt && (
        <Card className="mt-3 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-900 font-semibold text-[14px]">
            <Icon name="person_pin_circle" size={20} className="text-amber-600" />
            Llegada registrada al domicilio
          </div>
          <p className="mt-1 text-[13px] text-amber-800">
            {canNoShow
              ? 'Se ha cumplido la ventana de espera de 5 minutos.'
              : `Esperando respuesta del cliente (${countdownFormatted} restante).`}
          </p>

          <Button
            size="sm"
            variant="ghost"
            disabled={!canNoShow || busy}
            onClick={onNoShow}
            className="mt-3 w-full border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            <Icon name="report_problem" size={18} />
            {canNoShow
              ? 'Reportar cliente no aparece (No-show)'
              : `Cliente no responde (${countdownFormatted})`}
          </Button>
        </Card>
      )}

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
