'use client'

import L, { type LatLngBoundsExpression } from 'leaflet'
import { useEffect, useRef } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import { escaparHtml } from './html'
import type { RoutePin } from './route-types'
import type { LatLng } from './types'

const ROUTE_PIN_COLOR: Record<'origin' | 'destination', string> = {
  // Mismo naranja que la gota de `CenterPin`: el origen es "tu puerta".
  origin: '#ea580c',
  destination: '#0f172a',
}

/**
 * El pin de un punto de ruta: gota + globo de nombre encima, siempre visible.
 *
 * `driver` no es una gota — es la píldora negra "Va a recoger" del diseño, con
 * el icono de Material Symbols ya usado en el resto de la app (`two_wheeler`
 * vía `--icon-glyph`, ver `packages/ui/src/theme.css`): así no hace falta
 * mantener un SVG de moto aparte solo para este marcador.
 */
function routePinIcono(pin: RoutePin): L.DivIcon {
  if (pin.variant === 'driver') {
    return L.divIcon({
      className: 't-route-pin',
      html:
        '<span class="t-route-driver" aria-hidden="true">' +
        '<span class="material-symbols-rounded" style="font-size:14px;line-height:14px;width:14px;height:14px;' +
        `font-variation-settings:'FILL' 1,'wght' 500,'GRAD' 0,'opsz' 20;--icon-glyph:'two_wheeler'"></span>` +
        (pin.label ? `<span class="t-route-driver-label">${escaparHtml(pin.label)}</span>` : '') +
        '</span>',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    })
  }

  const color = ROUTE_PIN_COLOR[pin.variant]
  return L.divIcon({
    className: pin.onTap ? 't-route-pin t-route-pin-tap' : 't-route-pin',
    html:
      (pin.label
        ? `<span class="t-route-pin-label" style="color:${color}">${escaparHtml(pin.label)}</span>`
        : '') +
      '<span class="t-route-pin-drop" aria-hidden="true">' +
      '<svg width="30" height="38" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg">' +
      `<path d="M17 2C9.3 2 3 8.2 3 15.9 3 26 17 42 17 42s14-16.1 14-26.1C31 8.2 24.7 2 17 2z" fill="${color}" stroke="#fff" stroke-width="2.5"/>` +
      '<circle cx="17" cy="16" r="5" fill="#fff"/>' +
      '</svg></span>',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

/** Pines de ruta (origen/destino/motorizado). Nunca se cull-ean ni se ocultan por zoom. */
export function RoutePinLayer({ pins }: { pins: readonly RoutePin[] }) {
  const cache = useRef(new Map<string, L.DivIcon>())

  return (
    <>
      {pins.map((pin) => {
        const clave = `${pin.id}|${pin.variant}|${pin.label ?? ''}|${pin.onTap ? 1 : 0}`
        let icon = cache.current.get(clave)
        if (!icon) {
          icon = routePinIcono(pin)
          cache.current.set(clave, icon)
        }
        return (
          <Marker
            key={pin.id}
            position={[pin.coordinates.lat, pin.coordinates.lng]}
            icon={icon}
            interactive={!!pin.onTap}
            keyboard={false}
            eventHandlers={pin.onTap ? { click: pin.onTap } : undefined}
          />
        )
      })}
    </>
  )
}

/**
 * Trazo recto entre origen y destino de una entrega. Discontinuo A PROPÓSITO:
 * no hay routing (Tindivo Entregas no calcula rutas reales), así que la línea
 * dice "más o menos por acá", no "este es el camino". Un trazo continuo se
 * leería como una ruta real y sería engañoso.
 */
const ROUTE_LINE_STYLE = {
  color: '#5C6368',
  weight: 3,
  opacity: 0.65,
  dashArray: '2 10',
  lineCap: 'round' as const,
}

export function RouteLineLayer({ from, to }: { from: LatLng; to: LatLng }) {
  return (
    <Polyline
      positions={[
        [from.lat, from.lng],
        [to.lat, to.lng],
      ]}
      pathOptions={ROUTE_LINE_STYLE}
      interactive={false}
    />
  )
}

/**
 * Encuadra el mapa para que quepan todos los pines dados. `token` es lo que
 * dispara el encuadre (mismo patrón que `FlyTo`): sin él, cada cambio de
 * identidad del array de coordenadas volvería a encuadrar en cada render.
 */
export function FitBounds({
  coordinates,
  token,
  bottomInsetRatio = 0,
}: {
  coordinates: readonly LatLng[]
  token: number
  bottomInsetRatio?: number
}) {
  const map = useMap()
  /*
   * `-1`, NO `token`. Este componente solo existe mientras `fitToPins` esté
   * definido (`{fitToPins && <FitBounds .../>}` en `MapCanvas`), así que
   * puede montarse por primera vez con `token` ya en 1 o más — courier's
   * "cargar el punto A en mi ubicación" dispara la primera coordenada
   * MIENTRAS el mapa todavía está cargando cobertura (`CourierMapHost` sigue
   * ejecutando sus hooks aunque su JSX sea `null`), y para cuando el mapa
   * por fin monta, `fitToken` ya venía en 1. Sembrar el ref CON el `token`
   * de esa primera vez hacía que `token === last.current` diera true de
   * entrada, y el encuadre inicial se descartaba en silencio — el pin
   * terminaba pintado en el sitio de siempre del mapa (nunca centrado),
   * verificado con Playwright. Un centinela que ningún token real puede
   * tener (empiezan en 0) garantiza que el primer montaje SIEMPRE encuadre.
   */
  const last = useRef(-1)
  useEffect(() => {
    if (token === last.current || coordinates.length === 0) return
    last.current = token
    // Una hoja tapa la parte de abajo del lienzo: el margen inferior extra
    // deja los pines en la franja que sí se ve (un solo pin también se centra
    // ahí, y `maxZoom` lo deja a la altura de un pin suelto).
    const bottom = Math.round(map.getSize().y * bottomInsetRatio)
    map.flyToBounds(coordinates.map((c) => [c.lat, c.lng]) as LatLngBoundsExpression, {
      paddingTopLeft: [56, 56],
      paddingBottomRight: [56, 56 + bottom],
      maxZoom: 17,
      animate: true,
      duration: 0.9,
    })
  }, [token, coordinates, bottomInsetRatio, map])
  return null
}
