'use client'

import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
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

function TapToMove({ onChange }: { onChange: (c: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/** Mapa Leaflet/OSM con pin arrastrable. Cargar solo vía next/dynamic ssr:false. */
export default function MapPickerInner({
  position,
  onChange,
}: {
  position: LatLng
  onChange: (c: LatLng) => void
}) {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={16}
      zoomControl={false}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
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
