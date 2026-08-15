'use client'

import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Pin ARRASTRABLE. Mismo dibujo que el de solo lectura para que el motorizado
 * reconozca el objeto, con un halo que late para decir "esto se puede mover".
 * Los PNG por defecto de Leaflet se rompen con bundlers, de ahí el SVG inline.
 */
const draggableIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:34px;height:44px">
    <div style="position:absolute;left:5px;top:30px;width:24px;height:10px;border-radius:9999px;
                background:rgba(249,115,22,0.35);animation:tindivo-pin-pulse 2s ease-in-out infinite"></div>
    <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"
         style="position:relative;filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3))">
      <path d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z"
            fill="#F97316" stroke="#fff" stroke-width="2.5"/>
      <circle cx="17" cy="16" r="5" fill="#fff"/>
    </svg>
  </div>
  <style>
    @keyframes tindivo-pin-pulse {
      0%,100% { transform: scale(1);   opacity: .55 }
      50%     { transform: scale(1.5); opacity: .15 }
    }
  </style>`,
  iconSize: [34, 44],
  iconAnchor: [17, 42],
})

/** Tocar el mapa mueve el pin y centra suavemente la vista. */
function TapToMove({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  const map = useMap()
  useMapEvents({
    click(e) {
      map.panTo([e.latlng.lat, e.latlng.lng], { animate: true })
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/** Centra la vista del mapa con animación cada vez que cambian las coordenadas (GPS o clic). */
function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.8,
    })
  }, [lat, lng, map])
  return null
}

/** Invalida el tamaño del contenedor para asegurar que los tiles se pinten bien al abrir el sheet. */
function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}

/** Mapa Leaflet con pin movible. Cargar vía next/dynamic ssr:false. */
export default function MapPickerInner({
  lat,
  lng,
  onPick,
}: {
  lat: number
  lng: number
  onPick: (lat: number, lng: number) => void
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={17}
      zoomControl={false}
      // El scroll del dedo tiene que mover el MAPA, no la hoja que lo contiene.
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <InvalidateSize />
      <Recenter lat={lat} lng={lng} />
      <TapToMove onPick={onPick} />
      <Marker
        position={[lat, lng]}
        icon={draggableIcon}
        draggable
        eventHandlers={{
          dragend(e) {
            const p = (e.target as L.Marker).getLatLng()
            onPick(p.lat, p.lng)
          },
        }}
      />
    </MapContainer>
  )
}
