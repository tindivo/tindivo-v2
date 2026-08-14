'use client'

import dynamic from 'next/dynamic'
import type { LatLng, ZoneShape } from './zones-map-inner'

export type { LatLng, ZoneShape }

// Leaflet + leaflet-draw tocan `window`: cargar solo en cliente.
const Inner = dynamic(() => import('./zones-map-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

/** Mapa de zonas de cobro: la cobertura de fondo, las zonas lejanas encima. */
export function ZonesMap({
  coverage,
  zones,
  center,
  onCreate,
  onEdit,
  onDelete,
  heightPx = 460,
}: {
  coverage: LatLng[] | null
  zones: ZoneShape[]
  center: LatLng
  onCreate: (ring: LatLng[]) => void
  onEdit: (id: string, ring: LatLng[]) => void
  onDelete: (id: string) => void
  heightPx?: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10" style={{ height: heightPx }}>
      <Inner
        coverage={coverage}
        zones={zones}
        center={center}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  )
}
