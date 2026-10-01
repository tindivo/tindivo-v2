'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export interface CourierServiceStatus {
  enabled: boolean
  openNow: boolean
  hours: { start: string; end: string; days?: number[] } | null
  price: number
  pausedMessage: string | null
}

const FALLBACK: CourierServiceStatus = {
  enabled: false,
  openNow: false,
  hours: { start: '18:00', end: '23:00' },
  price: 3,
  pausedMessage: null,
}

/**
 * Cuánto vale una respuesta antes de volver a preguntar. Igual que el
 * `revalidate: 15` del home en el servidor: el estado cambia al abrir/cerrar
 * el horario o al conectarse un motorizado, no a cada segundo.
 */
const TTL_MS = 15_000

let cached: { status: CourierServiceStatus; at: number } | null = null
let inFlight: Promise<CourierServiceStatus> | null = null

/**
 * Una sola petición para todos. El home, `/entregas`, «Confirma tu pedido» y
 * los detalles del viaje leen este estado, a veces en la misma pantalla; antes
 * cada uno disparaba su propio `GET /public/courier/status`.
 */
function fetchStatus(): Promise<CourierServiceStatus> {
  if (cached && Date.now() - cached.at < TTL_MS) return Promise.resolve(cached.status)
  inFlight ??= api
    .get<CourierServiceStatus>('/public/courier/status')
    .then((status) => {
      cached = { status, at: Date.now() }
      return status
    })
    .catch(() => cached?.status ?? FALLBACK)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/**
 * Estado de Tindivo Entregas sin sesión — para pintar el precio/horario antes
 * de iniciar sesión.
 *
 * `initial` lo trae el servidor (`app/page.tsx`): con él, el home pinta las
 * tarjetas en el primer HTML en vez de hacerlas aparecer y empujar la lista
 * hacia abajo cuando llega la respuesta.
 */
export function useCourierStatus(initial?: CourierServiceStatus | null) {
  // Lo del servidor se PINTA, pero no se guarda como fresco: puede venir de su
  // caché de 15 s y, sumado a la nuestra, la card seguía «Abre a las 6 pm»
  // hasta medio minuto después de abrir. El navegador siempre vuelve a
  // preguntar al montar.
  const [status, setStatus] = useState<CourierServiceStatus | null>(
    () => cached?.status ?? initial ?? null,
  )

  useEffect(() => {
    let on = true
    void fetchStatus().then((s) => {
      if (on) setStatus(s)
    })
    return () => {
      on = false
    }
  }, [])

  return { status: status ?? FALLBACK, loading: status === null }
}
