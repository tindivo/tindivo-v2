'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { mapsDirToCoords, mapsSearchAddress, telLink } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'

/** Card del restaurante: dirección + llamar + abrir en Maps (Momento 1/2). */
export function BusinessCard({ business }: { business: OrderDetailResponse['business'] }) {
  if (!business) return null
  const mapsHref =
    business.coordinatesLat != null && business.coordinatesLng != null
      ? mapsDirToCoords(business.coordinatesLat, business.coordinatesLng)
      : business.address
        ? mapsSearchAddress(business.address)
        : null

  return (
    <Card className="mt-3.5 p-[18px]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand-dark">
          <Icon name="store" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[16px]">{business.name}</p>
          {business.address && (
            <p className="mt-0.5 text-[13px] text-ink-muted">{business.address}</p>
          )}
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        {business.phone ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            as="a"
            href={telLink(business.phone)}
          >
            <Icon name="phone" size={20} />
            Llamar
          </Button>
        ) : (
          <span />
        )}
        {mapsHref && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            as="a"
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="location_on" size={20} />
            Abrir en Maps
          </Button>
        )}
      </div>
    </Card>
  )
}
