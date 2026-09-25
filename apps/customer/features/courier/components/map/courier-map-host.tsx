'use client'

import { toCourierTrackingStep } from '@tindivo/contracts'
import { Icon, Spinner } from '@tindivo/ui'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { boundsFor } from '@/components/map-picker'
import type { LatLng, MapBounds, MapMode, RoutePin } from '@/components/map-picker-inner'
import { getCoverage, getCoveragePolygon, haversineKm, pointInPolygon } from '@/lib/coverage'
import { GeolocationError, geoErrorMessage, getCurrentPositionHA } from '@/lib/geolocation'
import { getLandmarks, type Landmark } from '@/lib/landmarks'
import { useCourierTracking } from '../../hooks/use-courier-tracking'
import { useCourierStore } from '../../lib/store'
import type { CourierFlowStep, CourierPoint } from '../../types'
import { PinDropOverlay } from './pin-drop-overlay'

const MapCanvas = dynamic(() => import('@/components/map-picker-inner'), {
  ssr: false,
  loading: () => null,
})

/** Alto de la franja de mapa comprimida (Pedir-2b: escribir la referencia). */
const PIN_NOTE_MAP_HEIGHT = 220

/**
 * Alto que se reserva al panel del pin mientras todavía no se ha medido (la
 * primera pintura): cerca del real, para que el mapa no dé un salto al medirlo.
 */
const PIN_PANEL_ESTIMATE = 250

const OUTSIDE_MESSAGE = 'Estás fuera de San Jacinto. Mueve el mapa hasta el punto.'

const STEPS_WITH_ROUTE_PINS = new Set<CourierFlowStep>([
  'pin-drop',
  'trip-details',
  'trip-payer',
  'trip-items',
  'route',
  'pin-note',
  'confirm',
  'tracking',
])

function isPointComplete(point: CourierPoint) {
  return point.coordinates != null && point.referenceText.trim().length > 0
}

/**
 * El mapa de Tindivo Entregas: UNA sola instancia de `MapCanvas`, montada
 * mientras `useCourierStore.open` sea `true` y viva durante todo el flujo
 * (`pin-drop A → pin-drop B → trip-details → … → tracking`). Las hojas
 * (`TripDetailsSheet`, `ConfirmSheet`, etc.) flotan encima con `scrim={false}`
 * — este componente es lo que ven de fondo.
 */
export function CourierMapHost() {
  const open = useCourierStore((s) => s.open)
  const step = useCourierStore((s) => s.step)
  const draft = useCourierStore((s) => s.draft)
  const editingPoint = useCourierStore((s) => s.editingPoint)
  const returnStep = useCourierStore((s) => s.returnStep)
  const confirmPinDrop = useCourierStore((s) => s.confirmPinDrop)
  const cancelEditPoint = useCourierStore((s) => s.cancelEditPoint)
  const switchEditingPoint = useCourierStore((s) => s.switchEditingPoint)
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
  const [pinFlyTarget, setPinFlyTarget] = useState<LatLng | undefined>(undefined)
  const [pinFlyToken, setPinFlyToken] = useState(0)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [panelH, setPanelH] = useState(PIN_PANEL_ESTIMATE)

  const isInside = useCallback(
    (c: LatLng) => {
      if (polygon) return pointInPolygon(c, polygon)
      if (coverageCenter) return haversineKm(c, coverageCenter) <= coverageRadiusKm
      return true
    },
    [polygon, coverageCenter, coverageRadiusKm],
  )
  // Ref: el GPS responde segundos después y su `.then` ya no vería la cobertura
  // que llegó mientras tanto.
  const isInsideRef = useRef(isInside)
  isInsideRef.current = isInside
  const pinInside = useMemo(() => (pinCoords ? isInside(pinCoords) : true), [pinCoords, isInside])

  const [pinFlyInstant, setPinFlyInstant] = useState(false)
  // `instant`: pasar de A a B (o reabrir un punto) es cambiar de pantalla, no
  // viajar: sin animación el mapa ya está donde toca. Solo el GPS anima.
  const flyTo = useCallback((c: LatLng, instant = false) => {
    setPinFlyInstant(instant)
    setPinFlyTarget(c)
    setPinFlyToken((n) => n + 1)
  }, [])

  /*
   * Se re-siembra cada vez que el pin arranca para un punto (al entrar a
   * `pin-drop` o al pasar de A a B sin salir de él), no en cada render:
   *  - punto ya fijado → el mapa VUELA hasta él. Sin volar, el pin se veía en
   *    el centro del mapa (que sigue encuadrando la ruta) pero "Confirmar"
   *    guardaba la coordenada vieja, en otro sitio.
   *  - B sin fijar → arranca sobre A: el destino casi siempre queda cerca, y
   *    partir del centro del pueblo obligaba a cruzar el mapa entero.
   *  - A sin fijar → arranca en el centro del pueblo mientras se resuelve el
   *    GPS y, en cuanto llega, vuela ahí y lo da por asentado ("puedo mover el
   *    pin si quiero" = parte confirmable de una, sin arrastrar). Sin permiso
   *    o sin señal se queda ahí, a arrastrar a mano y en silencio: es un valor
   *    por defecto, no algo que la persona pidió, así que un fallo no merece
   *    un aviso de error.
   * `pinCoords` y el centro real del mapa tienen que coincidir siempre que se
   * pueda confirmar: por eso ningún camino asienta una coordenada a la que el
   * mapa no vaya a viajar.
   */
  const seededFor = useRef<string | null>(null)
  const gpsRun = useRef(0)
  useEffect(() => {
    const key = open && step === 'pin-drop' && editingPoint ? editingPoint : null
    if (key === seededFor.current) return
    seededFor.current = key
    gpsRun.current += 1
    if (!key) return

    const { draft: d } = useCourierStore.getState()
    const point = d[key]
    setPinMoving(false)
    setLocateError(null)
    setReference(point.referenceText)

    if (point.coordinates) {
      setPinAccuracyM(point.accuracyM)
      setPinCoords(point.coordinates)
      setPinSettled(true)
      setLocating(false)
      flyTo(point.coordinates, true)
      return
    }

    setPinAccuracyM(null)
    setPinSettled(false)
    const origin = key === 'destination' ? d.origin.coordinates : null
    if (origin) {
      // B nace a unos 30 m de A (hacia abajo, para no tapar el globo de A que
      // va arriba), no encima: así los dos pines se distinguen
      // desde el primer instante. Si ese desvío cayera fuera de la zona, sobre A.
      const shifted = { lat: origin.lat - 0.00025, lng: origin.lng + 0.0002 }
      const anchor = isInsideRef.current(shifted) ? shifted : origin
      setPinCoords(anchor)
      setLocating(false)
      flyTo(anchor, true)
      return
    }

    setPinCoords(coverageCenter)
    setLocating(true)
    const run = gpsRun.current
    getCurrentPositionHA()
      .then((fix) => {
        if (run !== gpsRun.current) return
        const c = { lat: fix.lat, lng: fix.lng }
        // Quien pide desde otra ciudad (para alguien de San Jacinto) no debe ver
        // el mapa volar a un lugar sin tiles ni zona de reparto: se queda en el
        // pueblo y se le dice por qué.
        if (!isInsideRef.current(c)) {
          setLocateError(OUTSIDE_MESSAGE)
          return
        }
        flyTo(c)
        setPinCoords(c)
        setPinAccuracyM(Math.round(fix.accuracyM))
        setPinSettled(true)
      })
      .catch(() => {})
      .finally(() => {
        if (run === gpsRun.current) setLocating(false)
      })
  }, [open, step, editingPoint, coverageCenter, flyTo])

  const handleSettle = useCallback((c: LatLng, byUser: boolean) => {
    setPinCoords(c)
    if (byUser) {
      // Si la persona ya movió el mapa a mano, un GPS que llegue tarde no puede
      // arrastrárselo de vuelta: lo que ella puso gana.
      gpsRun.current += 1
      setLocating(false)
      setPinAccuracyM(null)
      setLocateError(null)
      setPinSettled(true)
    }
  }, [])

  const handleMoving = useCallback((m: boolean) => {
    setPinMoving(m)
  }, [])

  const useMyLocation = useCallback(async () => {
    if (locating) return
    gpsRun.current += 1
    setLocating(true)
    setLocateError(null)
    try {
      const fix = await getCurrentPositionHA()
      const c = { lat: fix.lat, lng: fix.lng }
      if (!isInsideRef.current(c)) {
        setLocateError(OUTSIDE_MESSAGE)
        return
      }
      flyTo(c)
      setPinCoords(c)
      setPinAccuracyM(Math.round(fix.accuracyM))
      setPinSettled(true)
    } catch (err) {
      const code = err instanceof GeolocationError ? err.code : 'position_unavailable'
      setLocateError(geoErrorMessage(code))
    } finally {
      setLocating(false)
    }
  }, [locating, flyTo])

  const isPinDrop = step === 'pin-drop'
  const isPinNote = step === 'pin-note'
  // Ref: `routePins` es un memo y no debe rehacerse por una función nueva en
  // cada render; el globo del recojo llama a lo que haya en ese momento.
  const goToOriginRef = useRef<() => void>(() => {})
  // `PinDropOverlay` se lo pasa a `useDialogFocus`, que vuelve a enfocar el
  // diálogo cada vez que cambia su `onClose`: con una función nueva por render
  // el input perdía el foco al escribir una letra. Por eso la identidad es fija
  // y lo que hace se lee de un ref.
  const backRef = useRef<() => void>(() => {})
  const handleBack = useCallback(() => backRef.current(), [])

  const routePins = useMemo<RoutePin[]>(() => {
    if (!STEPS_WITH_ROUTE_PINS.has(step)) return []
    // El enlace público de seguimiento (`/entregas/[shortId]`) abre `tracking`
    // sin haber pasado por el flujo de pedir en esta sesión: `draft` nace
    // vacío, y las únicas coordenadas que existen son las que trae el RPC
    // `get_courier_tracking` (0234).
    const fromTracking = isTracking ? tracking : null
    // El punto que se está moviendo no se pinta aparte: su pin ES el del centro.
    const hideOrigin = isPinDrop && editingPoint === 'origin'
    const hideDestination = isPinDrop && editingPoint === 'destination'
    const originCoords = hideOrigin
      ? null
      : (draft.origin.coordinates ?? fromTracking?.originCoordinates ?? null)
    const destinationCoords = hideDestination
      ? null
      : (draft.destination.coordinates ?? fromTracking?.destinationCoordinates ?? null)

    const pins: RoutePin[] = []
    if (originCoords) {
      pins.push({
        id: 'origin',
        coordinates: originCoords,
        label:
          draft.origin.label ||
          draft.origin.referenceText.trim() ||
          draft.origin.contactName ||
          fromTracking?.originName ||
          'Recojo',
        variant: 'origin',
        // En el paso 2, tocar el globo del recojo vuelve al paso 1.
        onTap:
          hideDestination && returnStep === 'trip-details'
            ? () => goToOriginRef.current()
            : undefined,
      })
    }
    if (destinationCoords) {
      pins.push({
        id: 'destination',
        coordinates: destinationCoords,
        label:
          draft.destination.label ||
          draft.destination.referenceText.trim() ||
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
  }, [
    step,
    isTracking,
    isPinDrop,
    editingPoint,
    returnStep,
    draft.origin,
    draft.destination,
    tracking,
  ])

  // `fitToPins` necesita un token que cambie SOLO cuando el conjunto de pines
  // cambia de verdad — no en cada render de `CourierMapHost` — o el mapa
  // volvería a encuadrar en cada tecla que alguien escriba en una hoja. La
  // marca de fase hace que salir de `pin-drop` (donde no se encuadra: el mapa
  // lo manda el dedo) vuelva a encuadrar la ruta ya completa.
  const [fitToken, setFitToken] = useState(0)
  const pinsKeyRef = useRef('')
  const pinsKey = `${isPinDrop ? 'drop' : 'view'}#${routePins
    .map((p) => `${p.id}:${p.coordinates.lat.toFixed(5)},${p.coordinates.lng.toFixed(5)}`)
    .join('|')}`
  useEffect(() => {
    if (pinsKey === pinsKeyRef.current) return
    pinsKeyRef.current = pinsKey
    if (routePins.length > 0) setFitToken((n) => n + 1)
  }, [pinsKey, routePins.length])
  // Las hojas de después del mapa tapan la mitad de abajo: el encuadre reserva
  // ese espacio para que los pines no queden debajo de ellas.
  const fitToPins = useMemo(
    () =>
      routePins.length > 0 && !isPinDrop
        ? {
            coordinates: routePins.map((p) => p.coordinates),
            token: fitToken,
            bottomInsetRatio: isPinNote ? 0 : 0.5,
          }
        : undefined,
    [routePins, fitToken, isPinDrop, isPinNote],
  )

  // Línea recta A→B: solo cuando AMBOS puntos ya están fijados y ninguno se
  // está moviendo. `useMemo` (no un literal inline) por el mismo motivo que
  // `fitToPins` — `MapCanvas` está memoizado y un objeto nuevo en cada render
  // lo invalidaría igual que si algo del mapa hubiera cambiado de verdad.
  const routeLine = useMemo(() => {
    if (isPinDrop) return null
    const from = draft.origin.coordinates
    const to = draft.destination.coordinates
    return from && to ? { from, to } : null
  }, [isPinDrop, draft.origin.coordinates, draft.destination.coordinates])

  const circle = useMemo(
    () =>
      polygon
        ? null
        : coverageCenter
          ? { center: coverageCenter, radiusKm: coverageRadiusKm }
          : null,
    [polygon, coverageCenter, coverageRadiusKm],
  )

  if (!open) return null

  // Sin esto, entre tocar "Pedir entrega" y que lleguen la cobertura y el
  // chunk de Leaflet no había NADA en pantalla (ya no hay una hoja delante).
  if (!loaded || !bounds) {
    if (!isPinDrop) return null
    return <MapLoading onCancel={cancelEditPoint} />
  }

  const center = isPinDrop ? (pinCoords ?? coverageCenter) : coverageCenter
  if (!center) return null

  const guided = isPinDrop && returnStep === 'trip-details' && editingPoint != null
  const stepIndex: 1 | 2 | null =
    guided && !(isPointComplete(draft.origin) && isPointComplete(draft.destination))
      ? editingPoint === 'origin'
        ? 1
        : 2
      : null

  // Del paso 2 al 1 sin salir del mapa. Lo ya avanzado en B (referencia y, si el
  // pin estaba asentado dentro de la zona, su coordenada) se guarda para que al
  // volver a B siga donde estaba.
  const goToOrigin = () => {
    const keepPin = pinSettled && pinInside && pinCoords != null
    switchEditingPoint('origin', {
      referenceText: reference,
      ...(keepPin ? { coordinates: pinCoords, accuracyM: pinAccuracyM } : {}),
    })
  }
  goToOriginRef.current = goToOrigin
  backRef.current = stepIndex === 2 ? goToOrigin : cancelEditPoint

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
         *
         * En `pin-drop` el mapa termina donde empieza el panel del pin, de modo
         * que el pin fijo (el centro del lienzo) queda en el centro de lo que
         * se ve, no escondido detrás de la tarjeta.
         */
        className={`fixed inset-x-0 top-0 z-50 overflow-hidden bg-[#f4f3ef] ${isPinDrop || isPinNote ? '' : 'bottom-0'}`}
        style={
          isPinNote ? { height: PIN_NOTE_MAP_HEIGHT } : isPinDrop ? { bottom: panelH } : undefined
        }
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
          flyInstant={pinFlyInstant}
          onSettle={isPinDrop ? handleSettle : undefined}
          onMovingChange={isPinDrop ? handleMoving : undefined}
          routePins={routePins}
          routeLine={routeLine}
          fitToPins={fitToPins}
          observeResize
          pinVariant={editingPoint === 'destination' ? 'destination' : 'origin'}
        />
      </div>

      {isPinDrop && editingPoint && (
        <PinDropOverlay
          mode={mode}
          onModeChange={setMode}
          point={editingPoint}
          guided={guided}
          stepIndex={stepIndex}
          reference={reference}
          onReferenceChange={setReference}
          moving={pinMoving}
          settled={pinSettled}
          inside={pinInside}
          locating={locating}
          locateError={locateError}
          onUseMyLocation={useMyLocation}
          onConfirm={(ref) => pinCoords && confirmPinDrop(pinCoords, pinAccuracyM, ref)}
          onCancel={handleBack}
          onPanelHeight={setPanelH}
        />
      )}
    </>
  )
}

function MapLoading({ onCancel }: { onCancel: () => void }) {
  return (
    <div
      role="status"
      aria-label="Cargando el mapa"
      className="fixed inset-0 z-70 flex flex-col items-center justify-center gap-3 bg-[#f4f3ef]"
    >
      <button
        type="button"
        onClick={onCancel}
        aria-label="Volver"
        className="absolute top-3 left-3 flex h-11 w-11 items-center justify-center rounded-full bg-card text-ink shadow-elev-3 border border-ink/[0.06] pt-[env(safe-area-inset-top)]"
      >
        <Icon name="arrow_back" size={22} />
      </button>
      <Spinner size="md" variant="brand" />
      <p className="text-[14px] font-semibold text-ink-muted">Cargando el mapa…</p>
    </div>
  )
}
