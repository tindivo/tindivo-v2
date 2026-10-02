'use client'

import type { LatLngBoundsExpression } from 'leaflet'
import { memo, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, MapContainer, Polygon, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { type Landmark, type LatLng, type RoutePin, STREET_TILES } from '@tindivo/map'
import { FitBounds, LandmarkLayer, RouteLineLayer, RoutePinLayer } from '@tindivo/map/leaflet'

// Re-exportados: el resto del cliente los importa desde aquí desde antes de
// que vivieran en `@tindivo/map`.
export type { LatLng, RoutePin, RoutePinVariant } from '@tindivo/map'

export type MapMode = 'street' | 'satellite'

export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

/**
 * SUTIL A PROPÓSITO. El pin y el botón "Sí, aquí es mi puerta" son lo que
 * manda en esta pantalla; el polígono solo informa de fondo, en tercer nivel.
 * Antes llevaba el trazo a opacidad plena (1.0) y un relleno al 10% — se leía
 * como el elemento principal del mapa, compitiendo con el pin por la mirada.
 * El 0.55 de trazo es la sensibilidad medida en la reseña que motivó aquel
 * cambio, no una intuición nueva, y por eso no se redondea por gusto.
 *
 * SIN RELLENO (`fill: false`), y eso es posterior. El relleno tenue que quedó
 * de aquella reseña seguía tiñendo el pueblo entero de naranja pálido, y sobre
 * el satélite —donde el trabajo es reconocer un techo— tapaba justo la señal
 * que se está buscando. El contorno solo dice lo mismo: dentro sí, fuera no.
 */
const ZONE_STYLE = {
  color: 'var(--color-brand)',
  weight: 2,
  opacity: 0.55,
  fill: false,
} as const

/**
 * Dos fondos para el mismo mapa, y los dos sirven para algo distinto.
 *
 * OSM tiene San Jacinto mejor mapeado de lo que uno esperaría —calles con
 * nombre, la Posta Médica—, así que la vista de calles orienta bien y es la que
 * abre por defecto. Lo que no hace es decirte CUÁL es tu casa: eso solo lo
 * resuelve la foto, donde la gente reconoce su propio techo.
 */

const TILES: Record<
  MapMode,
  { url: string; attribution: string; maxNativeZoom: number; subdomains?: string }
> = {
  street: {
    /*
     * CARTO POSITRON, NI EL OSM CRUDO NI VOYAGER. Los tres son el mismo OSM
     * —la misma geometría, las mismas calles— y lo que cambia es el estilo.
     *
     * El OSM estándar pinta cada categoría de calle de un color distinto
     * (amarillo, naranja, blanco) con trazos gruesos y rótulos grandes: es un
     * mapa hecho para leerse SOLO. Aquí el mapa es el FONDO de una tarea
     * —colocar un pin en tu puerta— y compite con ella.
     *
     * Voyager fue el primer reemplazo y el problema fue otro: tira a beige, y
     * a zoom cerrado dibuja las calles en blanco roto sobre suelo blanco roto,
     * así que al ACERCARSE —justo cuando hay que afinar la puerta— la trama de
     * calles se desvanece. Se intentó arreglar con un filtro CSS y ahí está la
     * trampa que costó el rodeo: `hue-rotate`, que es lo único que enfría de
     * verdad un beige, gira la rueda ENTERA. El mismo giro que enfría las
     * manzanas manda el verde de los parques a lila y el azul del río a
     * naranja — medido en San Jacinto, el parque del noreste salía morado.
     *
     * Positron ya es lo que se estaba persiguiendo con el filtro: suelo gris
     * frío, calles blancas con contorno gris que SÍ se leen al acercar,
     * huellas de edificio visibles, y el agua y los parques en su color. Sin
     * filtro encima: nada que corregir, nada que mentir. Y como apenas dibuja
     * POIs propios, los únicos puntos de color del lienzo pasan a ser los
     * nuestros — que es de lo que va esta pantalla.
     *
     * El `?key=` YA NO es opcional: sin él CARTO sirve un letrero de «API KEY
     * REQUIRED» con HTTP 200. Sin la variable se cae a OpenStreetMap (ver
     * `lib/street-tiles.ts`); configúrala en el despliegue para volver a
     * Positron.
     *
     * `{r}` es el sufijo de retina de Leaflet, y sin `detectRetina` resuelve a
     * cadena vacía. Se deja escrito a propósito: activar retina aquí es un
     * cambio de una línea, pero DUPLICA los bytes de cada tile y esta pantalla
     * se abre sobre la cobertura móvil de un pueblo. Decisión de datos, no de
     * nitidez.
     */
    // Positron con key; OpenStreetMap sin ella (ver `lib/street-tiles.ts`).
    ...STREET_TILES,
    maxNativeZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imágenes &copy; Esri',
    /**
     * 17 Y NO MÁS. Medido contra el servicio, no supuesto: sobre San Jacinto,
     * World_Imagery devuelve foto de verdad hasta z17 (~21 KB por tile) y a
     * partir de z18 el MISMO placeholder de 2521 bytes que dice «Map data not
     * yet available». Lo sirve con HTTP 200, así que Leaflet lo da por bueno y
     * lo pinta: por eso acercarse llenaba la pantalla de ese texto en vez de
     * quedarse en la última foto buena. El servicio «Clarity» de Esri topa en
     * el mismo z17 (z18 ya es 404), o sea que no hay más resolución gratuita
     * disponible en la zona.
     *
     * Con `maxNativeZoom` en 17, Leaflet deja de pedir tiles que no existen y
     * escala el z17 para z18/z19. Se ve más blando al acercar, pero se sigue
     * viendo el techo — que es de lo que va esta capa.
     */
    maxNativeZoom: 17,
  },
}

const SATELLITE_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

/**
 * Marca que el gesto lo hizo una persona.
 *
 * `moveend` no distingue un arrastre del dedo de un `flyTo` del botón de GPS, y
 * la diferencia importa: si el punto viene del GPS la precisión medida sigue
 * siendo válida, y si lo movió el dedo ya no. Leaflet no lo dice, así que se
 * escucha el evento crudo del contenedor. `FlyTo` limpia la marca antes de
 * volar, de modo que un movimiento programático nunca se cuela como manual.
 */
function GestureWatch({ gestureRef }: { gestureRef: RefObject<boolean> }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    const mark = () => {
      gestureRef.current = true
    }
    el.addEventListener('touchstart', mark, { passive: true })
    el.addEventListener('mousedown', mark, { passive: true })
    el.addEventListener('wheel', mark, { passive: true })
    return () => {
      el.removeEventListener('touchstart', mark)
      el.removeEventListener('mousedown', mark)
      el.removeEventListener('wheel', mark)
    }
  }, [map, gestureRef])
  return null
}

/**
 * El pin NO se arrastra: está clavado en el centro del lienzo y lo que se mueve
 * es el mapa. La coordenada elegida es siempre `map.getCenter()`, y se reporta
 * al posarse (`moveend`), no en cada frame.
 */
function CenterTracker({
  gestureRef,
  onSettle,
  onMovingChange,
}: {
  gestureRef: RefObject<boolean>
  onSettle: (c: LatLng, byUser: boolean) => void
  onMovingChange: (moving: boolean) => void
}) {
  const map = useMapEvents({
    movestart: () => onMovingChange(true),
    moveend: () => {
      onMovingChange(false)
      const c = map.getCenter()
      const byUser = gestureRef.current
      gestureRef.current = false
      onSettle({ lat: c.lat, lng: c.lng }, byUser)
    },
  })
  return null
}

/** Vuela al objetivo cuando cambia el token (botón de GPS). */
function FlyTo({
  target,
  token,
  gestureRef,
  instant = false,
}: {
  target: LatLng
  token: number
  gestureRef: RefObject<boolean>
  instant?: boolean
}) {
  const map = useMap()
  // `-1`: mismo motivo que en `FitBounds` — `FlyTo` solo monta cuando
  // `flyTarget` existe, y `flyTarget`+`flyToken` suelen setearse juntos (el
  // GPS automático del pin-drop hace ambos en el mismo callback), así que
  // puede montar ya con `token` en 1 y tragarse el primer vuelo si se siembra
  // el ref con ese mismo valor.
  const last = useRef(-1)
  useEffect(() => {
    if (token === last.current) return
    last.current = token
    gestureRef.current = false
    const zoom = Math.max(map.getZoom(), 17)
    if (instant) {
      map.setView([target.lat, target.lng], zoom, { animate: false })
      return
    }
    map.flyTo([target.lat, target.lng], zoom, { animate: true, duration: 0.9 })
  }, [token, target, map, gestureRef, instant])
  return null
}

/** Solo para la vista previa (no interactiva): sigue al punto elegido sin animar. */
function Follow({ center }: { center: LatLng }) {
  const map = useMap()
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false })
  }, [center, map])
  return null
}

/**
 * Leaflet mide el contenedor al montar. Dentro de un bottom-sheet que todavía
 * está animando, esa medida sale mal y los tiles quedan a medio pintar.
 */
function InvalidateSize({ observe = false }: { observe?: boolean }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    const t1 = setTimeout(() => map.invalidateSize(), 150)
    const t2 = setTimeout(() => map.invalidateSize(), 450)
    // Opt-in: un lienzo cuyo alto lo manda otro componente (Tindivo Entregas
    // recorta el mapa al panel de abajo) tiene que re-medirse solo. Leaflet
    // conserva el centro geográfico al re-medir, así que el pin no se mueve.
    const el = map.getContainer()
    const ro = observe ? new ResizeObserver(() => map.invalidateSize()) : null
    ro?.observe(el)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      ro?.disconnect()
    }
  }, [map, observe])
  return null
}

/**
 * Las dos curvas del pin, con nombre porque se usan en la sombra y en la gota
 * y tienen que ir sincronizadas: si una rebota y la otra no, la sombra
 * adelanta a su propia gota.
 *
 * Al DESPEGAR se sale rápido y se frena (`SALIDA`): el pin tiene que estar
 * arriba antes de que el dedo haya movido el mapa medio centímetro, o el gesto
 * se siente pegajoso. Al POSARSE rebota (`REBOTE`, un cubic-bezier que se pasa
 * de 1): es lo que da la sensación de peso, y es el momento en que el vecino
 * mira si el pin cayó en su puerta.
 */
const SALIDA = 'cubic-bezier(0.25, 1, 0.5, 1)'
const REBOTE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/**
 * El pin, dibujado FUERA de Leaflet.
 *
 * Va en el wrapper y no como `Marker` a propósito: un marcador vive en el panel
 * del mapa y se desplaza con él, y aquí lo que tiene que quedarse absolutamente
 * quieto es el pin. La sombra se queda clavada en el punto exacto mientras la
 * gota despega: eso es lo que comunica que el mapa se mueve por debajo.
 */
function CenterPin({
  moving,
  variant = 'origin',
}: {
  moving: boolean
  variant?: 'origin' | 'destination'
}) {
  const dark = variant === 'destination'
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 z-[700]"
      style={{
        transform: 'translate3d(-50%, -50%, 0)',
        WebkitTransform: 'translate3d(-50%, -50%, 0)',
      }}
    >
      {/*
        LA SOMBRA SE QUEDA, LA GOTA DESPEGA. Es lo único que comunica que lo
        que se mueve es el mapa y no el pin: la sombra está clavada en la
        coordenada, así que verla separarse de la punta es ver el suelo correr
        por debajo.

        SOLO SE ANIMAN `transform` Y `opacity`, que el compositor resuelve sin
        volver a maquetar. Animar `width`/`height` —como se hacía— obliga a un
        reflow por fotograma justo mientras el dedo arrastra el mapa, que es el
        único momento en que esta pantalla tiene que ir fina.
      */}
      <span
        className="absolute rounded-[50%]"
        style={{
          width: 22,
          height: 8,
          left: '50%',
          top: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(15, 23, 42, 0.42) 0%, rgba(15, 23, 42, 0) 75%)',
          transform: `translate3d(-50%, -50%, 0) scale(${moving ? 0.62 : 1})`,
          opacity: moving ? 0.28 : 0.65,
          transition: 'transform 300ms, opacity 300ms',
          transitionTimingFunction: moving ? SALIDA : REBOTE,
        }}
      />
      {/* La gota, con rebote al posarse. */}
      <div
        className="absolute will-change-transform"
        style={{
          left: '50%',
          bottom: 0,
          transform: `translate3d(-50%, ${moving ? -14 : 0}px, 0) scale(${moving ? 1.08 : 1})`,
          transition: 'transform 300ms',
          transitionTimingFunction: moving ? SALIDA : REBOTE,
        }}
      >
        <svg
          width="36"
          height="46"
          viewBox="0 0 34 44"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
          className="drop-shadow-[0_4px_10px_rgba(249,115,22,0.35)]"
        >
          <title>Punto de entrega</title>
          <defs>
            <linearGradient id="tindivoPinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={dark ? '#3f4751' : '#fb923c'} />
              <stop offset="100%" stopColor={dark ? '#0f172a' : '#ea580c'} />
            </linearGradient>
          </defs>
          <path
            d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z"
            fill="url(#tindivoPinGrad)"
            stroke="#ffffff"
            strokeWidth="2.5"
          />
          <circle cx="17" cy="16" r="5" fill="#ffffff" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Lienzo de mapa con el pin fijo al centro. Cargar SOLO vía `next/dynamic` con
 * `ssr: false` (Leaflet toca `window` al importarse).
 *
 * `interactive: false` deja el lienzo inerte: es lo que permite incrustar la
 * vista previa dentro de un formulario con scroll sin que el mapa se coma el
 * gesto del dedo.
 */
function MapCanvas({
  center,
  interactive,
  mode,
  polygon,
  circle,
  bounds,
  flyTarget,
  flyToken = 0,
  flyInstant = false,
  onSettle,
  onMovingChange,
  zoom = 17,
  minZoom = 14,
  showPin = true,
  landmarks = [],
  routePins = [],
  routeLine,
  fitToPins,
  observeResize = false,
  pinVariant = 'origin',
}: {
  center: LatLng
  interactive: boolean
  mode: MapMode
  polygon: LatLng[] | null
  circle: { center: LatLng; radiusKm: number } | null
  bounds: MapBounds | null
  flyTarget?: LatLng
  flyToken?: number
  /** El vuelo de `flyTarget` es un salto sin animación (cambio de pantalla, no viaje). */
  flyInstant?: boolean
  onSettle?: (c: LatLng, byUser: boolean) => void
  onMovingChange?: (moving: boolean) => void
  zoom?: number
  minZoom?: number
  /**
   * Sin punto elegido NO se pinta el pin. Un pin naranja sobre el centro del
   * pueblo se lee como «ya está», y ese malentendido es justo el que hacía que
   * la gente guardara la plaza como su casa.
   */
  showPin?: boolean
  /**
   * Referencias del pueblo (`map_landmarks`). Ver `LandmarkLayer`: los
   * nombres solo se escriben en el lienzo interactivo, porque en la postal de
   * 180px no hay sitio para leerlos sin tapar el mapa entero.
   */
  landmarks?: readonly Landmark[]
  /** Puntos de una entrega (origen/destino/motorizado). Ver `RoutePinLayer`. */
  routePins?: readonly RoutePin[]
  /** Línea recta origen→destino cuando ambos puntos ya están fijados. Ver `RouteLineLayer`. */
  routeLine?: { from: LatLng; to: LatLng } | null
  /** Encuadra el mapa para que quepan estas coordenadas. Ver `FitBounds`. */
  fitToPins?: { coordinates: readonly LatLng[]; token: number; bottomInsetRatio?: number }
  /** Re-mide el lienzo cuando su contenedor cambia de tamaño (no solo al montar). */
  observeResize?: boolean
  /** Color del pin central: naranja = recojo (por defecto), oscuro = entrega. */
  pinVariant?: 'origin' | 'destination'
}) {
  const gestureRef = useRef(false)
  const [moving, setMoving] = useState(false)
  const tiles = TILES[mode]

  const maxBounds: LatLngBoundsExpression | undefined = useMemo(
    () =>
      bounds
        ? [
            [bounds.south, bounds.west],
            [bounds.north, bounds.east],
          ]
        : undefined,
    [bounds],
  )

  /*
   * EL ANILLO DE LA ZONA, MEMOIZADO, y no es cosmética.
   *
   * `positions` la compara react-leaflet por identidad igual que la `position`
   * de un marcador (ver `updatePolygon`), así que un `.map()` escrito dentro
   * del JSX significaba `setLatLngs()` en CADA render: Leaflet vuelve a
   * proyectar los vértices —hoy son 51— y reescribe el atributo `d` del path
   * SVG entero. Se pagaba al arrastrar, al abrir el sheet y en cada tecla que
   * alguien escribía en el formulario de dirección, sin que la zona de reparto
   * hubiera cambiado nunca. El polígono llega memoizado desde `MapPicker`, así
   * que esto se calcula una vez por sesión.
   */
  const anillo = useMemo(
    () => polygon?.map((p) => [p.lat, p.lng] as [number, number]) ?? null,
    [polygon],
  )

  const handleMoving = useCallback(
    (m: boolean) => {
      setMoving(m)
      onMovingChange?.(m)
    },
    [onMovingChange],
  )

  const handleSettle = useCallback(
    (c: LatLng, byUser: boolean) => onSettle?.(c, byUser),
    [onSettle],
  )

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={19}
        zoomControl={false}
        // MEDIDO, NO INTUIDO. Un trace de rendering (Tracing.start de CDP,
        // categorías `devtools.timeline`/`cc`, no el profiler de JS) durante
        // un zoom con rueda mostró 884 tareas de rasterizado en ~12 pasos:
        // cada paso de zoom animado crea/reemplaza nodos DOM reales (niveles
        // de tiles vía `_updateLevels`, iconos vía `createIcon`), y cada
        // mutación de esas invalida pintura y fuerza rasterizar de nuevo esa
        // zona — no es una transformación barata de algo ya dibujado. Eso
        // explica los tirones puntuales (peor frame: 286ms) más que una
        // lentitud pareja. Apagar la animación cambia el gesto de "acercarse
        // suave" a un salto instantáneo, pero elimina las ráfagas de repintado
        // intermedias — el zoom pasa de N repintados animados a 1 solo.
        zoomAnimation={false}
        attributionControl={interactive}
        // `maxBounds` + viscosidad 1 hace de pared dura: el mapa no deja salir
        // del pueblo. Antes se podía arrastrar el pin hasta Lima y lo único que
        // pasaba era un "fuera de la zona" sin salida.
        maxBounds={maxBounds}
        maxBoundsViscosity={1}
        dragging={interactive}
        touchZoom={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        className={`h-full w-full t-map-${mode} ${interactive ? '' : 'pointer-events-none'}`}
      >
        <TileLayer
          key={mode}
          url={tiles.url}
          attribution={tiles.attribution}
          maxNativeZoom={tiles.maxNativeZoom}
          maxZoom={19}
          subdomains={tiles.subdomains ?? 'abc'}
          // No pedir tiles de niveles intermedios mientras dura el gesto de zoom:
          // se piden al terminar. Es lo que Leaflet hace por defecto solo en móvil.
          updateWhenZooming={false}
        />
        {mode === 'satellite' && (
          // La capa de referencia sí responde hasta z19 (tiles de 872 bytes:
          // transparentes donde no hay nada que rotular), así que no necesita
          // el tope de la imagen.
          <TileLayer key="sat-labels" url={SATELLITE_LABELS} maxNativeZoom={19} maxZoom={19} />
        )}
        {anillo ? (
          <Polygon positions={anillo} pathOptions={ZONE_STYLE} />
        ) : circle ? (
          <Circle
            center={[circle.center.lat, circle.center.lng]}
            radius={circle.radiusKm * 1000}
            pathOptions={ZONE_STYLE}
          />
        ) : null}
        {/* Después de la zona y antes del pin: por orden de importancia y, de
            paso, por orden de pintado — las referencias quedan encima de la
            mancha de la zona y siempre por debajo del pin, que vive fuera de
            Leaflet. */}
        {landmarks.length > 0 && (
          <LandmarkLayer
            landmarks={landmarks}
            showLabels={interactive}
            interactivo={interactive}
            pines={routePins}
          />
        )}
        {fitToPins && (
          <FitBounds
            coordinates={fitToPins.coordinates}
            token={fitToPins.token}
            bottomInsetRatio={fitToPins.bottomInsetRatio}
          />
        )}
        {routeLine && <RouteLineLayer from={routeLine.from} to={routeLine.to} />}
        {routePins.length > 0 && <RoutePinLayer pins={routePins} />}
        <InvalidateSize observe={observeResize} />
        {interactive ? (
          <>
            <GestureWatch gestureRef={gestureRef} />
            <CenterTracker
              gestureRef={gestureRef}
              onSettle={handleSettle}
              onMovingChange={handleMoving}
            />
            {flyTarget && (
              <FlyTo
                target={flyTarget}
                token={flyToken}
                gestureRef={gestureRef}
                instant={flyInstant}
              />
            )}
          </>
        ) : (
          <Follow center={center} />
        )}
      </MapContainer>
      {showPin && <CenterPin moving={moving} variant={pinVariant} />}
    </div>
  )
}

/**
 * MEMOIZADO, y el motivo está fuera de este archivo.
 *
 * `MapPicker` vive dentro del formulario de dirección, y `address-sheet.tsx`
 * guarda ese formulario en un solo objeto que reemplaza entero en cada cambio
 * (`patch()` hace `{ ...a, ...p }`). Así que escribir una letra en "Dirección"
 * o en "Referencia" re-renderizaba este árbol completo — Leaflet incluido—
 * aunque `coords` no se hubiera tocado. Cada tecla costaba los `setLatLng()` de
 * todas las referencias y el re-trazado del anillo de la zona.
 *
 * Con las props ya estables aguas arriba (`bounds`, `circle` y `landmarks`
 * memoizados en `MapPicker`; `onSettle` y `onMovingChange` con `useCallback` en
 * `LocationSheet`), la comparación superficial de `memo` corta ese render en
 * seco: el mapa solo se vuelve a pintar cuando algo del mapa cambió.
 *
 * `next/dynamic` toma el `.default` de este módulo, y un componente memoizado
 * funciona igual ahí.
 */
export default memo(MapCanvas)
