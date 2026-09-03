'use client'

import L from 'leaflet'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Button, Segmented } from '@tindivo/ui'
import { Ico } from '@/components/admin'
import { MAP_TILES, type MapLayerMode, SATELLITE_LABELS_URL } from '@/lib/map-layers'

export interface LatLng {
  lat: number
  lng: number
}

const SAN_JACINTO_CENTER: LatLng = { lat: -9.1465, lng: -78.2805 }

const CAPAS = [
  { value: 'street' as const, label: 'Calles', icon: <Ico.map className="h-3.5 w-3.5" /> },
  {
    value: 'satellite' as const,
    label: 'Satelital',
    icon: <Ico.satellite className="h-3.5 w-3.5" />,
  },
]

const storePinIcon = new L.DivIcon({
  className: '',
  html: `<div style="
    width: 38px; height: 38px; position: relative;
    display: flex; align-items: center; justify-content: center;
  ">
    <div style="
      position: absolute; inset: 0;
      background: rgba(249, 115, 22, 0.28); border-radius: 9999px;
      animation: tindivo-pulse 2s ease-in-out infinite;
    "></div>
    <div style="
      position: relative; width: 26px; height: 26px;
      background: #ea580c; border: 3px solid #ffffff; border-radius: 9999px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      color: #ffffff; font-size: 13px;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
    </div>
  </div>
  <style>
    @keyframes tindivo-pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.35); opacity: 0.15; }
    }
  </style>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
})

function ClickCapture({ onSelect }: { onSelect: (c: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onSelect({
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6)),
      })
    },
  })
  return null
}

function PanTo({ target }: { target: LatLng | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) {
      map.panTo([target.lat, target.lng], { animate: true })
    }
  }, [target, map])
  return null
}

export default function BusinessLocationMapInner({
  value,
  onChange,
  heightPx = 340,
  businessName,
}: {
  value: LatLng | null
  onChange: (coords: LatLng | null) => void
  heightPx?: number
  businessName?: string
}) {
  const [layer, setLayer] = useState<MapLayerMode>('street')
  const [panTarget, setPanTarget] = useState<LatLng | null>(null)

  const center = useMemo(() => value ?? SAN_JACINTO_CENTER, [value])
  const tile = MAP_TILES[layer]

  const handleSelect = useCallback(
    (coords: LatLng) => {
      onChange({
        lat: Number(coords.lat.toFixed(6)),
        lng: Number(coords.lng.toFixed(6)),
      })
    },
    [onChange],
  )

  const centerSanJacinto = () => {
    setPanTarget({ ...SAN_JACINTO_CENTER })
    handleSelect(SAN_JACINTO_CENTER)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Segmented options={CAPAS} value={layer} onChange={(v) => setLayer(v as MapLayerMode)} />
          <Button size="sm" variant="outline" onClick={centerSanJacinto}>
            <Ico.focus className="h-4 w-4 mr-1 text-ink-muted" />
            San Jacinto
          </Button>
        </div>
        {value && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:bg-danger/10"
            onClick={() => onChange(null)}
          >
            <Ico.trash className="h-3.5 w-3.5 mr-1" />
            Quitar ubicación
          </Button>
        )}
      </div>

      <div
        className="relative z-0 w-full overflow-hidden rounded-2xl border border-ink/10 shadow-xs"
        style={{ height: heightPx, isolation: 'isolate' }}
      >
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={16}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            key={layer}
            attribution={tile.attribution}
            url={tile.url}
            maxNativeZoom={tile.maxNativeZoom}
            maxZoom={tile.maxZoom}
          />
          {layer === 'satellite' && (
            <TileLayer
              attribution="Labels &copy; Esri"
              url={SATELLITE_LABELS_URL}
              maxNativeZoom={17}
              maxZoom={19}
            />
          )}
          <ClickCapture onSelect={handleSelect} />
          <PanTo target={panTarget} />

          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={storePinIcon}
              draggable
              eventHandlers={{
                dragend(e) {
                  const pos = (e.target as L.Marker).getLatLng()
                  handleSelect({ lat: pos.lat, lng: pos.lng })
                },
              }}
            >
              {businessName && (
                <Popup offset={[0, -10]}>
                  <div className="font-sans font-semibold text-[13px] text-ink">{businessName}</div>
                  <div className="font-mono text-[11px] text-ink-muted">
                    {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
                  </div>
                </Popup>
              )}
            </Marker>
          )}
        </MapContainer>

        {/* Tip flotante sobre el mapa */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted shadow-xs backdrop-blur-xs">
          Haz clic o arrastra el pin al local del restaurante
        </div>
      </div>

      {/* Inputs numéricos con edición manual */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="business-lat-input"
            className="block text-[12px] font-semibold text-ink-muted mb-1"
          >
            Latitud GPS
          </label>
          <input
            id="business-lat-input"
            type="number"
            step="0.000001"
            className="t-field font-mono text-[13px]"
            placeholder="-9.146500"
            value={value?.lat ?? ''}
            onChange={(e) => {
              const val = Number.parseFloat(e.target.value)
              if (Number.isNaN(val)) {
                onChange(value ? { ...value, lat: 0 } : null)
              } else {
                onChange({ lat: val, lng: value?.lng ?? SAN_JACINTO_CENTER.lng })
              }
            }}
          />
        </div>
        <div>
          <label
            htmlFor="business-lng-input"
            className="block text-[12px] font-semibold text-ink-muted mb-1"
          >
            Longitud GPS
          </label>
          <input
            id="business-lng-input"
            type="number"
            step="0.000001"
            className="t-field font-mono text-[13px]"
            placeholder="-78.280500"
            value={value?.lng ?? ''}
            onChange={(e) => {
              const val = Number.parseFloat(e.target.value)
              if (Number.isNaN(val)) {
                onChange(value ? { ...value, lng: 0 } : null)
              } else {
                onChange({ lat: value?.lat ?? SAN_JACINTO_CENTER.lat, lng: val })
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
