'use client'

import { type Landmark, OSM_TILES, type RoutePin } from '@tindivo/map'
import { FitBounds, LandmarkLayer, RouteLineLayer, RoutePinLayer } from '@tindivo/map/leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getLandmarks } from '@/lib/landmarks'

function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t = setTimeout(() => map.invalidateSize(), 200)
    return () => clearTimeout(t)
  }, [map])
  return null
}

export interface MapReadonlyProps {
  lat: number
  lng: number
  /** El nombre en el globo sobre el pin. */
  label?: string | null
  /** Color del pin: naranja = recojo / la comida, oscuro = destino. */
  variant?: 'origin' | 'destination'
  /**
   * El otro punto del viaje (Entregas: A ↔ B). Se pinta con su globo y una
   * línea discontinua, y el mapa encuadra los dos — como en el seguimiento del
   * cliente.
   */
  other?: { lat: number; lng: number; label?: string | null; variant: 'origin' | 'destination' }
}

/**
 * Mapa de solo lectura del motorizado, con las MISMAS piezas que el del
 * cliente (`@tindivo/map`): el pin con su globo, el otro extremo del viaje si
 * lo hay, y las referencias del pueblo. Cargar vía next/dynamic ssr:false.
 */
export default function MapReadonlyInner({
  lat,
  lng,
  label,
  variant = 'origin',
  other,
}: MapReadonlyProps) {
  const [landmarks, setLandmarks] = useState<Landmark[]>([])
  useEffect(() => {
    let on = true
    void getLandmarks().then((l) => {
      if (on) setLandmarks(l)
    })
    return () => {
      on = false
    }
  }, [])

  const pins = useMemo<RoutePin[]>(() => {
    const main: RoutePin = {
      id: 'main',
      coordinates: { lat, lng },
      label: label ?? undefined,
      variant,
    }
    if (!other) return [main]
    return [
      main,
      {
        id: 'other',
        coordinates: { lat: other.lat, lng: other.lng },
        label: other.label ?? undefined,
        variant: other.variant,
      },
    ]
  }, [lat, lng, label, variant, other])

  // `FitBounds` encuadra cuando cambia el token: uno nuevo solo si cambian
  // las coordenadas (no por un render cualquiera de la ficha).
  const coordsKey = pins.map((p) => `${p.coordinates.lat},${p.coordinates.lng}`).join('|')
  const tokens = useRef({ key: '', n: 0 })
  if (tokens.current.key !== coordsKey) tokens.current = { key: coordsKey, n: tokens.current.n + 1 }
  const fit = useMemo(
    () => ({ coordinates: pins.map((p) => p.coordinates), token: tokens.current.n }),
    [coordsKey],
  )

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      zoomControl={false}
      // Misma razón que en el mapa del cliente: el zoom animado crea y rasteriza
      // nodos en cada paso, y en un celular eso se nota como tirones.
      zoomAnimation={false}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer
        url={OSM_TILES.url}
        attribution={OSM_TILES.attribution}
        maxNativeZoom={19}
        maxZoom={19}
        updateWhenZooming={false}
      />
      <InvalidateSize />
      <LandmarkLayer landmarks={landmarks} showLabels interactivo pines={pins} />
      {other && <RouteLineLayer from={{ lat, lng }} to={{ lat: other.lat, lng: other.lng }} />}
      <RoutePinLayer pins={pins} />
      <FitBounds coordinates={fit.coordinates} token={fit.token} />
    </MapContainer>
  )
}
