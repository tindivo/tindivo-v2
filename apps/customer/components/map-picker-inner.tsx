'use client'

import type { LatLngBoundsExpression } from 'leaflet'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { Circle, MapContainer, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface LatLng {
  lat: number
  lng: number
}

export type MapMode = 'street' | 'satellite'

export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

const ZONE_STYLE = {
  color: 'var(--color-brand)',
  weight: 2,
  fillColor: 'var(--color-brand)',
  fillOpacity: 0.1,
} as const

/**
 * Dos fondos para el mismo mapa, y los dos sirven para algo distinto.
 *
 * OSM tiene San Jacinto mejor mapeado de lo que uno esperaría —calles con
 * nombre, la Posta Médica—, así que la vista de calles orienta bien y es la que
 * abre por defecto. Lo que no hace es decirte CUÁL es tu casa: eso solo lo
 * resuelve la foto, donde la gente reconoce su propio techo.
 */
const TILES: Record<MapMode, { url: string; attribution: string; maxNativeZoom: number }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imágenes &copy; Esri',
    /**
     * 17 Y NO MÁS. Medido contra el servicio, no supuesto: sobre San Jacinto,
     * World_Imagery devuelve foto de verdad hasta z17 (~21 KB por tile) y a
     * partir de z18 el MISMO placeholder de 2521 bytes que dice «Map data not
     * yet available». Lo sirve con HTTP 200, así que Leaflet lo da por bueno y
     * lo pinta: por eso acercarse llenaba la pantalla de ese texto en vez de
     * quedarse en la última foto buena. El servicio «Clarity» de Esri topa en
     * el mismo z17 (z18 ya es 404), o sea que no hay más resolución gratuita
     * disponible en la zona.
     *
     * Con `maxNativeZoom` en 17, Leaflet deja de pedir tiles que no existen y
     * escala el z17 para z18/z19. Se ve más blando al acercar, pero se sigue
     * viendo el techo — que es de lo que va esta capa.
     */
    maxNativeZoom: 17,
  },
}

const SATELLITE_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

/**
 * Marca que el gesto lo hizo una persona.
 *
 * `moveend` no distingue un arrastre del dedo de un `flyTo` del botón de GPS, y
 * la diferencia importa: si el punto viene del GPS la precisión medida sigue
 * siendo válida, y si lo movió el dedo ya no. Leaflet no lo dice, así que se
 * escucha el evento crudo del contenedor. `FlyTo` limpia la marca antes de
 * volar, de modo que un movimiento programático nunca se cuela como manual.
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
 * El pin NO se arrastra: está clavado en el centro del lienzo y lo que se mueve
 * es el mapa. La coordenada elegida es siempre `map.getCenter()`, y se reporta
 * al posarse (`moveend`), no en cada frame.
 */
function CenterTracker({
  gestureRef,
  onSettle,
  onMovingChange,
}: {
  gestureRef: RefObject<boolean>
  onSettle: (c: LatLng, byUser: boolean) => void
  onMovingChange: (moving: boolean) => void
}) {
  const map = useMapEvents({
    movestart: () => onMovingChange(true),
    moveend: () => {
      onMovingChange(false)
      const c = map.getCenter()
      const byUser = gestureRef.current
      gestureRef.current = false
      onSettle({ lat: c.lat, lng: c.lng }, byUser)
    },
  })
  return null
}

/** Vuela al objetivo cuando cambia el token (botón de GPS). */
function FlyTo({
  target,
  token,
  gestureRef,
}: {
  target: LatLng
  token: number
  gestureRef: RefObject<boolean>
}) {
  const map = useMap()
  const last = useRef(token)
  useEffect(() => {
    if (token === last.current) return
    last.current = token
    gestureRef.current = false
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.9,
    })
  }, [token, target, map, gestureRef])
  return null
}

/** Solo para la vista previa (no interactiva): sigue al punto elegido sin animar. */
function Follow({ center }: { center: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false })
  }, [center, map])
  return null
}

/**
 * Leaflet mide el contenedor al montar. Dentro de un bottom-sheet que todavía
 * está animando, esa medida sale mal y los tiles quedan a medio pintar.
 */
function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 150)
    const t2 = setTimeout(() => map.invalidateSize(), 450)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map])
  return null
}

/**
 * El pin, dibujado FUERA de Leaflet.
 *
 * Va en el wrapper y no como `Marker` a propósito: un marcador vive en el panel
 * del mapa y se desplaza con él, y aquí lo que tiene que quedarse absolutamente
 * quieto es el pin. La sombra se queda clavada en el punto exacto mientras la
 * gota despega: eso es lo que comunica que el mapa se mueve por debajo.
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

/**
 * Lienzo de mapa con el pin fijo al centro. Cargar SOLO vía `next/dynamic` con
 * `ssr: false` (Leaflet toca `window` al importarse).
 *
 * `interactive: false` deja el lienzo inerte: es lo que permite incrustar la
 * vista previa dentro de un formulario con scroll sin que el mapa se coma el
 * gesto del dedo.
 */
export default function MapCanvas({
  center,
  interactive,
  mode,
  polygon,
  circle,
  bounds,
  flyTarget,
  flyToken = 0,
  onSettle,
  onMovingChange,
  zoom = 17,
  minZoom = 14,
  showPin = true,
}: {
  center: LatLng
  interactive: boolean
  mode: MapMode
  polygon: LatLng[] | null
  circle: { center: LatLng; radiusKm: number } | null
  bounds: MapBounds | null
  flyTarget?: LatLng
  flyToken?: number
  onSettle?: (c: LatLng, byUser: boolean) => void
  onMovingChange?: (moving: boolean) => void
  zoom?: number
  minZoom?: number
  /**
   * Sin punto elegido NO se pinta el pin. Un pin naranja sobre el centro del
   * pueblo se lee como «ya está», y ese malentendido es justo el que hacía que
   * la gente guardara la plaza como su casa.
   */
  showPin?: boolean
}) {
  const gestureRef = useRef(false)
  const [moving, setMoving] = useState(false)
  const tiles = TILES[mode]

  const maxBounds: LatLngBoundsExpression | undefined = bounds
    ? [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ]
    : undefined

  function handleMoving(m: boolean) {
    setMoving(m)
    onMovingChange?.(m)
  }

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={19}
        zoomControl={false}
        attributionControl={interactive}
        // `maxBounds` + viscosidad 1 hace de pared dura: el mapa no deja salir
        // del pueblo. Antes se podía arrastrar el pin hasta Lima y lo único que
        // pasaba era un "fuera de la zona" sin salida.
        maxBounds={maxBounds}
        maxBoundsViscosity={1}
        dragging={interactive}
        touchZoom={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        className={`h-full w-full ${interactive ? '' : 'pointer-events-none'}`}
      >
        <TileLayer
          key={mode}
          url={tiles.url}
          attribution={tiles.attribution}
          maxNativeZoom={tiles.maxNativeZoom}
          maxZoom={19}
        />
        {mode === 'satellite' && (
          // La capa de referencia sí responde hasta z19 (tiles de 872 bytes:
          // transparentes donde no hay nada que rotular), así que no necesita
          // el tope de la imagen.
          <TileLayer key="sat-labels" url={SATELLITE_LABELS} maxNativeZoom={19} maxZoom={19} />
        )}
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
        <InvalidateSize />
        {interactive ? (
          <>
            <GestureWatch gestureRef={gestureRef} />
            <CenterTracker
              gestureRef={gestureRef}
              onSettle={(c, byUser) => onSettle?.(c, byUser)}
              onMovingChange={handleMoving}
            />
            {flyTarget && <FlyTo target={flyTarget} token={flyToken} gestureRef={gestureRef} />}
          </>
        ) : (
          <Follow center={center} />
        )}
      </MapContainer>
      {showPin && <CenterPin moving={moving} />}
    </div>
  )
}
