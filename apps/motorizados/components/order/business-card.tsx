'use client'

import { Icon } from '@tindivo/ui'
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
    <div className="mt-3.5 rounded-[22px] border border-ink/5 bg-white p-[18px]">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: 'rgba(249,115,22,0.1)', color: '#C2410C' }}
        >
          <Icon.Store />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[16px]">{business.name}</p>
          {business.address && (
            <p className="mt-0.5 text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              {business.address}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        {business.phone ? (
          <a
            href={telLink(business.phone)}
            className="t-btn t-btn-ghost"
            style={{ padding: '12px 16px', fontSize: 14 }}
          >
            <span className="mr-1.5 inline-flex align-middle">
              <Icon.Phone />
            </span>
            Llamar
          </a>
        ) : (
          <span />
        )}
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="t-btn t-btn-secondary"
            style={{ padding: '12px 16px', fontSize: 14 }}
          >
            <span className="mr-1.5 inline-flex align-middle">
              <Icon.Pin />
            </span>
            Abrir en Maps
          </a>
        )}
      </div>
    </div>
  )
}
