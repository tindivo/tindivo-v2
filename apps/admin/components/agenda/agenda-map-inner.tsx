'use client'

import L from 'leaflet'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface LatLng {
  lat: number
  lng: number
}

const SAN_JACINTO_CENTER: LatLng = { lat: -9.1465, lng: -78.2805 }

const markerIcon = new L.DivIcon({
  className: '',
  html: `<div style="
    width: 32px; height: 32px; position: relative;
    display: flex; align-items: center; justify-content: center;
  ">
    <div style="
      position: absolute; inset: 0;
      background: rgba(249, 115, 22, 0.3); border-radius: 9999px;
      animation: tindivo-pulse 2s ease-in-out infinite;
    "></div>
    <div style="
      position: relative; width: 18px; height: 18px;
      background: #F97316; border: 3px solid #fff; border-radius: 9999px;
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.5);
    "></div>
  </div>
  <style>
    @keyframes tindivo-pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.4); opacity: 0.2; }
    }
  </style>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

function ClickCapture({ onSelect }: { onSelect: (c: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export default function AgendaMapInner({
  value,
  onChange,
  heightPx = 240,
}: {
  value: LatLng | null
  onChange: (coords: LatLng) => void
  heightPx?: number
}) {
  const [marker, setMarker] = useState<LatLng | null>(value)
  const center = useMemo(() => value ?? SAN_JACINTO_CENTER, [value])

  useEffect(() => {
    setMarker(value)
  }, [value])

  const handleSelect = useCallback(
    (coords: LatLng) => {
      setMarker(coords)
      onChange(coords)
    },
    [onChange],
  )

  return (
    <div
      className="w-full rounded-xl overflow-hidden border border-border relative z-0 shadow-xs"
      style={{ height: heightPx, isolation: 'isolate' }}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ClickCapture onSelect={handleSelect} />
        {marker && (
          <Marker
            position={[marker.lat, marker.lng]}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend(e) {
                const pos = (e.target as L.Marker).getLatLng()
                handleSelect({ lat: pos.lat, lng: pos.lng })
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  )
}
