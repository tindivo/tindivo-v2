'use client'

import dynamic from 'next/dynamic'
import type { MapLayerMode } from '@/lib/map-layers'
import type { LandmarkPoint, LatLng } from './landmarks-map-inner'

export type { LandmarkPoint, LatLng }

// Leaflet toca `window`: cargar solo en cliente.
const Inner = dynamic(() => import('./landmarks-map-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

/** Envoltorio fino sobre el lienzo dinámico. Ver `landmarks-map-inner.tsx` para la lógica real. */
export function LandmarksMap({
  coverage,
  landmarks,
  center,
  interactive,
  mode,
  pending,
  onPick,
  focusId,
}: {
  coverage: LatLng[] | null
  landmarks: LandmarkPoint[]
  center: LatLng
  interactive: boolean
  mode: MapLayerMode
  pending?: LatLng | null
  onPick?: (p: LatLng) => void
  focusId?: string | null
}) {
  return (
    <Inner
      coverage={coverage}
      landmarks={landmarks}
      center={center}
      interactive={interactive}
      mode={mode}
      pending={pending}
      onPick={onPick}
      focusId={focusId}
    />
  )
}
