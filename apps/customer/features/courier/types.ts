import type { CourierPayer } from '@tindivo/contracts'

/**
 * Pantallas de la hoja de Tindivo Entregas.
 *
 * El camino por defecto (sin negocio) es MAPA PRIMERO, inspirado en inDrive:
 * `pin-drop (A) → pin-drop (B) → trip-details → tracking`. `pin-drop` es el
 * mapa a pantalla completa con el pin fijo al centro ("arrastra el mapa, no el
 * pin") y, debajo, la referencia del punto en la misma pantalla;
 * `trip-details` es la ÚNICA pantalla de después: qué llevamos, de quién a
 * quién, quién paga, indicaciones y «Pedir entrega». Antes eran tres
 * (contactos, «¿Quién paga?», «¿Qué llevamos?») y el pedido se hacía largo.
 *
 * `route`/`confirm` son el camino de negocio (directorio) — se OCULTAN (ya no
 * son el default de `openSheet`) pero se mantienen funcionales para
 * retomarlos después. `pin-note` existe solo para ese camino, donde la
 * referencia se escribe en un paso aparte.
 */
export type CourierFlowStep =
  | 'pin-drop' // fijar el punto en el mapa (A o B) + su referencia
  | 'pin-note' // escribir cómo llegar — solo camino de negocio oculto
  | 'trip-details' // Qué llevamos · de quién a quién · quién paga — termina en "Pedir entrega"
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
  /** Indicaciones opcionales para el motorizado («Está a nombre de María…»). */
  driverNote: string
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
    driverNote: '',
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
