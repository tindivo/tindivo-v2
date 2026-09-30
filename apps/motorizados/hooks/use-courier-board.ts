'use client'

import type { DriverCourierBoard } from '@tindivo/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { playCourierChime } from '@/lib/sound'

/**
 * Tablero de Tindivo Entregas: disponibles + mías, cada 15 s con la pestaña
 * visible. Un solo consumidor (`Home`), así que basta un hook y no un store de
 * módulo como `useTeam`.
 *
 * NO HAY AVISO EN SEGUNDO PLANO: con el celular bloqueado el poll se detiene.
 * Es una regla de operación del MVP (la app queda abierta en el turno y Jesús
 * avisa si una entrega lleva más de 2 min sin aceptar); el push está en
 * `Docs/Entregas/backlog-entregas.md`.
 *
 * DESFASADO 3 s del board de comida (7 s) y del de equipo (0 s): tres polls de
 * 15 s saliendo a la vez son una estampida gratuita con datos móviles.
 */
const POLL_MS = 15_000
const POLL_OFFSET_MS = 3_000

const EMPTY: DriverCourierBoard = { available: [], mine: [], maxActivePerDriver: 2 }

export function useCourierBoard() {
  const [board, setBoard] = useState<DriverCourierBoard>(EMPTY)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  // Ids ya vistos en «disponibles». `null` hasta la primera carga: lo que ya
  // estaba al abrir la app no suena, solo lo que llega después.
  const seen = useRef<Set<string> | null>(null)

  const refetch = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: DriverCourierBoard }>('/driver/courier-orders')
      if (!alive.current) return
      const ids = data.available.map((o) => o.id)
      if (seen.current && ids.some((id) => !seen.current?.has(id))) playCourierChime()
      seen.current = new Set(ids)
      setBoard(data)
    } catch {
      // Un fallo pasajero deja el último tablero bueno en pantalla; el
      // siguiente poll lo corrige.
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void refetch()
    let timer: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => {
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') void refetch()
      }, POLL_MS)
    }, POLL_OFFSET_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      clearTimeout(start)
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refetch])

  return { ...board, loading, refetch }
}
