'use client'

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface LatLng {
  lat: number
  lng: number
}

// Custom divIcon: leaflet's default PNG icons break under bundlers (missing assets).
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25))">
    <path d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z" fill="var(--color-brand)" stroke="#fff" stroke-width="2.5"/>
    <circle cx="17" cy="16" r="5" fill="#fff"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
})

const ZONE_STYLE = {
  color: 'var(--color-brand)',
  weight: 2,
  fillColor: 'var(--color-brand)',
  fillOpacity: 0.12,
} as const

/** Tocar el mapa mueve el pin y centra suavemente la vista en la nueva ubicación. */
function TapToMove({ onChange }: { onChange: (c: LatLng) => void }) {
  const map = useMap()
  useMapEvents({
    click(e) {
      map.panTo([e.latlng.lat, e.latlng.lng], { animate: true })
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/**
 * Reposiciona y centra la vista al pin con animación fluida (flyTo).
 * Se dispara al presionar "Usar mi ubicación" o al cambiar el token.
 */
function Recenter({ position, token }: { position: LatLng; token: number }) {
  const map = useMap()
  const last = useRef(token)
  useEffect(() => {
    if (token === last.current) return
    last.current = token
    map.flyTo([position.lat, position.lng], Math.max(map.getZoom(), 16), {
      animate: true,
      duration: 1.0,
    })
  }, [token, position, map])
  return null
}

function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}

/** Mapa Leaflet/OSM con pin arrastrable + zona de cobertura. Cargar solo vía next/dynamic ssr:false. */
export default function MapPickerInner({
  position,
  onChange,
  polygon,
  circle,
  recenterToken = 0,
}: {
  position: LatLng
  onChange: (c: LatLng) => void
  polygon: LatLng[] | null
  circle: { center: LatLng; radiusKm: number } | null
  recenterToken?: number
}) {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={16}
      zoomControl={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {polygon ? (
        <Polygon
          positions={polygon.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={ZONE_STYLE}
        />
      ) : circle ? (
        <Circle
          center={[circle.center.lat, circle.center.lng]}
          radius={circle.radiusKm * 1000}
          pathOptions={ZONE_STYLE}
        />
      ) : null}
      <Recenter position={position} token={recenterToken} />
      <InvalidateSize />
      <TapToMove onChange={onChange} />
      <Marker
        position={[position.lat, position.lng]}
        draggable
        icon={pinIcon}
        eventHandlers={{
          dragend: (e) => {
            const ll = (e.target as L.Marker).getLatLng()
            onChange({ lat: ll.lat, lng: ll.lng })
          },
        }}
      />
    </MapContainer>
  )
}
