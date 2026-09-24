import type { CourierPayer } from '@tindivo/contracts'

/**
 * Pantallas de la hoja de Tindivo Entregas.
 *
 * El camino por defecto (sin negocio, rediseño "Tu ruta" inspirado en
 * inDrive) es `trip → pin-drop → trip → pin-drop → trip-details →
 * trip-payer → trip-items → tracking`: `trip` arma los puntos A/B uno a la
 * vez (fila activa + "Listo" habilita el siguiente), `trip-details` es la
 * pantalla de confirmación con las dos tarjetas de ubicación/contacto,
 * `trip-payer` es el paso corto de "¿Quién paga?", `trip-items` es "¿Qué
 * llevamos?" con el checkbox final que dispara el pedido.
 *
 * `route`/`confirm` son el camino de negocio (directorio) — se OCULTAN (ya no
 * son el default de `openSheet`) pero se mantienen funcionales para
 * retomarlos después.
 *
 * `pin-drop` es el mapa a pantalla completa con el pin fijo al centro
 * ("arrastra el mapa, no el pin"). Desde `trip` no hay paso `pin-note`
 * aparte: la referencia se escribe inline en la fila del punto activo.
 * `pin-note` sigue existiendo solo para el camino de negocio oculto
 * (`confirm` vía `PointField`).
 */
export type CourierFlowStep =
  | 'trip' // Tu ruta: fila A/B, una a la vez
  | 'pin-drop' // fijar el punto en el mapa (A o B)
  | 'pin-note' // escribir cómo llegar — solo camino de negocio oculto
  | 'trip-details' // Dónde recogemos / Dónde entregamos (imagen 6)
  | 'trip-payer' // ¿Quién paga?
  | 'trip-items' // Qué llevamos (imágenes 8/9) — termina en "Pedir entrega"
  | 'route' // buscador de negocio — oculto, no es el default
  | 'confirm' // resumen cuando el origen es un negocio — oculto
  | 'tracking' // seguimiento tras crear la solicitud

export type CourierEditingPoint = 'origin' | 'destination'

export interface CourierPoint {
  contactName: string
  contactPhone: string
  coordinates: { lat: number; lng: number } | null
  accuracyM: number | null
  referenceText: string
  /** Presente solo si el punto vino de elegir un negocio del directorio. */
  directoryBusinessId?: string
  /** Nombre corto para las tarjetas ("Elmer", "Botica Santa Rosa"). */
  label?: string
}

export function emptyCourierPoint(): CourierPoint {
  return {
    contactName: '',
    contactPhone: '',
    coordinates: null,
    accuracyM: null,
    referenceText: '',
  }
}

/** Borrador en progreso de la solicitud — vive en el store mientras la hoja está abierta. */
export interface CourierDraft {
  origin: CourierPoint
  destination: CourierPoint
  itemDescription: string
  isFragile: boolean
  readyInMin: number
  payer: CourierPayer
  weightConfirmed: boolean
  prepaidConfirmed: boolean
}

export function emptyCourierDraft(): CourierDraft {
  return {
    origin: emptyCourierPoint(),
    destination: emptyCourierPoint(),
    itemDescription: '',
    isFragile: false,
    readyInMin: 0,
    payer: 'destination',
    weightConfirmed: false,
    prepaidConfirmed: false,
  }
}

export interface CourierOrderResult {
  id: string
  shortId: string
  orderNumber: number
  status: string
  feeAmount: number
  distanceM: number
}
