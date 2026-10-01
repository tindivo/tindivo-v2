import type { LatLng } from './types'

/**
 * Un punto de ruta (origen/destino de una entrega) o la posición del
 * motorizado. A diferencia de `Landmark`, siempre se pinta con nombre y nunca
 * se cull-ea: son 1-3 por mapa, no 60.
 */
export type RoutePinVariant = 'origin' | 'destination' | 'driver'

export interface RoutePin {
  id: string
  coordinates: LatLng
  /** El nombre en el globo sobre el pin ("Elmer", "Tu casa"). */
  label?: string
  variant: RoutePinVariant
  /** Si existe, el globo con el nombre se puede tocar (el pin en sí no). */
  onTap?: () => void
}
