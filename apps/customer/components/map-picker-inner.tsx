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
    <path d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z" fill="#F97316" stroke="#fff" stroke-width="2.5"/>
    <circle cx="17" cy="16" r="5" fill="#fff"/>
  </svg>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
})

const ZONE_STYLE = {
  color: '#F97316',
  weight: 2,
  fillColor: '#F97316',
  fillOpacity: 0.12,
} as const

function TapToMove({ onChange }: { onChange: (c: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/**
 * Reposiciona la vista al pin cuando `token` cambia (lo dispara "Usar mi ubicación").
 * Guardado por token para NO recentrar al arrastrar el pin (eso sería brusco).
 */
function Recenter({ position, token }: { position: LatLng; token: number }) {
  const map = useMap()
  const last = useRef(token)
  useEffect(() => {
    if (token === last.current) return
    last.current = token
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 16))
  }, [token, position, map])
  return null
}

/** Encuadra la vista a la zona de cobertura (una sola vez), para mostrar todo San Jacinto. */
function FitZone({
  polygon,
  circle,
}: {
  polygon: LatLng[] | null
  circle: { center: LatLng; radiusKm: number } | null
}) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    if (polygon && polygon.length >= 3) {
      map.fitBounds(L.latLngBounds(polygon.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [18, 18],
      })
      fitted.current = true
    } else if (circle) {
      map.fitBounds(
        L.latLng(circle.center.lat, circle.center.lng).toBounds(circle.radiusKm * 2000),
        { padding: [18, 18] },
      )
      fitted.current = true
    }
  }, [map, polygon, circle])
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
      zoom={15}
      zoomControl={false}
      style={{ width: '100%', height: '100%' }}
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
      <FitZone polygon={polygon} circle={circle} />
      <Recenter position={position} token={recenterToken} />
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
