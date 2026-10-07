'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
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
      {/* `useSearchParams` sin `Suspense` haría que todo el layout dejara de
          renderizarse en el servidor. */}
      <Suspense fallback={null}>
        <EntregasLink />
      </Suspense>
      <TripDetailsSheet />
      <RouteSheet />
      <PinNoteSheet />
      <ConfirmSheet />
      <TrackingSheet />
    </>
  )
}

/**
 * `tindivo.com/entregas` redirige al inicio con `?entregas` (y `&lugar=` si es
 * el enlace de una tienda): aquí se abre el flujo y se limpia la URL, para que
 * recargar o volver atrás no lo abra otra vez.
 *
 * Escucha la URL y no solo la lee al montar: este host vive en el layout y no
 * se vuelve a montar, así que una navegación DENTRO de la app hacia
 * `/entregas` no abría nada. Limpiar la URL cambia los parámetros y vuelve a
 * correr el efecto, que ya no encuentra `entregas`: cada intención se consume
 * una sola vez.
 */
function EntregasLink() {
  const params = useSearchParams()
  useEffect(() => {
    if (!params.has('entregas')) return
    const placeId = params.get('lugar')
    const rest = new URLSearchParams(params.toString())
    rest.delete('entregas')
    rest.delete('lugar')
    const query = rest.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
    void openCourierFlow({ placeId })
  }, [params])
  return null
}
