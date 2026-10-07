'use client'

import { useEffect } from 'react'
import { useOnboarding } from '@/lib/onboarding-store'
import { openCourierFlow, resumeCourierAfterLogin } from '../lib/open-flow'
import { ConfirmSheet } from './confirm-sheet'
import { PinNoteSheet } from './map/pin-note-sheet'
import { RouteSheet } from './route-sheet'
import { TrackingSheet } from './tracking-sheet'
import { TripDetailsSheet } from './trip-details-sheet'

/**
 * Isla montada en `app/layout.tsx`, junto a `AuthOnboardingHost`/`BottomNav`
 * (mismo patrón): renderiza la hoja activa del store global de Tindivo
 * Entregas, para que cualquier botón "Pedir entrega" de la app —ficha del
 * negocio, directorio, home— pueda abrirla sin que una feature importe otra.
 */
export function CourierHost() {
  // `tindivo.com/entregas` redirige aquí con `?entregas` (y `&lugar=` si es el
  // enlace de una tienda): se abre el flujo y se limpia la URL, para que
  // recargar o volver atrás no lo abra otra vez.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('entregas')) return
    const placeId = params.get('lugar')
    params.delete('entregas')
    params.delete('lugar')
    const rest = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`,
    )
    void openCourierFlow({ placeId })
  }, [])

  // Vuelta del login pedido al entrar a Entregas (ver `open-flow.ts`): al montar
  // —regreso de Google, que recarga— y cada vez que se cierra la hoja de login
  // —correo, sin recarga—. El retraso deja que el onboarding de Google reabra
  // antes sus pasos pendientes (nombre, celular), para no abrir encima.
  useEffect(() => {
    const t = setTimeout(() => void resumeCourierAfterLogin(), 800)
    const unsub = useOnboarding.subscribe((s, prev) => {
      if (prev.open && !s.open) void resumeCourierAfterLogin()
    })
    return () => {
      clearTimeout(t)
      unsub()
    }
  }, [])

  return (
    <>
      <TripDetailsSheet />
      <RouteSheet />
      <PinNoteSheet />
      <ConfirmSheet />
      <TrackingSheet />
    </>
  )
}
