'use client'

import { directoryCardStateOf } from '@tindivo/contracts'
import L, { type LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer } from 'react-leaflet'
import type { DirectoryBusiness } from '../lib/directory'
import { DirectoryPeekCard } from './directory-peek-card'

/**
 * Directorio-mapa. NO extrae el motor compartido a `packages/ui` todavía
 * (esa extracción queda pendiente — DECISIONS §30 — para cuando haya un
 * segundo consumidor real que confirme la forma de la API): este componente
 * es nuevo y autocontenido, pero SÍ copia las piezas del motor ya medidas contra
 * la conectividad del piloto (teselas CARTO Positron, `zoomAnimation:false`,
 * `maxBoundsViscosity:1`) en vez de adivinarlas de nuevo.
 *
 * NO reusa el paradigma de interacción del selector de ubicación
 * (`map-picker-inner.tsx`): ahí el pin va fijo al centro y el mapa se
 * arrastra por debajo; aquí los negocios son pines DE VERDAD, tocables, sin
 * pin central — es explorar-y-tocar, no fijar un punto (DECISIONS §30).
 *
 * SIN reparto anti-colisión de rótulos: con ~8-20 negocios en pantalla (el
 * piloto de San Jacinto) el riesgo de que dos pines se pisen es bajo, y los
 * pines no llevan nombre escrito al lado — solo color. Si el directorio
 * crece a la densidad real del pueblo (~60-70 puntos), medir de nuevo antes
 * de confiar en que no hace falta (mismo aviso que el §30 dejó para
 * `repartirRotulos`).
 *
 * SIN PINES DE MOTORIZADOS, A PROPÓSITO. El piloto tiene UN solo motorizado
 * real: pintar su posición de verdad es un problema de privacidad (decisión
 * tomada con el usuario, no un olvido), y pintar varios de mentira daría una
 * sensación de "red activa" falsa. Si algún día se agregan, que sean
 * decorativos/estáticos — nunca conectados a una posición real.
 */

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY
const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : '')
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'

const PIN_COLOR: Record<'partner' | 'courier_enabled' | 'visible_only', string> = {
  partner: '#F97316',
  courier_enabled: '#2E3236',
  visible_only: '#8A9096',
}

function pinIcon(state: 'partner' | 'courier_enabled' | 'visible_only'): L.DivIcon {
  const color = PIN_COLOR[state]
  return L.divIcon({
    className: 't-dir-pin',
    html:
      `<span style="display:block;width:26px;height:26px;border-radius:50% 50% 50% 0;` +
      `background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(46,50,54,.35);` +
      `transform:rotate(-45deg);"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

export interface DirectoryMapProps {
  businesses: DirectoryBusiness[]
  bounds: { south: number; west: number; north: number; east: number }
  center: { lat: number; lng: number }
}

export default function DirectoryMapInner({ businesses, bounds, center }: DirectoryMapProps) {
  const [selected, setSelected] = useState<DirectoryBusiness | null>(null)

  const maxBounds: LatLngBoundsExpression = useMemo(
    () => [
      [bounds.south, bounds.west],
      [bounds.north, bounds.east],
    ],
    [bounds],
  )

  const icons = useMemo(() => {
    const map = new Map<string, L.DivIcon>()
    for (const b of businesses) {
      map.set(b.id, pinIcon(directoryCardStateOf(b)))
    }
    return map
  }, [businesses])

  return (
    <div className="relative h-full w-full" style={{ isolation: 'isolate' }}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        minZoom={14}
        maxZoom={19}
        zoomControl={false}
        zoomAnimation={false}
        maxBounds={maxBounds}
        maxBoundsViscosity={1}
        className="h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={19} maxZoom={19} />
        {businesses.map((b) => (
          <Marker
            key={b.id}
            position={[b.lat, b.lng]}
            icon={icons.get(b.id)}
            eventHandlers={{ click: () => setSelected(b) }}
          />
        ))}
      </MapContainer>

      {selected && <DirectoryPeekCard business={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
