'use client'

import dynamic from 'next/dynamic'
import type { LatLng } from './coverage-polygon-editor-inner'

export type { LatLng }

// Leaflet + leaflet-draw tocan `window`: cargar solo en cliente.
const Inner = dynamic(() => import('./coverage-polygon-editor-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

/** Editor del polígono de cobertura (Leaflet-draw). Reporta el anillo {lat,lng} al dibujar/editar. */
export function CoveragePolygonEditor({
  value,
  center,
  onChange,
  heightPx = 320,
}: {
  value: LatLng[] | null
  center: LatLng
  onChange: (ring: LatLng[]) => void
  heightPx?: number
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10" style={{ height: heightPx }}>
      <Inner value={value} center={center} onChange={onChange} />
    </div>
  )
}
