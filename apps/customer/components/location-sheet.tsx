'use client'

import { Button, Icon, Segmented, Spinner, useDialogFocus } from '@tindivo/ui'
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  initialConfirmed,
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
  /**
   * `false` cuando `initial` es solo el encuadre del pueblo y nadie ha elegido
   * nada todavía. Manda sobre dos cosas: si sale la capa que enseña el gesto, y
   * si Confirmar arranca habilitado. Sin esto, abrir la pantalla y darle al
   * botón de una guardaba el centro de cobertura como si fuera una puerta.
   */
  initialConfirmed: boolean
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
  /**
   * Hubo un gesto deliberado: el dedo movió el mapa o el GPS trajo una medida.
   * Es lo único que habilita Confirmar. Abrir la pantalla y mirar no cuenta.
   */
  const [settled, setSettled] = useState(initialConfirmed)
  /** La capa que enseña el gesto: solo mientras no haya un punto elegido. */
  const [coach, setCoach] = useState(!initialConfirmed)

  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Escape, la trampa de foco y la vuelta del foco al cerrar, en el mismo sitio
  // que las hojas del DS. Antes esta pantalla escuchaba Escape por su cuenta
  // pero no movía el foco: con teclado se abría el mapa y el foco se quedaba
  // detrás, en la hoja que lo había abierto.
  useDialogFocus(caja, { open: mounted, onClose: onCancel })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

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
      setSettled(true)
    }
  }

  /** El primer arrastre ya enseñó lo que la capa quería enseñar. */
  function handleMoving(m: boolean) {
    setMoving(m)
    if (m) setCoach(false)
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
      setSettled(true)
      setCoach(false)
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
    <div
      ref={caja}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar la ubicación en el mapa"
      className="fixed inset-0 z-[95] flex flex-col bg-surface animate-[t-fade-in_180ms_ease] focus:outline-none"
    >
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
          onMovingChange={handleMoving}
          showPin={!coach}
        />

        {/* Barra superior: volver + fondo del mapa. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[730] flex items-start gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
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
                { value: 'street', label: 'Mapa' },
                { value: 'satellite', label: 'Satélite' },
              ]}
            />
          </div>
        </div>

        {/* La instrucción se desvanece mientras el dedo está trabajando. */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-[calc(4.75rem+env(safe-area-inset-top))] z-[600] flex justify-center px-4 transition-opacity duration-200 ${
            moving || coach ? 'opacity-0' : 'opacity-100'
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
        {/*
          LA CAPA QUE ENSEÑA EL GESTO.
          Sale solo cuando no hay punto elegido, y se va con el primer arrastre.
          Aquí está el malentendido que costaba direcciones: la gente daba por
          hecho que el mapa era una foto y se iba directo a los campos de texto.
          Decirlo en una píldora de 12 px no alcanzaba; hay que enseñarlo.
        */}
        {coach && (
          <div className="pointer-events-none absolute inset-0 z-[720] flex select-none flex-col items-center justify-center gap-3.5 bg-ink/[0.66] px-8 text-center">
            <svg width="112" height="74" viewBox="0 0 112 74" fill="none" aria-hidden="true">
              <title>El mapa se mueve, el pin se queda</title>
              <g
                stroke="rgba(255,255,255,.85)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 37H2" />
                <path d="M7 31l-5 6 5 6" />
                <path d="M98 37h12" />
                <path d="M105 31l5 6-5 6" />
              </g>
              <rect
                x="26"
                y="7"
                width="60"
                height="60"
                rx="10"
                fill="rgba(255,255,255,.14)"
                stroke="rgba(255,255,255,.85)"
                strokeWidth="2.4"
              />
              <g stroke="rgba(255,255,255,.42)" strokeWidth="2">
                <path d="M26 27h60" />
                <path d="M26 49h60" />
                <path d="M46 7v60" />
                <path d="M68 7v60" />
              </g>
              <g transform="translate(43 12) scale(0.76)">
                <path
                  d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z"
                  fill="#f97316"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                <circle cx="17" cy="16" r="5" fill="#ffffff" />
              </g>
            </svg>

            <h2 className="font-display font-extrabold text-[22px] text-white leading-[1.2] tracking-tight text-balance">
              Arrastra el mapa hasta que el pin quede en tu puerta
            </h2>
            <p className="text-[14px] text-white/75 leading-snug text-pretty">
              El pin no se mueve: se mueve el mapa por debajo. Pellizca para acercar.
            </p>

            <p className="flex items-start gap-2 rounded-[14px] bg-white/[0.13] px-3.5 py-2.5 text-left text-[12.5px] text-white/90 leading-snug">
              <Icon name="satellite_alt" size={20} className="mt-px text-white/90" />
              <span>
                ¿No reconoces la calle? Toca <strong className="font-bold">Satélite</strong> y busca
                el techo de tu casa.
              </span>
            </p>

            <button
              type="button"
              onClick={() => setCoach(false)}
              className="pointer-events-auto mt-1 inline-flex h-[46px] items-center justify-center rounded-full bg-white px-8 font-extrabold text-[15px] text-ink transition-transform active:scale-[0.97]"
            >
              Entendido
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 rounded-t-[24px] bg-card px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.4)]">
        <p className="font-display font-bold text-[17px] leading-tight text-ink">
          {moving ? 'Ubicando…' : settled ? '¿El pin está en tu puerta?' : 'Arrastra el mapa'}
        </p>

        <div className="mt-1 flex min-h-[18px] items-center gap-1.5 font-mono text-[11px]">
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
              locateError || !inside ? 'bg-danger' : settled ? 'bg-brand' : 'bg-brand-dark'
            }`}
          />
          <span
            className={`truncate ${
              locateError || !inside
                ? 'text-danger'
                : settled
                  ? 'text-ink/70'
                  : 'font-semibold text-brand-dark'
            }`}
          >
            {locateError
              ? locateError
              : !inside
                ? 'Fuera de la zona de reparto de San Jacinto'
                : !settled
                  ? 'Aún no marcas tu puerta'
                  : `Envío S/ ${fee.toFixed(2)}${band === 'far' ? ' (zona lejana)' : ''}${
                      accuracyM != null ? ` · GPS ±${accuracyM} m` : ' · ajustada a mano'
                    }`}
          </span>
        </div>

        <Button
          type="button"
          variant="brand"
          className="mt-3 w-full"
          disabled={!inside || moving || !settled}
          onClick={() => onConfirm({ coords, accuracyM })}
        >
          {!settled
            ? 'Arrastra el mapa para marcar tu puerta'
            : inside
              ? 'Sí, aquí es mi puerta'
              : 'Muévelo dentro de la zona'}
        </Button>
      </div>
    </div>
  )

  return createPortal(body, document.body)
}
