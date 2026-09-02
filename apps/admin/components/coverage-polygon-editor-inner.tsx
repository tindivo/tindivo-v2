'use client'

import L from 'leaflet'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import { Button, IconButton, Segmented } from '@tindivo/ui'
import { Ico } from '@/components/admin'
import { MAP_TILES, type MapLayerMode, SATELLITE_LABELS_URL } from '@/lib/map-layers'

/**
 * Las dos capas del mapa, en el formato que espera `Segmented`.
 *
 * Vive fuera del componente porque no depende de nada suyo y así no se recrea
 * en cada render. Se declara una vez por fichero y no en un módulo común a
 * propósito: son dos usos, y la regla de la casa es no extraer hasta el tercero.
 */
const CAPAS = [
  { value: 'street' as const, label: 'Calles', icon: <Ico.map className="h-3.5 w-3.5" /> },
  {
    value: 'satellite' as const,
    label: 'Satelital',
    icon: <Ico.satellite className="h-3.5 w-3.5" />,
  },
]

export interface LatLng {
  lat: number
  lng: number
}

const ZONE_STYLE = {
  color: '#f97316',
  weight: 3,
  fillColor: '#f97316',
  fillOpacity: 0.18,
} as const

function toRing(layer: L.Polygon): LatLng[] {
  const raw = layer.getLatLngs() as L.LatLng[] | L.LatLng[][]
  const ring = (Array.isArray(raw[0]) ? raw[0] : raw) as L.LatLng[]
  return ring.map((ll) => ({ lat: ll.lat, lng: ll.lng }))
}

function InvalidateSizeWatcher({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 100)
    const t2 = setTimeout(() => map.invalidateSize(), 300)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [map, isFullscreen])
  return null
}

function DrawLayer({
  initial,
  onChange,
  onGroupRef,
}: {
  initial: LatLng[] | null
  onChange: (ring: LatLng[]) => void
  onGroupRef?: (group: L.FeatureGroup | null) => void
}) {
  const map = useMap()
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const initialRef = useRef(initial)
  const groupRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    const group = new L.FeatureGroup()
    groupRef.current = group
    onGroupRef?.(group)
    map.addLayer(group)

    const start = initialRef.current
    if (start && start.length >= 3) {
      const poly = L.polygon(
        start.map((p) => [p.lat, p.lng] as [number, number]),
        ZONE_STYLE,
      )
      group.addLayer(poly)
      map.fitBounds(poly.getBounds(), { padding: [28, 28] })
    }

    const control = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: ZONE_STYLE,
        },
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
      groupRef.current = null
      onGroupRef?.(null)
    }
  }, [map, onGroupRef])

  return null
}

function MapController({
  center,
  triggerFit,
  group,
}: {
  center: LatLng
  triggerFit: number
  group: L.FeatureGroup | null
}) {
  const map = useMap()

  useEffect(() => {
    if (triggerFit === 0) return
    const layers = group?.getLayers()
    const poly = layers && layers.length > 0 ? (layers[layers.length - 1] as L.Polygon) : null
    if (poly) {
      map.fitBounds(poly.getBounds(), { padding: [32, 32], maxZoom: 17 })
    } else {
      map.setView([center.lat, center.lng], 15, { animate: true })
    }
  }, [triggerFit, map, group, center])

  return null
}

export default function CoveragePolygonEditorInner({
  value,
  center,
  onChange,
  onSave,
  isSaving,
}: {
  value: LatLng[] | null
  center: LatLng
  onChange: (ring: LatLng[]) => void
  onSave?: (ring: LatLng[]) => void
  isSaving?: boolean
}) {
  const [mode, setMode] = useState<MapLayerMode>('street')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentRing, setCurrentRing] = useState<LatLng[] | null>(value)
  const [triggerFit, setTriggerFit] = useState(0)
  const [group, setGroup] = useState<L.FeatureGroup | null>(null)

  const handleRingChange = useCallback(
    (ring: LatLng[]) => {
      setCurrentRing(ring)
      onChange(ring)
    },
    [onChange],
  )

  const handleGroupRef = useCallback((g: L.FeatureGroup | null) => {
    setGroup(g)
  }, [])

  // Tecla Escape para salir de pantalla completa
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  const tiles = MAP_TILES[mode]
  const verticesCount = currentRing?.length ?? 0
  const canSave = verticesCount >= 3

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-[9999] flex flex-col bg-surface'
    : 'relative h-full w-full overflow-hidden'

  return (
    <div className={containerClasses}>
      {/* Barra superior de Pantalla Completa */}
      {isFullscreen && (
        <header className="flex shrink-0 items-center justify-between border-b border-ink/10 bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
              <Ico.mapPin className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-ink">
                  Delimitación de Cobertura (San Jacinto)
                </h2>
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                  {verticesCount} {verticesCount === 1 ? 'vértice' : 'vértices'}
                </span>
              </div>
              <p className="text-[12px] text-ink-muted">
                Traza o ajusta el perímetro general de entrega con máxima precisión visual
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle de capa */}
            <Segmented size="sm" value={mode} onChange={setMode} options={CAPAS} />

            <Button
              size="sm"
              variant="outline"
              onClick={() => setTriggerFit((n) => n + 1)}
              title="Ajustar vista al polígono"
            >
              <Ico.focus className="h-3.5 w-3.5" />
              Centrar
            </Button>

            {onSave && (
              <Button
                size="sm"
                disabled={!canSave || isSaving}
                onClick={() => canSave && currentRing && onSave(currentRing)}
              >
                {isSaving ? 'Guardando...' : 'Guardar cobertura'}
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsFullscreen(false)}
              title="Salir de pantalla completa (Esc)"
            >
              <Ico.minimize className="h-4 w-4" />
              Salir
            </Button>
          </div>
        </header>
      )}

      {/* Contenedor del Mapa */}
      <div className="relative flex-1">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={14}
          zoomControl={false}
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
            <TileLayer
              key="sat-labels"
              url={SATELLITE_LABELS_URL}
              maxNativeZoom={19}
              maxZoom={19}
            />
          )}

          <DrawLayer initial={value} onChange={handleRingChange} onGroupRef={handleGroupRef} />
          <MapController center={center} triggerFit={triggerFit} group={group} />
          <InvalidateSizeWatcher isFullscreen={isFullscreen} />
        </MapContainer>

        {/* Controles flotantes en modo normal */}
        {!isFullscreen && (
          <div className="pointer-events-none absolute inset-0 z-[500] p-3">
            <div className="flex items-start justify-between">
              {/* Selector de modo Satelital / Calles */}
              {/* Mismo envoltorio de cristal que el mapa del cliente
                  (`location-sheet.tsx`): el riel del `Segmented` va dentro, no
                  en lugar de, la superficie translúcida que lo hace legible
                  sobre la foto de satélite. */}
              <div className="pointer-events-auto rounded-[15px] bg-surface/95 p-0.5 shadow-md backdrop-blur-md">
                <Segmented size="sm" value={mode} onChange={setMode} options={CAPAS} />
              </div>

              {/* Botones de acción: Centrar y Pantalla Completa */}
              <div className="pointer-events-auto flex items-center gap-1.5">
                {/* Cristal, no superficie sólida: estos dos flotan sobre la
                    foto de satélite y un fondo opaco taparía justo el techo que
                    se está mirando. Las clases sustituyen la piel del
                    componente; lo que se conserva de él es lo que no se ve —
                    anillo de foco, estado deshabilitado y respuesta al toque. */}
                <IconButton
                  type="button"
                  onClick={() => setTriggerFit((n) => n + 1)}
                  className="h-8 w-8 rounded-xl border border-ink/15 bg-surface/90 text-ink shadow-md backdrop-blur-md hover:bg-surface"
                  title="Ajustar vista al polígono"
                  aria-label="Ajustar vista"
                >
                  <Ico.focus className="h-4 w-4" />
                </IconButton>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullscreen(true)}
                  className="h-8 gap-1.5 rounded-xl border-ink/15 bg-surface/90 px-2.5 font-medium text-[12px] text-ink shadow-md backdrop-blur-md hover:bg-surface"
                  title="Ampliar a pantalla completa para delimitar con precisión"
                >
                  <Ico.maximize className="h-3.5 w-3.5" />
                  <span>Pantalla completa</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Guía contextual flotante en la parte inferior */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2">
          <div className="rounded-full border border-ink/10 bg-surface/90 px-3 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur-md">
            Usa el polígono de la izquierda para dibujar • Arrastra los vértices para ajustar
          </div>
        </div>
      </div>
    </div>
  )
}
