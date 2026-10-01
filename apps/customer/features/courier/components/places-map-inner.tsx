'use client'

import { type Landmark, type RoutePin, STREET_TILES } from '@tindivo/map'
import { LandmarkLayer, RoutePinLayer } from '@tindivo/map/leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { PlacePeekCard } from './place-peek-card'

/** Hasta dónde cuenta un toque como «sobre» una chapa (px). La chapa mide 22. */
const TAP_RADIUS_PX = 28

/**
 * Las chapas de `LandmarkLayer` no capturan el puntero a propósito (en el mapa
 * de elegir punto, arrastrar es el gesto entero). Aquí sí hay que poder
 * tocarlas, así que el toque se resuelve en el mapa: el lugar más cercano al
 * dedo dentro de `TAP_RADIUS_PX`, o nada.
 */
function TapToSelect({
  places,
  onSelect,
}: {
  places: readonly Landmark[]
  onSelect: (place: Landmark | null) => void
}) {
  const map = useMapEvents({
    click: (e) => {
      let best: Landmark | null = null
      let bestD = TAP_RADIUS_PX ** 2
      for (const p of places) {
        const pt = map.latLngToContainerPoint([p.lat, p.lng])
        const d = (pt.x - e.containerPoint.x) ** 2 + (pt.y - e.containerPoint.y) ** 2
        if (d <= bestD) {
          best = p
          bestD = d
        }
      }
      onSelect(best)
    },
  })
  return null
}

export interface PlacesMapProps {
  places: Landmark[]
  bounds: { south: number; west: number; north: number; east: number }
  center: { lat: number; lng: number }
}

/**
 * El mapa de `/entregas`: las referencias del pueblo (`map_landmarks`) con las
 * MISMAS piezas que el mapa del cliente al elegir su punto y que el del
 * motorizado (`@tindivo/map`). El lugar elegido se marca con la gota naranja
 * de recojo, que es lo que va a ser si toca «Recoger aquí».
 */
export default function PlacesMapInner({ places, bounds, center }: PlacesMapProps) {
  const [selected, setSelected] = useState<Landmark | null>(null)

  const maxBounds: LatLngBoundsExpression = useMemo(
    () => [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ],
    [bounds],
  )

  const pins = useMemo<RoutePin[]>(
    () =>
      selected
        ? [
            {
              id: selected.id,
              coordinates: { lat: selected.lat, lng: selected.lng },
              label: selected.name,
              variant: 'origin',
            },
          ]
        : [],
    [selected],
  )

  return (
    <>
      {/* `isolation` encierra los z-index 400 de Leaflet en este div. La ficha
          va FUERA, como hermana: dentro, esos 400 la tapaban (la ficha existía
          en el DOM pero no se veía). */}
      <div className="relative h-full w-full" style={{ isolation: 'isolate' }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={16}
          minZoom={14}
          maxZoom={19}
          zoomControl={false}
          maxBounds={maxBounds}
          maxBoundsViscosity={1}
          className="h-full w-full"
        >
          <TileLayer
            url={STREET_TILES.url}
            attribution={STREET_TILES.attribution}
            subdomains={STREET_TILES.subdomains ?? 'abc'}
            maxNativeZoom={19}
            maxZoom={19}
          />
          <LandmarkLayer landmarks={places} showLabels interactivo pines={pins} />
          <RoutePinLayer pins={pins} />
          <TapToSelect places={places} onSelect={setSelected} />
        </MapContainer>
      </div>

      {selected && <PlacePeekCard place={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
