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

export interface ZoneShape {
  id: string
  name: string
  polygon: LatLng[]
  active: boolean
}

/** La cobertura va de fondo, sin relleno y a rayas: es el marco, no una zona. */
const COVERAGE_STYLE = {
  color: '#1f2937',
  weight: 2,
  dashArray: '6 6',
  fill: false,
  interactive: false,
} as const

const FAR_STYLE = {
  color: '#dc2626',
  weight: 2,
  fillColor: '#dc2626',
  fillOpacity: 0.18,
} as const

/** Una zona apagada se ve, pero no se confunde con una que sí cobra. */
const FAR_INACTIVE_STYLE = {
  color: '#9ca3af',
  weight: 1,
  dashArray: '4 4',
  fillColor: '#9ca3af',
  fillOpacity: 0.08,
} as const

function toRing(layer: L.Polygon): LatLng[] {
  const raw = layer.getLatLngs() as L.LatLng[] | L.LatLng[][]
  const ring = (Array.isArray(raw[0]) ? raw[0] : raw) as L.LatLng[]
  return ring.map((ll) => ({ lat: ll.lat, lng: ll.lng }))
}

/**
 * Capa de dibujo de VARIAS zonas.
 *
 * La diferencia con `coverage-polygon-editor-inner`, del que sale este código:
 * aquel hace `group.clearLayers()` en cada `CREATED` para forzar un único
 * polígono de cobertura. Aquí cada trazo es una zona nueva y las anteriores se
 * quedan — que es justamente lo que hacía falta y por lo que no se pudo reusar.
 *
 * El identificador de cada zona viaja en la propia capa (`__zoneId`), así un
 * `EDITED` sabe QUÉ zona se movió. Sin eso, editar una zona obligaría a
 * reescribir las cuatro.
 */
type ZoneLayer = L.Polygon & { __zoneId?: string }

function DrawLayer({
  coverage,
  zones,
  onCreate,
  onEdit,
  onDelete,
}: {
  coverage: LatLng[] | null
  zones: ZoneShape[]
  onCreate: (ring: LatLng[]) => void
  onEdit: (id: string, ring: LatLng[]) => void
  onDelete: (id: string) => void
}) {
  const map = useMap()
  const cbs = useRef({ onCreate, onEdit, onDelete })
  cbs.current = { onCreate, onEdit, onDelete }
  const group = useRef<L.FeatureGroup | null>(null)

  // Montaje único: el control de dibujo y el marco de cobertura.
  useEffect(() => {
    const g = new L.FeatureGroup()
    group.current = g
    map.addLayer(g)

    const control = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, shapeOptions: FAR_STYLE },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: g, remove: true },
    })
    map.addControl(control)

    function onCreated(e: L.LeafletEvent) {
      // NO se añade la capa al grupo: la zona la crea el servidor y vuelve por
      // props. Añadirla aquí la pintaría dos veces hasta la siguiente recarga.
      cbs.current.onCreate(toRing((e as L.DrawEvents.Created).layer as L.Polygon))
    }
    function onEdited(e: L.LeafletEvent) {
      ;(e as L.DrawEvents.Edited).layers.eachLayer((layer) => {
        const z = layer as ZoneLayer
        if (z.__zoneId) cbs.current.onEdit(z.__zoneId, toRing(z))
      })
    }
    function onDeleted(e: L.LeafletEvent) {
      ;(e as L.DrawEvents.Deleted).layers.eachLayer((layer) => {
        const z = layer as ZoneLayer
        if (z.__zoneId) cbs.current.onDelete(z.__zoneId)
      })
    }

    map.on(L.Draw.Event.CREATED, onCreated)
    map.on(L.Draw.Event.EDITED, onEdited)
    map.on(L.Draw.Event.DELETED, onDeleted)

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated)
      map.off(L.Draw.Event.EDITED, onEdited)
      map.off(L.Draw.Event.DELETED, onDeleted)
      map.removeControl(control)
      map.removeLayer(g)
      group.current = null
    }
  }, [map])

  // El marco de cobertura, y el encuadre inicial sobre él.
  const encuadrado = useRef(false)
  useEffect(() => {
    if (!coverage || coverage.length < 3) return
    const ring = L.polygon(
      coverage.map((p) => [p.lat, p.lng] as [number, number]),
      COVERAGE_STYLE,
    )
    ring.addTo(map)
    if (!encuadrado.current) {
      map.fitBounds(ring.getBounds(), { padding: [24, 24] })
      encuadrado.current = true
    }
    return () => {
      map.removeLayer(ring)
    }
  }, [map, coverage])

  // Las zonas se repintan desde las props: el servidor es la fuente de verdad.
  useEffect(() => {
    const g = group.current
    if (!g) return
    g.clearLayers()
    for (const z of zones) {
      if (z.polygon.length < 3) continue
      const poly = L.polygon(
        z.polygon.map((p) => [p.lat, p.lng] as [number, number]),
        z.active ? FAR_STYLE : FAR_INACTIVE_STYLE,
      ) as ZoneLayer
      poly.__zoneId = z.id
      poly.bindTooltip(z.active ? z.name : `${z.name} (apagada)`, { sticky: true })
      g.addLayer(poly)
    }
  }, [zones])

  return null
}

export default function ZonesMapInner({
  coverage,
  zones,
  center,
  onCreate,
  onEdit,
  onDelete,
}: {
  coverage: LatLng[] | null
  zones: ZoneShape[]
  center: LatLng
  onCreate: (ring: LatLng[]) => void
  onEdit: (id: string, ring: LatLng[]) => void
  onDelete: (id: string) => void
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
      <DrawLayer
        coverage={coverage}
        zones={zones}
        onCreate={onCreate}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </MapContainer>
  )
}
