'use client'

import { Button, Icon, Spinner } from '@tindivo/ui'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCoverage, getCoveragePolygon, haversineKm, pointInPolygon } from '@/lib/coverage'
import { bandForPoint, type DeliveryBands, getDeliveryBands, getFarZones } from '@/lib/delivery-fee'
import {
  GeolocationError,
  geoErrorMessage,
  getCurrentPositionHA,
  getGeolocationPermission,
} from '@/lib/geolocation'
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
 * Precisión a partir de la cual la lectura deja de servir para una puerta.
 *
 * 30 y no los 20 del motorizado a propósito: él está parado en la vereda con
 * el cielo despejado, y quien pide está dentro de su casa, con techo encima.
 * Exigirle los 20 marcaría en ámbar casi todas las lecturas buenas y el aviso
 * dejaría de significar algo.
 */
const PRECISION_SUFICIENTE_M = 30

/**
 * En qué anda el sensor. `idle` no es «sin ubicación»: es «no hay nada en
 * curso», y si hay punto o no lo dice `value`, que es la única fuente.
 */
type GpsState =
  | { kind: 'idle' }
  | { kind: 'locating' }
  /** El navegador tiene el permiso bloqueado: reintentar no abre diálogo. */
  | { kind: 'denied' }
  /** Falló por otra cosa (sin señal, timeout): reintentar sí tiene sentido. */
  | { kind: 'failed'; message: string }

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
 * Selector de ubicación: vista previa INERTE + pantalla completa para ajustar.
 *
 * DOS REGLAS QUE NO SE TOCAN.
 *
 *   1. LA VISTA PREVIA NO SE MUEVE. Es una postal de solo lectura: ni arrastre
 *      ni zoom. Un Leaflet vivo dentro de un formulario con scroll se queda con
 *      cualquier gesto que empiece encima y la hoja parece trabada. Cambiar la
 *      ubicación abre SIEMPRE `LocationSheet`, donde el mapa tiene la pantalla
 *      entera y el dedo no tapa el punto que intenta colocar.
 *
 *   2. EL CENTRO DEL PUEBLO NUNCA ES UNA RESPUESTA. Antes, al montar, se
 *      escribía el centro de cobertura como coordenada «para que Guardar
 *      funcione aunque nadie abra el mapa»: alguien con prisa llenaba calle y
 *      referencia y guardaba la plaza como su casa. Es el mismo defecto que la
 *      migración 0147 documenta del v1 (18 direcciones falsas) y que el app del
 *      motorizado ya había cerrado. Hoy `value` se queda en `null` hasta que
 *      hay una medida del sensor o un gesto sobre el mapa; el centro solo se
 *      usa para encuadrar la postal, que es decir «mirá por aquí».
 *
 * EL GPS ES UN ATAJO, NUNCA UN REQUISITO. Al montar sin ubicación previa se
 * pide de una: en un pueblo acierta a media cuadra la mayoría de las veces. Si
 * el permiso está denegado se dice y se ofrece reintentarlo, pero marcar a mano
 * sigue siendo el camino principal y siempre está a un toque.
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
  const [gps, setGps] = useState<GpsState>({ kind: 'idle' })
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

  useEffect(() => {
    if (!loaded || autoLocateTried.current || hadInitialValue.current) return
    autoLocateTried.current = true
    let on = true
    setGps({ kind: 'locating' })
    // Antes de gastar 15 s en un `getCurrentPosition` que va a fallar seco, se
    // pregunta por el permiso: bloqueado, se dice de una y se enseña el camino
    // manual en vez de dejar el spinner girando para nada.
    getGeolocationPermission()
      .then((perm) => {
        if (!on) return null
        if (perm === 'denied') {
          setGps({ kind: 'denied' })
          return null
        }
        return getCurrentPositionHA()
      })
      .then((fix) => {
        if (!on || !fix) return
        const acc = Math.round(fix.accuracyM)
        setAccuracyM(acc)
        onChange({ lat: fix.lat, lng: fix.lng }, acc)
        setGps({ kind: 'idle' })
      })
      // El fallo del intento automático YA NO se traga. Que el permiso esté
      // denegado no es culpa de nadie, pero callarlo dejaba la pantalla
      // idéntica a un acierto y la persona seguía de largo hacia los campos de
      // texto creyendo que su ubicación ya estaba puesta.
      .catch((err) => {
        if (!on) return
        const code = err instanceof GeolocationError ? err.code : 'position_unavailable'
        setGps(
          code === 'denied'
            ? { kind: 'denied' }
            : { kind: 'failed', message: geoErrorMessage(code) },
        )
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

  async function locate() {
    if (gps.kind === 'locating') return
    setGps({ kind: 'locating' })
    try {
      const fix = await getCurrentPositionHA()
      const acc = Math.round(fix.accuracyM)
      setAccuracyM(acc)
      onChange({ lat: fix.lat, lng: fix.lng }, acc)
      setGps({ kind: 'idle' })
    } catch (err) {
      const code = err instanceof GeolocationError ? err.code : 'position_unavailable'
      setGps(
        code === 'denied' ? { kind: 'denied' } : { kind: 'failed', message: geoErrorMessage(code) },
      )
    }
  }

  const hasPoint = value != null
  const listo = loaded && pos != null && bounds != null
  /** Medida del sensor demasiado gruesa para acertar una puerta. */
  const flojo = hasPoint && accuracyM != null && accuracyM > PRECISION_SUFICIENTE_M

  /** Lo que toca pintar encima de la postal. */
  const estado: 'locating' | 'denied' | 'failed' | 'missing' | 'weak' | 'ok' = hasPoint
    ? flojo
      ? 'weak'
      : 'ok'
    : gps.kind === 'locating'
      ? 'locating'
      : gps.kind === 'denied'
        ? 'denied'
        : gps.kind === 'failed'
          ? 'failed'
          : 'missing'

  function abrirMapa() {
    if (listo) setSheetOpen(true)
  }

  return (
    <div>
      <div
        className={`relative overflow-hidden rounded-2xl border ${
          estado === 'ok'
            ? 'border-success/30'
            : estado === 'weak'
              ? 'border-[1.5px] border-warning/55'
              : 'border-[1.5px] border-dashed border-brand/55'
        }`}
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
            showPin={hasPoint}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-ink/[0.06]" />
        )}

        {hasPoint && (
          <span className="pointer-events-none absolute right-1.5 bottom-1.5 z-[550] rounded bg-white/75 px-1 py-px font-mono text-[8px] text-ink/60">
            {ATTRIBUTION[mode]}
          </span>
        )}

        {/* CON PUNTO: la postal entera es el botón que abre el mapa grande. */}
        {hasPoint && (
          <button
            type="button"
            onClick={abrirMapa}
            aria-label="Cambiar mi ubicación en el mapa"
            className="absolute inset-0 z-[600] transition-colors hover:bg-ink/[0.04] active:bg-ink/[0.07]"
          >
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-card py-1.5 pr-3 pl-2 font-bold text-[12px] text-ink shadow-elev-3">
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white ${
                  flojo ? 'bg-warning' : 'bg-success'
                }`}
              >
                <Icon name={flojo ? 'priority_high' : 'check'} size={12} filled />
              </span>
              {flojo ? `GPS aproximado · ±${accuracyM} m` : 'Ubicación confirmada'}
            </span>

            {flojo ? (
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-ink/[0.82] px-3 py-2.5 text-left">
                <span className="min-w-0 flex-1 font-semibold text-[12px] text-white leading-tight">
                  El pin puede estar a una cuadra de tu casa.
                </span>
                <span className="shrink-0 rounded-full bg-[linear-gradient(135deg,#d97706,#f59e0b)] px-3.5 py-2 font-extrabold text-[12px] text-white">
                  Revisar en el mapa
                </span>
              </span>
            ) : (
              <span className="absolute right-2.5 bottom-2.5 inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-bold text-[12px] text-brand-dark shadow-elev-3">
                <Icon name="edit_location_alt" size={14} />
                Cambiar
              </span>
            )}
          </button>
        )}

        {/* SIN PUNTO: el mapa se apaga y encima va una sola pregunta clara. */}
        {!hasPoint && (
          <div className="absolute inset-0 z-[600] flex flex-col items-center justify-center gap-1.5 bg-surface/[0.78] px-5 text-center">
            {estado === 'locating' ? (
              <>
                <Spinner size="sm" variant="brand" />
                <p className="mt-1 font-display font-bold text-[15px] text-ink">
                  Buscando tu ubicación…
                </p>
                <p className="max-w-[250px] text-[12px] text-ink-muted leading-snug">
                  Estamos usando el GPS de tu teléfono. Tarda unos segundos.
                </p>
                <button
                  type="button"
                  onClick={abrirMapa}
                  disabled={!listo}
                  className="mt-1.5 font-bold text-[13px] text-brand-dark underline underline-offset-[3px] disabled:opacity-50"
                >
                  Prefiero marcarla yo en el mapa
                </button>
              </>
            ) : estado === 'missing' ? (
              <>
                <svg
                  width="30"
                  height="38"
                  viewBox="0 0 30 38"
                  fill="none"
                  aria-hidden="true"
                  className="text-brand-dark"
                >
                  <title>Ubicación sin marcar</title>
                  <path
                    d="M15 2.5C8.4 2.5 3 7.8 3 14.4 3 23 15 34.5 15 34.5S27 23 27 14.4C27 7.8 21.6 2.5 15 2.5z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="4 3.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="15" cy="14" r="3.4" fill="currentColor" />
                </svg>
                <p className="font-display font-bold text-[15px] text-ink">
                  Falta marcar tu ubicación
                </p>
                <p className="max-w-[250px] text-[12px] text-ink-muted leading-snug">
                  El motorizado necesita el punto exacto de tu puerta, no solo la calle.
                </p>
                <Button
                  type="button"
                  variant="brand"
                  onClick={abrirMapa}
                  disabled={!listo}
                  className="mt-1.5"
                >
                  <Icon name="map" size={17} />
                  Marcar en el mapa
                </Button>
              </>
            ) : (
              // Denegado o fallido: el GPS se cayó, no el camino. Reintentar
              // está al lado, no en lugar de, marcar a mano.
              <>
                <Icon name="location_off" size={26} className="text-brand-dark" />
                <p className="font-display font-bold text-[15px] text-ink">
                  {estado === 'denied' ? 'No pudimos usar tu GPS' : 'El GPS no respondió'}
                </p>
                <p className="max-w-[290px] text-[12px] text-ink-muted leading-snug">
                  {estado === 'denied'
                    ? 'No pasa nada: márcala tú en el mapa y listo. Si prefieres el GPS, permítelo desde el candado de la barra de tu navegador.'
                    : gps.kind === 'failed'
                      ? gps.message
                      : ''}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={locate}>
                    {estado === 'denied' ? 'Permitir GPS' : 'Reintentar'}
                  </Button>
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    onClick={abrirMapa}
                    disabled={!listo}
                  >
                    Marcar en el mapa
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div
          className={`flex min-w-0 items-center gap-1.5 font-mono text-[11px] ${
            !inside
              ? 'text-danger'
              : estado === 'weak'
                ? 'font-semibold text-[#92400e]'
                : hasPoint
                  ? 'text-ink/70'
                  : 'font-semibold text-brand-dark'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              !inside
                ? 'bg-danger'
                : estado === 'weak'
                  ? 'bg-warning'
                  : hasPoint
                    ? 'bg-success'
                    : 'bg-brand-dark'
            }`}
          />
          <span className="truncate">
            {!listo
              ? 'Cargando mapa…'
              : !hasPoint
                ? 'Obligatorio · marca tu ubicación'
                : !inside
                  ? 'Fuera de la zona de reparto de San Jacinto'
                  : `Envío S/ ${fee.toFixed(2)}${band === 'far' ? ' (zona lejana)' : ''} · ${
                      accuracyM == null
                        ? 'ajustada a mano'
                        : flojo
                          ? `GPS flojo ±${accuracyM} m`
                          : `GPS ±${accuracyM} m`
                    }`}
          </span>
        </div>

        <button
          type="button"
          onClick={locate}
          disabled={gps.kind === 'locating' || !loaded}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-[12px] text-brand-dark underline-offset-2 hover:underline disabled:opacity-50"
        >
          <Icon name="my_location" size={14} />
          Usar mi GPS
        </button>
      </div>

      {sheetOpen && pos && bounds && (
        <LocationSheet
          initial={pos}
          initialAccuracyM={accuracyM}
          initialConfirmed={hasPoint}
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
            setGps({ kind: 'idle' })
            onChange(coords, acc)
            setSheetOpen(false)
          }}
        />
      )}
    </div>
  )
}
