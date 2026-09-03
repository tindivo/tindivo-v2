'use client'

import dynamic from 'next/dynamic'
import type { LatLng } from './business-location-map-inner'

export type { LatLng }

const Inner = dynamic(() => import('./business-location-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 w-full animate-pulse items-center justify-center rounded-2xl border border-ink/10 bg-ink/[0.04]">
      <span className="text-[13px] text-ink-muted">Cargando mapa interactivo…</span>
    </div>
  ),
})

export function BusinessLocationMap({
  value,
  onChange,
  heightPx = 340,
  businessName,
}: {
  value: LatLng | null
  onChange: (coords: LatLng | null) => void
  heightPx?: number
  businessName?: string
}) {
  return <Inner value={value} onChange={onChange} heightPx={heightPx} businessName={businessName} />
}
