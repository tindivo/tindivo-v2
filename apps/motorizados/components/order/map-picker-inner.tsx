'use client'

import { type RefObject, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * Escucha los eventos táctiles/ratón directamente en el contenedor del mapa
 * para distinguir un arrastre manual del usuario de un movimiento programático (FlyTo).
 */
function GestureWatch({ gestureRef }: { gestureRef: RefObject<boolean> }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const mark = () => {
      gestureRef.current = true
    }
    el.addEventListener('touchstart', mark, { passive: true })
    el.addEventListener('mousedown', mark, { passive: true })
    el.addEventListener('wheel', mark, { passive: true })
    return () => {
      el.removeEventListener('touchstart', mark)
      el.removeEventListener('mousedown', mark)
      el.removeEventListener('wheel', mark)
    }
  }, [map, gestureRef])
  return null
}

/**
 * Escucha el movimiento del mapa y actualiza la coordenada central.
 * El pin se mantiene clavado en el centro y lo que se desplaza es el mapa.
 */
function CenterTracker({
  gestureRef,
  onSettle,
  onMovingChange,
}: {
  gestureRef: RefObject<boolean>
  onSettle: (lat: number, lng: number, byUser: boolean) => void
  onMovingChange: (moving: boolean) => void
}) {
  const map = useMapEvents({
    movestart: () => onMovingChange(true),
    moveend: () => {
      onMovingChange(false)
      const c = map.getCenter()
      const byUser = gestureRef.current
      gestureRef.current = false
      onSettle(c.lat, c.lng, byUser)
    },
  })
  return null
}

/** Vuela a la posición indicada si cambian las coordenadas externamente (GPS o botón). */
function FlyTo({
  lat,
  lng,
  gestureRef,
}: {
  lat: number
  lng: number
  gestureRef: RefObject<boolean>
}) {
  const map = useMap()
  const last = useRef(`${lat.toFixed(5)},${lng.toFixed(5)}`)

  useEffect(() => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
    const current = map.getCenter()
    const currentKey = `${current.lat.toFixed(5)},${current.lng.toFixed(5)}`

    // Solo vuela si la coordenada cambió externamente (ej. fix de GPS) y no por arrastre del mapa
    if (key !== last.current && key !== currentKey) {
      last.current = key
      gestureRef.current = false
      map.flyTo([lat, lng], Math.max(map.getZoom(), 17), {
        animate: true,
        duration: 0.8,
      })
    }
  }, [lat, lng, map, gestureRef])

  return null
}

/** Invalida el tamaño del contenedor para asegurar que los tiles se pinten bien al abrir el sheet. */
function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 150)
    const t2 = setTimeout(() => map.invalidateSize(), 400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map])
  return null
}

/**
 * Pin fijo al centro del mapa con elevación por hardware (translate3d)
 * para máxima compatibilidad y rendimiento en iOS y Android.
 */
function CenterPin({ moving }: { moving: boolean }) {
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 z-[700]"
      style={{
        transform: 'translate3d(-50%, -50%, 0)',
        WebkitTransform: 'translate3d(-50%, -50%, 0)',
      }}
    >
      {/* Sombra en el suelo */}
      <span
        className="absolute rounded-[50%] bg-ink/35 transition-all duration-200 ease-out"
        style={{
          width: moving ? 18 : 12,
          height: moving ? 7 : 5,
          left: '50%',
          top: '50%',
          transform: 'translate3d(-50%, -50%, 0)',
          WebkitTransform: 'translate3d(-50%, -50%, 0)',
        }}
      />
      {/* Pin con gota */}
      <svg
        width="34"
        height="44"
        viewBox="0 0 34 44"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="absolute transition-transform duration-200 ease-out"
        style={{
          left: '50%',
          bottom: 0,
          transform: `translate3d(-50%, ${moving ? -8 : 0}px, 0)`,
          WebkitTransform: `translate3d(-50%, ${moving ? -8 : 0}px, 0)`,
          willChange: 'transform',
        }}
      >
        <title>Punto de entrega</title>
        <path
          d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z"
          fill="#f97316"
          stroke="#ffffff"
          strokeWidth="2.5"
        />
        <circle cx="17" cy="16" r="5" fill="#ffffff" />
      </svg>
    </div>
  )
}

/** Mapa Leaflet con pin fijo al centro y arrastre de mapa. Cargar vía next/dynamic ssr:false. */
export default function MapPickerInner({
  lat,
  lng,
  onPick,
}: {
  lat: number
  lng: number
  onPick: (lat: number, lng: number, byUser: boolean) => void
}) {
  const gestureRef = useRef(false)
  const [moving, setMoving] = useState(false)

  return (
    <div className="relative h-full w-full">
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
        <GestureWatch gestureRef={gestureRef} />
        <FlyTo lat={lat} lng={lng} gestureRef={gestureRef} />
        <CenterTracker gestureRef={gestureRef} onSettle={onPick} onMovingChange={setMoving} />
      </MapContainer>
      <CenterPin moving={moving} />
    </div>
  )
}
