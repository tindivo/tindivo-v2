'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Tracking } from '@/features/tracking/types'
import { sePuedeOfrecer } from '@/lib/push'

/**
 * Lo que espera la hoja antes de aparecer.
 *
 * No es una animación: es que el cliente vea DÓNDE está antes de que le tapen
 * la pantalla. Una hoja modal en el primer frame de una página que aún no ha
 * leído se descarta por reflejo, y ese reflejo cuesta el permiso para siempre.
 */
const RETARDO_MS = 1500

export interface PushOffer {
  abierta: boolean
  cerrar: () => void
}

/**
 * Cuándo ofrecer el permiso de notificaciones, y a quién.
 *
 * EL MOMENTO. Aquí, en el seguimiento de un pedido vivo, y no al entrar a la
 * app. Es el único instante en que la pregunta se contesta sola: el cliente
 * acaba de pedir, está mirando una pantalla que dice «esperando al
 * restaurante», y lo que más quiere saber es cómo se va a enterar. Antes se
 * pedía con un botón flotante en cualquier página, sin decir para qué.
 *
 * SOLO AL DUEÑO (`ownedId`). El enlace del seguimiento se comparte por
 * WhatsApp y lo abre gente sin sesión; a esos no se les puede ofrecer nada,
 * porque `POST /push/subscriptions` va autenticado y la suscripción no tendría
 * a quién colgarse. Además gastaría el permiso del navegador de un tercero por
 * un pedido que no es suyo.
 *
 * SOLO CON EL PEDIDO VIVO. En `delivered` o `cancelled` ya no queda nada que
 * avisar, y pedir un permiso justo cuando el motivo se acabó es la peor versión
 * de la pregunta.
 *
 * El resto de la política —una vez por pedido, tope de descartes— vive en
 * `sePuedeOfrecer`, que es quien conoce la memoria.
 */
export function usePushOffer(data: Tracking | null, ownedId: string | null): PushOffer {
  const [abierta, setAbierta] = useState(false)

  const shortId = data?.shortId ?? ''
  const vivo = Boolean(data) && data?.status !== 'delivered' && data?.status !== 'cancelled'

  useEffect(() => {
    if (!ownedId || !shortId || !vivo) return
    if (!sePuedeOfrecer(shortId)) return

    const id = setTimeout(() => {
      // Con la pestaña oculta la hoja se abriría a espaldas del cliente y se
      // encontraría un modal al volver, sin el contexto que lo justifica.
      if (document.visibilityState === 'visible') setAbierta(true)
    }, RETARDO_MS)
    return () => clearTimeout(id)
    // Sin guarda de "ya ofrecido": las dos salidas de la hoja dejan
    // `sePuedeOfrecer` en false (una anota el descarte, la otra cambia el
    // permiso del navegador), así que no puede reabrirse sola.
  }, [ownedId, shortId, vivo])

  return { abierta, cerrar: useCallback(() => setAbierta(false), []) }
}
