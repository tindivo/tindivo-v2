'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import { Button } from '@tindivo/ui'
import { fieldSm, Ico } from '@/components/admin'
import { MAP_TILES, type MapLayerMode, SATELLITE_LABELS_URL } from '@/lib/map-layers'

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

/** La cobertura va de fondo, sin relleno y a rayas: es el marco perimetral general. */
const COVERAGE_STYLE = {
  color: '#38bdf8',
  weight: 2.5,
  dashArray: '6 6',
  fill: false,
  interactive: false,
} as const

const FAR_STYLE = {
  color: '#ef4444',
  weight: 2.5,
  fillColor: '#ef4444',
  fillOpacity: 0.22,
} as const

/** Una zona apagada se ve, pero no se confunde con una que sí cobra. */
const FAR_INACTIVE_STYLE = {
  color: '#94a3b8',
  weight: 1.5,
  dashArray: '4 4',
  fillColor: '#94a3b8',
  fillOpacity: 0.1,
} as const

function toRing(layer: L.Polygon): LatLng[] {
  const raw = layer.getLatLngs() as L.LatLng[] | L.LatLng[][]
  const ring = (Array.isArray(raw[0]) ? raw[0] : raw) as L.LatLng[]
  return ring.map((ll) => ({ lat: ll.lat, lng: ll.lng }))
}

type ZoneLayer = L.Polygon & { __zoneId?: string }

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
  coverage,
  zones,
  onCreate,
  onEdit,
  onDelete,
  onGroupRef,
  onCoverageLayerRef,
}: {
  coverage: LatLng[] | null
  zones: ZoneShape[]
  onCreate: (ring: LatLng[]) => void
  onEdit: (id: string, ring: LatLng[]) => void
  onDelete: (id: string) => void
  onGroupRef?: (group: L.FeatureGroup | null) => void
  onCoverageLayerRef?: (layer: L.Polygon | null) => void
}) {
  const map = useMap()
  const cbs = useRef({ onCreate, onEdit, onDelete })
  cbs.current = { onCreate, onEdit, onDelete }
  const group = useRef<L.FeatureGroup | null>(null)

  // Montaje único: el control de dibujo y el FeatureGroup
  useEffect(() => {
    const g = new L.FeatureGroup()
    group.current = g
    onGroupRef?.(g)
    map.addLayer(g)

    const control = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: FAR_STYLE,
        },
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
      onGroupRef?.(null)
    }
  }, [map, onGroupRef])

  // El marco de cobertura, y el encuadre inicial sobre él.
  const encuadrado = useRef(false)
  useEffect(() => {
    if (!coverage || coverage.length < 3) return
    const ring = L.polygon(
      coverage.map((p) => [p.lat, p.lng] as [number, number]),
      COVERAGE_STYLE,
    )
    ring.addTo(map)
    onCoverageLayerRef?.(ring)
    if (!encuadrado.current) {
      map.fitBounds(ring.getBounds(), { padding: [28, 28] })
      encuadrado.current = true
    }
    return () => {
      map.removeLayer(ring)
      onCoverageLayerRef?.(null)
    }
  }, [map, coverage, onCoverageLayerRef])

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
      poly.bindTooltip(z.active ? `${z.name} (Tarifa lejana)` : `${z.name} (Apagada)`, {
        sticky: true,
      })
      g.addLayer(poly)
    }
  }, [zones])

  return null
}

function MapController({
  center,
  triggerFit,
  group,
  coverageLayer,
  focusZoneId,
}: {
  center: LatLng
  triggerFit: number
  group: L.FeatureGroup | null
  coverageLayer: L.Polygon | null
  focusZoneId: string | null
}) {
  const map = useMap()

  // Recentrar cobertura o grupo
  useEffect(() => {
    if (triggerFit === 0) return
    if (coverageLayer) {
      map.fitBounds(coverageLayer.getBounds(), { padding: [32, 32], maxZoom: 17 })
    } else if (group && group.getLayers().length > 0) {
      map.fitBounds(group.getBounds(), { padding: [32, 32], maxZoom: 17 })
    } else {
      map.setView([center.lat, center.lng], 15, { animate: true })
    }
  }, [triggerFit, map, coverageLayer, group, center])

  // Enfocar una zona puntual
  useEffect(() => {
    if (!focusZoneId || !group) return
    group.eachLayer((layer) => {
      const z = layer as ZoneLayer
      if (z.__zoneId === focusZoneId) {
        map.fitBounds(z.getBounds(), { padding: [40, 40], maxZoom: 17 })
      }
    })
  }, [focusZoneId, group, map])

  return null
}

export default function ZonesMapInner({
  coverage,
  zones,
  center,
  onCreate,
  onEdit,
  onDelete,
  onRename,
  onToggle,
  busy,
}: {
  coverage: LatLng[] | null
  zones: ZoneShape[]
  center: LatLng
  onCreate: (ring: LatLng[]) => void
  onEdit: (id: string, ring: LatLng[]) => void
  onDelete: (id: string) => void
  onRename?: (id: string, name: string) => void
  onToggle?: (id: string) => void
  busy?: boolean
}) {
  const [mode, setMode] = useState<MapLayerMode>('street')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [triggerFit, setTriggerFit] = useState(0)
  const [focusZoneId, setFocusZoneId] = useState<string | null>(null)
  const [group, setGroup] = useState<L.FeatureGroup | null>(null)
  const [coverageLayer, setCoverageLayer] = useState<L.Polygon | null>(null)

  // Salir con tecla Escape
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  const tiles = MAP_TILES[mode]
  const activasCount = zones.filter((z) => z.active).length

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-[9999] flex flex-col bg-surface'
    : 'relative h-full w-full overflow-hidden'

  return (
    <div className={containerClasses}>
      {/* Barra superior en modo Pantalla Completa */}
      {isFullscreen && (
        <header className="flex shrink-0 items-center justify-between border-b border-ink/10 bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
              <Ico.store className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[14px] font-semibold text-ink">
                  Delimitación de Zonas de Cobro
                </h2>
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700">
                  {activasCount} de {zones.length} activas
                </span>
              </div>
              <p className="text-[12px] text-ink-muted">
                Trazo de zonas con tarifa lejana sobre la cobertura general de San Jacinto
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle de capa */}
            <div className="flex rounded-lg border border-ink/10 bg-ink/[0.04] p-0.5">
              <button
                type="button"
                onClick={() => setMode('street')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  mode === 'street'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Ico.map className="h-3.5 w-3.5" />
                Calles
              </button>
              <button
                type="button"
                onClick={() => setMode('satellite')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  mode === 'satellite'
                    ? 'bg-surface text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Ico.satellite className="h-3.5 w-3.5" />
                Satelital
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setTriggerFit((n) => n + 1)}
              title="Ajustar vista a la cobertura"
            >
              <Ico.focus className="h-3.5 w-3.5" />
              Centrar cobertura
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSidebar((s) => !s)}
              title="Mostrar u ocultar lista de zonas"
            >
              <Ico.layers className="h-3.5 w-3.5" />
              {showSidebar ? 'Ocultar panel' : `Zonas (${zones.length})`}
            </Button>

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

      {/* Contenedor del Mapa y Panel Lateral Flotante */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative h-full w-full flex-1">
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

            <DrawLayer
              coverage={coverage}
              zones={zones}
              onCreate={onCreate}
              onEdit={onEdit}
              onDelete={onDelete}
              onGroupRef={setGroup}
              onCoverageLayerRef={setCoverageLayer}
            />
            <MapController
              center={center}
              triggerFit={triggerFit}
              group={group}
              coverageLayer={coverageLayer}
              focusZoneId={focusZoneId}
            />
            <InvalidateSizeWatcher isFullscreen={isFullscreen} />
          </MapContainer>

          {/* Controles flotantes en modo normal */}
          {!isFullscreen && (
            <div className="pointer-events-none absolute inset-0 z-[500] p-3">
              <div className="flex items-start justify-between">
                {/* Toggle Calles / Satelital */}
                <div className="pointer-events-auto flex rounded-xl border border-ink/15 bg-surface/90 p-1 shadow-md backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setMode('street')}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
                      mode === 'street'
                        ? 'bg-ink text-surface shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Ico.map className="h-3.5 w-3.5" />
                    Calles
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('satellite')}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
                      mode === 'satellite'
                        ? 'bg-ink text-surface shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Ico.satellite className="h-3.5 w-3.5" />
                    Satelital
                  </button>
                </div>

                {/* Botones de Centrar y Pantalla Completa */}
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTriggerFit((n) => n + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-ink/15 bg-surface/90 text-ink shadow-md backdrop-blur-md transition hover:bg-surface active:scale-95"
                    title="Ajustar vista a la cobertura"
                    aria-label="Ajustar vista"
                  >
                    <Ico.focus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-ink/15 bg-surface/90 px-2.5 py-1.5 text-[12px] font-medium text-ink shadow-md backdrop-blur-md transition hover:bg-surface active:scale-95"
                    title="Ampliar a pantalla completa para delimitar con precisión"
                  >
                    <Ico.maximize className="h-3.5 w-3.5" />
                    <span>Pantalla completa</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Leyenda flotante */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-surface/90 px-3 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur-md">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-4 rounded-xs border border-dashed border-[#38bdf8]" />
                Límite Cobertura
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-xs bg-[#ef4444]/60" />
                Zona Lejana
              </span>
            </div>
          </div>
        </div>

        {/* Panel Lateral de Zonas en Pantalla Completa */}
        {isFullscreen && showSidebar && (
          <aside className="z-[500] w-80 shrink-0 border-l border-ink/10 bg-surface/95 p-4 shadow-xl backdrop-blur-md overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <p className="t-display text-[14px] text-ink font-semibold">Zonas lejanas</p>
              <span className="text-[12px] text-ink-muted">{activasCount} activas</span>
            </div>

            {zones.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink/15 p-4 text-center text-[13px] text-ink-muted">
                No hay zonas lejanas dibujadas. Usa la herramienta de polígono a la izquierda para
                trazar la primera.
              </div>
            ) : (
              <ul className="space-y-2">
                {zones.map((z) => (
                  <ZoneFullscreenItem
                    key={z.id}
                    zone={z}
                    busy={busy ?? false}
                    onFocus={() => setFocusZoneId(z.id)}
                    onRename={(name) => onRename?.(z.id, name)}
                    onToggle={() => onToggle?.(z.id)}
                    onDelete={() => onDelete(z.id)}
                  />
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-xl bg-ink/[0.03] p-3 text-[11px] text-ink-muted">
              💡 Para ajustar vértices, usa el lápiz de edición de Leaflet. Se guarda
              automáticamente al confirmar.
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

function ZoneFullscreenItem({
  zone,
  busy,
  onFocus,
  onRename,
  onToggle,
  onDelete,
}: {
  zone: ZoneShape
  busy: boolean
  onFocus: () => void
  onRename: (name: string) => void
  onToggle: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(zone.name)
  const cambiado = name.trim() !== zone.name && name.trim().length > 0

  return (
    <li className="rounded-xl border border-ink/[0.08] bg-surface p-2.5 shadow-2xs">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            zone.active ? 'bg-red-500' : 'bg-ink/25'
          }`}
          aria-hidden
        />
        <input
          className={`${fieldSm} min-w-0 flex-1 text-[13px]`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => cambiado && onRename(name.trim())}
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-ink-muted">
        <button
          type="button"
          onClick={onFocus}
          className="flex items-center gap-1 hover:text-ink transition"
          title="Centrar en el mapa"
        >
          <Ico.focus className="h-3 w-3" />
          <span>{zone.polygon.length} vértices</span>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="text-ink font-medium underline-offset-2 hover:underline"
        >
          {zone.active ? 'Apagar' : 'Encender'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="text-danger p-1 hover:opacity-80 transition"
          aria-label={`Borrar ${zone.name}`}
          title="Borrar zona"
        >
          <Ico.trash className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  )
}
