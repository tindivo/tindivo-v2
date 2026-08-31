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
  onSave,
  isSaving,
  heightPx = 360,
}: {
  value: LatLng[] | null
  center: LatLng
  onChange: (ring: LatLng[]) => void
  onSave?: (ring: LatLng[]) => void
  isSaving?: boolean
  heightPx?: number
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-ink/10 shadow-xs"
      style={{ height: heightPx }}
    >
      <Inner
        value={value}
        center={center}
        onChange={onChange}
        onSave={onSave}
        isSaving={isSaving}
      />
    </div>
  )
}
