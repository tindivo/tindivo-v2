'use client'

import { Icon, Spinner } from '@tindivo/ui'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCoverage, getCoveragePolygon, haversineKm, pointInPolygon } from '@/lib/coverage'
import { bandForPoint, type DeliveryBands, getDeliveryBands, getFarZones } from '@/lib/delivery-fee'
import { GeolocationError, geoErrorMessage, getCurrentPositionHA } from '@/lib/geolocation'
import { LocationSheet } from './location-sheet'
import type { LatLng, MapBounds, MapMode } from './map-picker-inner'

export type { LatLng }

// Leaflet toca `window`: solo se carga en cliente.
const MapCanvas = dynamic(() => import('./map-picker-inner'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-ink/[0.06]" />,
})

const ATTRIBUTION: Record<MapMode, string> = {
  street: '© OpenStreetMap',
  satellite: '© Esri',
}

/**
 * La pared del mapa: el rectángulo de la zona con holgura.
 *
 * No es la zona de reparto (esa es el polígono, y sí se puede pisar fuera para
 * que el formulario avise). Es el límite de hasta dónde puede viajar el mapa,
 * para que perderse deje de ser posible.
 */
function boundsFor(polygon: LatLng[] | null, center: LatLng, radiusKm: number): MapBounds {
  if (polygon && polygon.length >= 3) {
    const lats = polygon.map((p) => p.lat)
    const lngs = polygon.map((p) => p.lng)
    const south = Math.min(...lats)
    const north = Math.max(...lats)
    const west = Math.min(...lngs)
    const east = Math.max(...lngs)
    // Holgura: 25% del lado, con un mínimo de ~1 km para polígonos pequeños.
    const padLat = Math.max((north - south) * 0.25, 0.009)
    const padLng = Math.max((east - west) * 0.25, 0.009)
    return {
      south: south - padLat,
      north: north + padLat,
      west: west - padLng,
      east: east + padLng,
    }
  }
  const dLat = (radiusKm * 1.6) / 111.32
  const dLng = (radiusKm * 1.6) / (111.32 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.1))
  return {
    south: center.lat - dLat,
    north: center.lat + dLat,
    west: center.lng - dLng,
    east: center.lng + dLng,
  }
}

/**
 * Selector de ubicación: vista previa inerte + pantalla completa para ajustar.
 *
 * El mapa YA NO es interactivo dentro del formulario. Lo que se ve aquí es una
 * postal congelada; tocarla abre `LocationSheet`, donde el mapa ocupa toda la
 * pantalla y el pin va fijo al centro. Ese cambio resuelve dos cosas a la vez:
 * el mapa deja de robarle el scroll a la hoja, y el dedo deja de tapar el punto
 * que intenta colocar.
 *
 * Al montar sin ubicación previa se pide el GPS de una. En un pueblo acierta a
 * media cuadra la mayoría de las veces, así que el ajuste manual pasa a ser la
 * excepción y no el trabajo por defecto. Si el permiso se niega, el punto se
 * queda en el centro de cobertura y el ajuste manual sigue estando a un toque.
 */
export function MapPicker({
  value,
  onChange,
  onValidityChange,
  heightPx = 180,
}: {
  value: LatLng | null
  /**
   * La coordenada Y su precisión viajan juntas: `null` significa que el punto
   * lo puso una persona moviendo el mapa, no el GPS. Separarlas en dos avisos
   * dejaba que la precisión de una lectura vieja sobreviviera a un ajuste
   * manual, y esa precisión es lo que mira el antifraude.
   */
  onChange: (c: LatLng, accuracyM: number | null) => void
  onValidityChange?: (inside: boolean) => void
  heightPx?: number
}) {
  const [center, setCenter] = useState<LatLng | null>(null)
  const [polygon, setPolygon] = useState<LatLng[] | null>(null)
  const [radiusKm, setRadiusKm] = useState(3)
  const [loaded, setLoaded] = useState(false)
  const [bands, setBands] = useState<DeliveryBands>({ near: 2.0, far: 2.5 })
  const [farZones, setFarZones] = useState<LatLng[][]>([])

  const [accuracyM, setAccuracyM] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  // Abre en calles: es lo que orienta primero. El satélite está a un toque para
  // quien necesite reconocer su techo, y la elección se conserva al volver.
  const [mode, setMode] = useState<MapMode>('street')
  const [sheetOpen, setSheetOpen] = useState(false)

  // Si al montar ya había un punto guardado, no se pide el GPS: la dirección
  // que el usuario está editando manda sobre dónde esté parado ahora.
  const hadInitialValue = useRef(value != null)
  const autoLocateTried = useRef(false)

  useEffect(() => {
    let on = true
    Promise.all([getCoverage(), getCoveragePolygon(), getDeliveryBands(), getFarZones()]).then(
      ([cov, poly, b, fz]) => {
        if (!on) return
        setCenter({ lat: cov.centerLat, lng: cov.centerLng })
        setRadiusKm(cov.radiusKm)
        setPolygon(poly?.polygon ?? null)
        setBands(b)
        setFarZones(fz)
        setLoaded(true)
      },
    )
    return () => {
      on = false
    }
  }, [])

  // Sin selección previa, el centro de cobertura es la selección inicial: así
  // "Guardar" funciona aunque el usuario nunca abra el mapa.
  useEffect(() => {
    if (center && !value) onChange(center, null)
  }, [center, value, onChange])

  useEffect(() => {
    if (!loaded || autoLocateTried.current || hadInitialValue.current) return
    autoLocateTried.current = true
    let on = true
    setLocating(true)
    getCurrentPositionHA()
      .then((fix) => {
        if (!on) return
        const acc = Math.round(fix.accuracyM)
        setAccuracyM(acc)
        onChange({ lat: fix.lat, lng: fix.lng }, acc)
      })
      // El intento automático falla en silencio: el permiso denegado no es un
      // error del usuario y el camino manual sigue abierto.
      .catch(() => undefined)
      .finally(() => {
        if (on) setLocating(false)
      })
    return () => {
      on = false
    }
    // Depende solo de `loaded` a propósito: `onChange` llega como lambda nueva
    // en cada render, y el ref `autoLocateTried` es lo que garantiza que esto
    // corra una sola vez por montaje.
  }, [loaded])

  const pos = value ?? center

  const inside = useMemo(() => {
    if (!loaded || !pos) return true
    if (polygon) return pointInPolygon(pos, polygon)
    if (center) return haversineKm(pos, center) <= radiusKm
    return true
  }, [loaded, pos, polygon, center, radiusKm])

  useEffect(() => {
    if (loaded && pos) onValidityChange?.(inside)
  }, [inside, loaded, pos, onValidityChange])

  const circle = polygon ? null : center ? { center, radiusKm } : null
  const bounds = useMemo(
    () => (center ? boundsFor(polygon, center, radiusKm) : null),
    [polygon, center, radiusKm],
  )

  const band = useMemo(() => bandForPoint(pos, farZones), [pos, farZones])
  const fee = band === 'far' ? bands.far : bands.near

  async function locateFromStatusBar() {
    if (locating) return
    setLocating(true)
    setLocateError(null)
    try {
      const fix = await getCurrentPositionHA()
      const acc = Math.round(fix.accuracyM)
      setAccuracyM(acc)
      onChange({ lat: fix.lat, lng: fix.lng }, acc)
    } catch (err) {
      const code = err instanceof GeolocationError ? err.code : 'position_unavailable'
      setLocateError(geoErrorMessage(code))
    } finally {
      setLocating(false)
    }
  }

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl border border-ink/[0.08]"
        // `isolation: isolate` crea un stacking context propio: confina los
        // z-index internos de Leaflet para que no se pinten sobre los modales.
        style={{ height: heightPx, isolation: 'isolate' }}
      >
        {pos && bounds ? (
          <MapCanvas
            center={pos}
            interactive={false}
            mode={mode}
            polygon={polygon}
            circle={circle}
            bounds={bounds}
            zoom={17}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-ink/[0.06]" />
        )}

        <span className="pointer-events-none absolute right-1.5 bottom-1.5 z-[550] rounded bg-white/75 px-1 py-px font-mono text-[8px] text-ink/60">
          {ATTRIBUTION[mode]}
        </span>

        {/* La postal entera es el botón: el objetivo táctil es la tarjeta. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          disabled={!pos || !bounds}
          aria-label="Ajustar mi ubicación en el mapa"
          className="absolute inset-0 z-[600] flex items-end justify-start p-2.5 transition-colors hover:bg-ink/[0.04] active:bg-ink/[0.07] disabled:cursor-default"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-semibold text-[12px] text-ink shadow-elev-3">
            <Icon name="edit_location_alt" size={16} />
            Toca para ajustar tu ubicación
          </span>
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div
          className={`flex min-w-0 items-center gap-1.5 font-mono text-[11px] ${
            locateError || !inside ? 'text-danger' : 'text-ink/70'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              locateError || !inside ? 'bg-danger' : 'bg-brand'
            }`}
          />
          <span className="truncate">
            {locating ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner size="xs" variant="brand" /> Buscando tu ubicación…
              </span>
            ) : locateError ? (
              locateError
            ) : !pos ? (
              'Cargando mapa…'
            ) : !inside ? (
              'Fuera de la zona de reparto de San Jacinto'
            ) : (
              `Envío S/ ${fee.toFixed(2)}${band === 'far' ? ' (zona lejana)' : ''}${
                accuracyM != null ? ` · GPS ±${accuracyM} m` : ''
              }`
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={locateFromStatusBar}
          disabled={locating || !loaded}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-[12px] text-brand-dark underline-offset-2 hover:underline disabled:opacity-50"
        >
          <Icon name="my_location" size={14} />
          Usar mi ubicación
        </button>
      </div>

      {sheetOpen && pos && (
        <LocationSheet
          initial={pos}
          initialAccuracyM={accuracyM}
          polygon={polygon}
          circle={circle}
          bounds={bounds}
          farZones={farZones}
          bands={bands}
          mode={mode}
          onModeChange={setMode}
          onCancel={() => setSheetOpen(false)}
          onConfirm={({ coords, accuracyM: acc }) => {
            setAccuracyM(acc)
            setLocateError(null)
            onChange(coords, acc)
            setSheetOpen(false)
          }}
        />
      )}
    </div>
  )
}
