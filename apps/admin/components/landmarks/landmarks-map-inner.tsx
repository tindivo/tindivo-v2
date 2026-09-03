'use client'

import type { MapLandmarkCategory } from '@tindivo/contracts'
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { LANDMARK_CATEGORY_META } from '@/lib/landmark-categories'
import { MAP_TILES, type MapLayerMode, SATELLITE_LABELS_URL } from '@/lib/map-layers'

export interface LatLng {
  lat: number
  lng: number
}

export interface LandmarkPoint {
  id: string
  name: string
  category: MapLandmarkCategory
  lat: number
  lng: number
  active: boolean
}

const COVERAGE_STYLE = {
  color: '#38bdf8',
  weight: 2.5,
  dashArray: '6 6',
  fill: false,
  interactive: false,
} as const

function InvalidateSize() {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 300)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map])
  return null
}

/** El clic vacío propone un punto nuevo; el clic sobre un marcador no llega aquí (para eso `stopPropagation`). */
function ClickToPick({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  })
  return null
}

function FitToCoverage({ coverage }: { coverage: LatLng[] | null }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !coverage || coverage.length < 3) return
    const ring = L.polygon(coverage.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(ring.getBounds(), { padding: [28, 28] })
    done.current = true
  }, [map, coverage])
  return null
}

function FocusPoint({ point }: { point: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (!point) return
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 17), { animate: true, duration: 0.6 })
  }, [point, map])
  return null
}

/**
 * Lienzo COMPARTIDO entre la postal quieta de la página y la hoja a pantalla
 * completa: mismo componente, `interactive` distinto. Igual que
 * `apps/customer` (`map-picker-inner.tsx`) — dos superficies pintando el mismo
 * mapa de formas distintas es exactamente como una empieza a divergir de la
 * otra sin que nadie lo note.
 *
 * `mode` es controlado desde fuera (no vive aquí): la postal lo fija en
 * `'street'` sin necesidad de su propio interruptor, y la hoja es la única que
 * de verdad necesita alternar a satélite para ubicar un punto con precisión.
 */
export default function LandmarksMapInner({
  coverage,
  landmarks,
  center,
  interactive,
  mode,
  pending,
  onPick,
  focusId,
}: {
  coverage: LatLng[] | null
  landmarks: LandmarkPoint[]
  center: LatLng
  interactive: boolean
  mode: MapLayerMode
  pending?: LatLng | null
  onPick?: (p: LatLng) => void
  focusId?: string | null
}) {
  const tiles = MAP_TILES[mode]
  const focusPoint = focusId ? (landmarks.find((l) => l.id === focusId) ?? null) : null

  return (
    <div className={`relative h-full w-full ${interactive ? '' : 'pointer-events-none'}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        zoomControl={false}
        dragging={interactive}
        touchZoom={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          key={mode}
          url={tiles.url}
          attribution={tiles.attribution}
          maxNativeZoom={tiles.maxNativeZoom}
          maxZoom={tiles.maxZoom}
        />
        {mode === 'satellite' && (
          <TileLayer key="sat-labels" url={SATELLITE_LABELS_URL} maxNativeZoom={19} maxZoom={19} />
        )}

        {coverage && coverage.length >= 3 && (
          <Polygon
            positions={coverage.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={COVERAGE_STYLE}
          />
        )}

        {landmarks.map((l) => {
          const meta = LANDMARK_CATEGORY_META[l.category]
          return (
            <CircleMarker
              key={l.id}
              center={[l.lat, l.lng]}
              radius={interactive ? 7 : 5}
              pathOptions={{
                color: '#fff',
                weight: 2,
                fillColor: meta.color,
                fillOpacity: l.active ? 0.95 : 0.35,
              }}
              // Sin esto, el clic sobre un punto existente burbujea hasta el
              // mapa y `ClickToPick` lo lee como "crear uno nuevo aquí".
              eventHandlers={
                interactive ? { click: (e) => L.DomEvent.stopPropagation(e) } : undefined
              }
            >
              {interactive && (
                <Tooltip sticky>{`${l.name}${l.active ? '' : ' (apagado)'}`}</Tooltip>
              )}
            </CircleMarker>
          )
        })}

        {pending && (
          <CircleMarker
            center={[pending.lat, pending.lng]}
            radius={8}
            pathOptions={{ color: '#ea580c', weight: 3, fillColor: '#f97316', fillOpacity: 0.9 }}
          />
        )}

        {interactive && onPick && <ClickToPick onPick={onPick} />}
        <FitToCoverage coverage={coverage} />
        <FocusPoint point={focusPoint ?? null} />
        <InvalidateSize />
      </MapContainer>
    </div>
  )
}
