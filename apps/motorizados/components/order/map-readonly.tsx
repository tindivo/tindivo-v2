'use client'

import dynamic from 'next/dynamic'

// Leaflet toca `window`: cliente puro.
const Inner = dynamic(() => import('./map-readonly-inner'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse" style={{ background: 'rgba(26,22,20,0.06)' }} />
  ),
})

/** Mapa de la ubicación de entrega (pedidos online con coordenadas). */
export function MapReadonly({
  lat,
  lng,
  heightPx = 180,
}: {
  lat: number
  lng: number
  heightPx?: number
}) {
  return (
    <div className="relative overflow-hidden" style={{ height: heightPx }}>
      <Inner lat={lat} lng={lng} />
    </div>
  )
}
