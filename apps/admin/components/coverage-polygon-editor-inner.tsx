'use client'

import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'

export interface LatLng {
  lat: number
  lng: number
}

const ZONE_STYLE = {
  color: '#F97316',
  weight: 2,
  fillColor: '#F97316',
  fillOpacity: 0.12,
} as const

/** Extrae el anillo exterior {lat,lng} de un polígono Leaflet (normaliza el anidamiento). */
function toRing(layer: L.Polygon): LatLng[] {
  const raw = layer.getLatLngs() as L.LatLng[] | L.LatLng[][]
  const ring = (Array.isArray(raw[0]) ? raw[0] : raw) as L.LatLng[]
  return ring.map((ll) => ({ lat: ll.lat, lng: ll.lng }))
}

/**
 * Monta el control de Leaflet-draw (solo polígono, editar/borrar) sobre un FeatureGroup.
 * Mantiene un único polígono y reporta el anillo en cada create/edit/delete. El polígono
 * inicial se lee una vez al montar (el subárbol se remonta al recargar los settings).
 */
function DrawLayer({
  initial,
  onChange,
}: {
  initial: LatLng[] | null
  onChange: (ring: LatLng[]) => void
}) {
  const map = useMap()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialRef = useRef(initial)

  useEffect(() => {
    const group = new L.FeatureGroup()
    map.addLayer(group)

    const start = initialRef.current
    if (start && start.length >= 3) {
      const poly = L.polygon(
        start.map((p) => [p.lat, p.lng] as [number, number]),
        ZONE_STYLE,
      )
      group.addLayer(poly)
      map.fitBounds(poly.getBounds(), { padding: [20, 20] })
    }

    const control = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, shapeOptions: ZONE_STYLE },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: group, remove: true },
    })
    map.addControl(control)

    function emit() {
      const layers = group.getLayers()
      const poly = layers[layers.length - 1] as L.Polygon | undefined
      onChangeRef.current(poly ? toRing(poly) : [])
    }

    function onCreated(e: L.LeafletEvent) {
      // Un solo polígono de cobertura: descartar el anterior antes de agregar el nuevo.
      group.clearLayers()
      group.addLayer((e as L.DrawEvents.Created).layer)
      emit()
    }

    map.on(L.Draw.Event.CREATED, onCreated)
    map.on(L.Draw.Event.EDITED, emit)
    map.on(L.Draw.Event.DELETED, emit)

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated)
      map.off(L.Draw.Event.EDITED, emit)
      map.off(L.Draw.Event.DELETED, emit)
      map.removeControl(control)
      map.removeLayer(group)
    }
  }, [map])

  return null
}

export default function CoveragePolygonEditorInner({
  value,
  center,
  onChange,
}: {
  value: LatLng[] | null
  center: LatLng
  onChange: (ring: LatLng[]) => void
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      style={{ width: '100%', height: '100%' }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <DrawLayer initial={value} onChange={onChange} />
    </MapContainer>
  )
}
