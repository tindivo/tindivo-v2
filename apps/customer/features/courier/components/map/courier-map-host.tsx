'use client'

import { toCourierTrackingStep } from '@tindivo/contracts'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { boundsFor } from '@/components/map-picker'
import type { LatLng, MapBounds, MapMode, RoutePin } from '@/components/map-picker-inner'
import { getCoverage, getCoveragePolygon, haversineKm, pointInPolygon } from '@/lib/coverage'
import { GeolocationError, geoErrorMessage, getCurrentPositionHA } from '@/lib/geolocation'
import { getLandmarks, type Landmark } from '@/lib/landmarks'
import { useCourierTracking } from '../../hooks/use-courier-tracking'
import { useCourierStore } from '../../lib/store'
import type { CourierFlowStep } from '../../types'
import { PinDropOverlay } from './pin-drop-overlay'

const MapCanvas = dynamic(() => import('@/components/map-picker-inner'), {
  ssr: false,
  loading: () => null,
})

/** Alto de la franja de mapa comprimida (Pedir-2b: escribir la referencia). */
const PIN_NOTE_MAP_HEIGHT = 220

const STEPS_WITH_ROUTE_PINS = new Set<CourierFlowStep>([
  'trip',
  'trip-details',
  'trip-payer',
  'trip-items',
  'route',
  'pin-note',
  'confirm',
  'tracking',
])

/**
 * El mapa de Tindivo Entregas: UNA sola instancia de `MapCanvas`, montada
 * mientras `useCourierStore.open` sea `true` y viva durante todo el flujo
 * (`route → pin-drop → pin-note → confirm/person-details → tracking`). Las
 * hojas (`RouteSheet`, `ConfirmSheet`, etc.) flotan encima con `scrim={false}`
 * — este componente es lo que ven de fondo.
 */
export function CourierMapHost() {
  const open = useCourierStore((s) => s.open)
  const step = useCourierStore((s) => s.step)
  const draft = useCourierStore((s) => s.draft)
  const editingPoint = useCourierStore((s) => s.editingPoint)
  const confirmPinDrop = useCourierStore((s) => s.confirmPinDrop)
  const cancelEditPoint = useCourierStore((s) => s.cancelEditPoint)
  const trackingShortId = useCourierStore((s) => s.trackingShortId)

  const isTracking = step === 'tracking'
  /*
   * Sondeo propio y no compartido con `TrackingSheet`: las dos hojas pintan la
   * misma entrega desde vistas distintas (mapa vs. tarjeta) y no hay un canal
   * ya construido entre ambas fuera del store. Con 8s de intervalo y a lo
   * sumo un flujo abierto a la vez (piloto, ~10 pedidos/noche), duplicar el
   * sondeo cuesta una petición extra cada 8s, no un problema de escala.
   */
  const { data: tracking } = useCourierTracking(trackingShortId ?? '', open && isTracking)

  const [mode, setMode] = useState<MapMode>('street')
  const [polygon, setPolygon] = useState<LatLng[] | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [coverageCenter, setCoverageCenter] = useState<LatLng | null>(null)
  const [coverageRadiusKm, setCoverageRadiusKm] = useState(3)
  const [landmarks, setLandmarks] = useState<Landmark[]>([])
  const [loaded, setLoaded] = useState(false)

  // Datos de cobertura: los mismos que ya usa `MapPicker`, cacheados a nivel
  // de módulo (`getCoverage`/`getCoveragePolygon`), así que pedirlos aquí
  // también no duplica la llamada de red — solo la primera vez que se abre.
  useEffect(() => {
    if (!open || loaded) return
    let on = true
    Promise.all([getCoverage(), getCoveragePolygon(), getLandmarks()]).then(([cov, poly, lm]) => {
      if (!on) return
      const center = { lat: cov.centerLat, lng: cov.centerLng }
      setCoverageCenter(center)
      setCoverageRadiusKm(cov.radiusKm)
      setPolygon(poly?.polygon ?? null)
      setBounds(boundsFor(poly?.polygon ?? null, center, cov.radiusKm))
      setLandmarks(lm)
      setLoaded(true)
    })
    return () => {
      on = false
    }
  }, [open, loaded])

  /*
   * Estado transitorio del gesto de pin-drop. Vive aquí y no en
   * `PinDropOverlay` porque solo este componente monta `MapCanvas` y recibe
   * sus callbacks (`onSettle`/`onMovingChange`) — `PinDropOverlay` es chrome
   * puro encima del mapa, no un mapa aparte.
   */
  const [pinCoords, setPinCoords] = useState<LatLng | null>(null)
  const [pinAccuracyM, setPinAccuracyM] = useState<number | null>(null)
  const [pinMoving, setPinMoving] = useState(false)
  const [pinSettled, setPinSettled] = useState(false)
  const [pinCoach, setPinCoach] = useState(true)
  const [pinFlyTarget, setPinFlyTarget] = useState<LatLng | undefined>(undefined)
  const [pinFlyToken, setPinFlyToken] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  // Se re-siembra cada vez que ARRANCA un pin-drop (no en cada render de él):
  // si ya había una coordenada guardada para ese punto, se abre sobre ella.
  // Si NO la había, arranca en el centro del pueblo mientras se resuelve el
  // GPS y, en cuanto llega, vuela ahí y lo da por asentado — "puedo mover el
  // pin si quiero" quiere decir que parte usable (confirmable de una), no que
  // haga falta arrastrar a mano para poder seguir. Sin permiso o sin señal,
  // se queda en el centro del pueblo a arrastrar a mano, en silencio: es un
  // valor por defecto, no algo que la persona pidió, así que un fallo no
  // merece un aviso de error.
  const wasPinDrop = useRef(false)
  useEffect(() => {
    const isPinDrop = step === 'pin-drop'
    let cancelado = false
    if (isPinDrop && !wasPinDrop.current) {
      const existing = editingPoint ? draft[editingPoint].coordinates : null
      setPinAccuracyM(editingPoint ? draft[editingPoint].accuracyM : null)
      setPinMoving(false)
      setLocating(false)
      setLocateError(null)
      if (existing) {
        setPinCoords(existing)
        setPinSettled(true)
        setPinCoach(false)
      } else {
        setPinCoords(coverageCenter)
        setPinSettled(false)
        setPinCoach(true)
        getCurrentPositionHA()
          .then((fix) => {
            if (cancelado) return
            const c = { lat: fix.lat, lng: fix.lng }
            setPinFlyTarget(c)
            setPinFlyToken((n) => n + 1)
            setPinCoords(c)
            setPinAccuracyM(Math.round(fix.accuracyM))
            setPinSettled(true)
          })
          .catch(() => {})
      }
    }
    wasPinDrop.current = isPinDrop
    return () => {
      cancelado = true
    }
  }, [step, editingPoint, draft, coverageCenter])

  const handleSettle = useCallback((c: LatLng, byUser: boolean) => {
    setPinCoords(c)
    if (byUser) {
      setPinAccuracyM(null)
      setLocateError(null)
      setPinSettled(true)
    }
  }, [])

  const handleMoving = useCallback((m: boolean) => {
    setPinMoving(m)
    if (m) setPinCoach(false)
  }, [])

  const useMyLocation = useCallback(async () => {
    if (locating) return
    setLocating(true)
    setLocateError(null)
    try {
      const fix = await getCurrentPositionHA()
      const c = { lat: fix.lat, lng: fix.lng }
      setPinFlyTarget(c)
      setPinFlyToken((n) => n + 1)
      setPinCoords(c)
      setPinAccuracyM(Math.round(fix.accuracyM))
      setPinSettled(true)
      setPinCoach(false)
    } catch (err) {
      const code = err instanceof GeolocationError ? err.code : 'position_unavailable'
      setLocateError(geoErrorMessage(code))
    } finally {
      setLocating(false)
    }
  }, [locating])

  const pinInside = useMemo(() => {
    if (!pinCoords) return true
    if (polygon) return pointInPolygon(pinCoords, polygon)
    if (coverageCenter) return haversineKm(pinCoords, coverageCenter) <= coverageRadiusKm
    return true
  }, [pinCoords, polygon, coverageCenter, coverageRadiusKm])

  const routePins = useMemo<RoutePin[]>(() => {
    if (!STEPS_WITH_ROUTE_PINS.has(step)) return []
    // El enlace público de seguimiento (`/entregas/[shortId]`) abre `tracking`
    // sin haber pasado por el flujo de pedir en esta sesión: `draft` nace
    // vacío, y las únicas coordenadas que existen son las que trae el RPC
    // `get_courier_tracking` (0234).
    const fromTracking = isTracking ? tracking : null
    const originCoords = draft.origin.coordinates ?? fromTracking?.originCoordinates ?? null
    const destinationCoords =
      draft.destination.coordinates ?? fromTracking?.destinationCoordinates ?? null

    const pins: RoutePin[] = []
    if (originCoords) {
      pins.push({
        id: 'origin',
        coordinates: originCoords,
        label:
          draft.origin.label || draft.origin.contactName || fromTracking?.originName || 'Recojo',
        variant: 'origin',
      })
    }
    if (destinationCoords) {
      pins.push({
        id: 'destination',
        coordinates: destinationCoords,
        label:
          draft.destination.label ||
          draft.destination.contactName ||
          fromTracking?.destinationName ||
          'Entrega',
        variant: 'destination',
      })
    }
    /*
     * Badge "Va a recoger": estático sobre el pin de origen mientras el
     * motorizado va camino a recoger o ya está ahí (`toCourierTrackingStep`
     * agrupa `accepted`/`heading_to_pickup`/`at_pickup` en `'confirmed'`,
     * el mismo agrupamiento que ya usa `TrackingSheet` para su stepper — no
     * una lista de estados aparte). Posición en vivo del motorizado: fuera de
     * alcance (Hito 3b del plan), esto es la versión de piloto.
     */
    if (
      originCoords &&
      fromTracking &&
      toCourierTrackingStep(fromTracking.status) === 'confirmed'
    ) {
      pins.push({
        id: 'driver',
        coordinates: originCoords,
        label: fromTracking.driverName ?? 'Va a recoger',
        variant: 'driver',
      })
    }
    return pins
  }, [step, isTracking, draft.origin, draft.destination, tracking])

  // `fitToPins` necesita un token que cambie SOLO cuando el conjunto de pines
  // cambia de verdad — no en cada render de `CourierMapHost` — o el mapa
  // volvería a encuadrar en cada tecla que alguien escriba en una hoja.
  const [fitToken, setFitToken] = useState(0)
  const pinsKeyRef = useRef('')
  const pinsKey = routePins
    .map((p) => `${p.id}:${p.coordinates.lat.toFixed(5)},${p.coordinates.lng.toFixed(5)}`)
    .join('|')
  useEffect(() => {
    if (pinsKey === pinsKeyRef.current) return
    pinsKeyRef.current = pinsKey
    if (pinsKey) setFitToken((n) => n + 1)
  }, [pinsKey])
  const fitToPins = useMemo(
    () =>
      routePins.length > 0
        ? { coordinates: routePins.map((p) => p.coordinates), token: fitToken }
        : undefined,
    [routePins, fitToken],
  )

  // Línea recta A→B: solo cuando AMBOS puntos ya están fijados. `useMemo`
  // (no un literal inline) por el mismo motivo que `fitToPins` — `MapCanvas`
  // está memoizado y un objeto nuevo en cada render lo invalidaría igual que
  // si algo del mapa hubiera cambiado de verdad.
  const routeLine = useMemo(() => {
    const from = draft.origin.coordinates
    const to = draft.destination.coordinates
    return from && to ? { from, to } : null
  }, [draft.origin.coordinates, draft.destination.coordinates])

  const circle = useMemo(
    () =>
      polygon
        ? null
        : coverageCenter
          ? { center: coverageCenter, radiusKm: coverageRadiusKm }
          : null,
    [polygon, coverageCenter, coverageRadiusKm],
  )

  if (!open || !loaded || !bounds) return null

  const isPinDrop = step === 'pin-drop'
  const isPinNote = step === 'pin-note'
  const center = isPinDrop ? (pinCoords ?? coverageCenter) : coverageCenter
  if (!center) return null

  return (
    <>
      <div
        /*
         * `z-50`, NO `z-0`. `app/entregas/page.tsx` pinta su propio mapa del
         * directorio a pantalla completa con `z-30` (y su botón de volver con
         * `z-40`) y NO se desmonta solo porque este flujo se abra encima —
         * tocar "Pedir entrega" desde la ficha de un negocio en esa vista deja
         * el mapa del directorio montado debajo. Con `z-0` este mapa persistente
         * quedaba TAPADO por el del directorio; `z-50` lo gana sin acercarse a
         * `PinDropOverlay` (70) ni a `BottomSheet` (80).
         */
        className={isPinNote ? 'fixed inset-x-0 top-0 z-50 overflow-hidden' : 'fixed inset-0 z-50'}
        style={isPinNote ? { height: PIN_NOTE_MAP_HEIGHT } : undefined}
      >
        <MapCanvas
          center={center}
          interactive={!isPinNote}
          mode={mode}
          polygon={polygon}
          circle={circle}
          bounds={bounds}
          landmarks={landmarks}
          showPin={isPinDrop}
          flyTarget={isPinDrop ? pinFlyTarget : undefined}
          flyToken={pinFlyToken}
          onSettle={isPinDrop ? handleSettle : undefined}
          onMovingChange={isPinDrop ? handleMoving : undefined}
          routePins={routePins}
          routeLine={routeLine}
          fitToPins={fitToPins}
        />
      </div>

      {isPinDrop && (
        <PinDropOverlay
          mode={mode}
          onModeChange={setMode}
          coach={pinCoach}
          onDismissCoach={() => setPinCoach(false)}
          moving={pinMoving}
          settled={pinSettled}
          inside={pinInside}
          locating={locating}
          locateError={locateError}
          onUseMyLocation={useMyLocation}
          onConfirm={() => pinCoords && confirmPinDrop(pinCoords, pinAccuracyM)}
          onCancel={cancelEditPoint}
        />
      )}
    </>
  )
}
