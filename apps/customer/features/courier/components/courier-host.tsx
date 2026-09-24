'use client'

import { ConfirmSheet } from './confirm-sheet'
import { PinNoteSheet } from './map/pin-note-sheet'
import { RouteSheet } from './route-sheet'
import { TrackingSheet } from './tracking-sheet'
import { TripDetailsSheet } from './trip-details-sheet'
import { TripItemsSheet } from './trip-items-sheet'
import { TripPayerSheet } from './trip-payer-sheet'

/**
 * Isla montada en `app/layout.tsx`, junto a `AuthOnboardingHost`/`BottomNav`
 * (mismo patrón): renderiza la hoja activa del store global de Tindivo
 * Entregas, para que cualquier botón "Pedir entrega" de la app —ficha del
 * negocio, directorio, home— pueda abrirla sin que una feature importe otra.
 */
export function CourierHost() {
  return (
    <>
      <TripDetailsSheet />
      <TripPayerSheet />
      <TripItemsSheet />
      <RouteSheet />
      <PinNoteSheet />
      <ConfirmSheet />
      <TrackingSheet />
    </>
  )
}
