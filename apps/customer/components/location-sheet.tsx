'use client'

import { Button, Icon, Segmented, Spinner } from '@tindivo/ui'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { haversineKm, pointInPolygon } from '@/lib/coverage'
import { bandForPoint, type DeliveryBands } from '@/lib/delivery-fee'
import {
  type GeoFix,
  GeolocationError,
  geoErrorMessage,
  getCurrentPositionHA,
} from '@/lib/geolocation'
import type { LatLng, MapBounds, MapMode } from './map-picker-inner'

const MapCanvas = dynamic(() => import('./map-picker-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

export interface LocationResult {
  coords: LatLng
  /** Precisión (m) si el punto viene del GPS y nadie lo movió después. */
  accuracyM: number | null
}

/**
 * Pantalla completa para fijar la ubicación.
 *
 * Existe para sacar el mapa del formulario. Incrustado dentro de un contenedor
 * con scroll, Leaflet se quedaba con cualquier arrastre que empezara encima y
 * la hoja parecía trabada. Aquí no hay nada más que scrollear, así que el gesto
 * no está en disputa: todo lo que se arrastra es el mapa.
 *
 * Se monta en un portal a `document.body` porque se abre DESDE un bottom-sheet,
 * y ese sheet lleva `backdrop-blur`, que convierte al backdrop en bloque
 * contenedor de sus descendientes `fixed`. Sin el portal esta pantalla quedaría
 * atrapada en el stacking context del sheet que la abrió.
 */
export function LocationSheet({
  initial,
  initialAccuracyM,
  polygon,
  circle,
  bounds,
  farZones,
  bands,
  mode,
  onModeChange,
  onCancel,
  onConfirm,
}: {
  initial: LatLng
  initialAccuracyM: number | null
  polygon: LatLng[] | null
  circle: { center: LatLng; radiusKm: number } | null
  bounds: MapBounds | null
  farZones: LatLng[][]
  bands: DeliveryBands
  mode: MapMode
  onModeChange: (m: MapMode) => void
  onCancel: () => void
  onConfirm: (result: LocationResult) => void
}) {
  const [coords, setCoords] = useState<LatLng>(initial)
  const [accuracyM, setAccuracyM] = useState<number | null>(initialAccuracyM)
  const [moving, setMoving] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng>(initial)
  const [flyToken, setFlyToken] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onCancel])

  const inside = useMemo(() => {
    if (polygon) return pointInPolygon(coords, polygon)
    if (circle) return haversineKm(coords, circle.center) <= circle.radiusKm
    return true
  }, [coords, polygon, circle])

  const band = useMemo(() => bandForPoint(coords, farZones), [coords, farZones])
  const fee = band === 'far' ? bands.far : bands.near

  /** Un `moveend` del dedo invalida la precisión: el punto ya no lo puso el GPS. */
  function handleSettle(c: LatLng, byUser: boolean) {
    setCoords(c)
    if (byUser) {
      setAccuracyM(null)
      setLocateError(null)
    }
  }

  async function useMyLocation() {
    if (locating) return
    setLocating(true)
    setLocateError(null)
    try {
      const fix: GeoFix = await getCurrentPositionHA()
      setFlyTarget({ lat: fix.lat, lng: fix.lng })
      setFlyToken((n) => n + 1)
      setCoords({ lat: fix.lat, lng: fix.lng })
      setAccuracyM(Math.round(fix.accuracyM))
    } catch (err) {
      const code = err instanceof GeolocationError ? err.code : 'position_unavailable'
      setLocateError(geoErrorMessage(code))
    } finally {
      setLocating(false)
    }
  }

  if (!mounted) return null

  const body = (
    // Columna, no capas superpuestas: el mapa ocupa exactamente el hueco que
    // deja la tarjeta de abajo. Con el mapa a sangre por detrás de la tarjeta,
    // el centro geométrico del lienzo (donde vive el pin) cae más abajo que el
    // centro de lo que la persona ve, y el punto que fija no es el que mira.
    <div className="fixed inset-0 z-[95] flex flex-col bg-surface animate-[t-fade-in_180ms_ease]">
      <div className="relative min-h-0 flex-1">
        <MapCanvas
          center={initial}
          interactive
          mode={mode}
          polygon={polygon}
          circle={circle}
          bounds={bounds}
          flyTarget={flyTarget}
          flyToken={flyToken}
          onSettle={handleSettle}
          onMovingChange={setMoving}
        />

        {/* Barra superior: volver + fondo del mapa. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex items-start gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Volver sin cambiar la ubicación"
            className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card text-ink shadow-elev-3 transition-transform active:scale-95"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          <div className="pointer-events-auto ml-auto rounded-[15px] bg-card/95 p-0.5 shadow-elev-3 backdrop-blur-sm">
            <Segmented
              size="sm"
              value={mode}
              onChange={onModeChange}
              options={[
                { value: 'satellite', label: 'Satélite' },
                { value: 'street', label: 'Mapa' },
              ]}
            />
          </div>
        </div>

        {/* La instrucción se desvanece mientras el dedo está trabajando. */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-[600] flex justify-center px-4 transition-opacity duration-200 ${
            moving ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <span className="rounded-full bg-ink/80 px-3.5 py-1.5 text-center font-medium text-[12px] text-white shadow-elev-3">
            Mueve el mapa hasta que el pin quede en tu puerta
          </span>
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          aria-label="Centrar en mi ubicación"
          className="absolute right-4 bottom-4 z-[600] flex h-12 w-12 items-center justify-center rounded-full bg-card text-brand-dark shadow-elev-3 transition-transform active:scale-95 disabled:opacity-70"
        >
          {locating ? <Spinner size="xs" variant="brand" /> : <Icon name="my_location" size={22} />}
        </button>
      </div>

      <div className="shrink-0 rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.4)]">
        <p className="font-display font-bold text-[17px] leading-tight text-ink">
          {moving ? 'Ubicando…' : '¿El pin está en tu puerta?'}
        </p>

        <div className="mt-1 flex min-h-[18px] items-center gap-1.5 font-mono text-[11px]">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              locateError || !inside ? 'bg-danger' : 'bg-brand'
            }`}
          />
          <span className={`truncate ${locateError || !inside ? 'text-danger' : 'text-ink/70'}`}>
            {locateError
              ? locateError
              : !inside
                ? 'Fuera de la zona de reparto de San Jacinto'
                : `Envío S/ ${fee.toFixed(2)}${band === 'far' ? ' (zona lejana)' : ''}${
                    accuracyM != null ? ` · GPS ±${accuracyM} m` : ''
                  }`}
          </span>
        </div>

        <Button
          type="button"
          variant="brand"
          className="mt-3 w-full"
          disabled={!inside || moving}
          onClick={() => onConfirm({ coords, accuracyM })}
        >
          {inside ? 'Confirmar ubicación' : 'Muévelo dentro de la zona'}
        </Button>
      </div>
    </div>
  )

  return createPortal(body, document.body)
}
