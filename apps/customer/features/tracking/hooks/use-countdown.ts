'use client'

import { useEffect, useMemo, useState } from 'react'
import { activeDeadline, type CountdownView, countdownView } from '@/features/tracking/lib/deadline'
import type { Tracking } from '@/features/tracking/types'

/**
 * El contador del plazo activo, refrescado cada segundo.
 *
 * El intervalo solo existe mientras hay plazo que contar: en `preparing` o
 * `ontheway` no hay ninguno y el hook no monta nada. Tampoco sigue latiendo tras
 * vencer — a partir de ahí el texto es fijo ("Confirmando…") y un tick por
 * segundo solo gastaría batería en el celular del cliente.
 *
 * `useMemo` sobre los tres campos del plazo, y no sobre `data`, porque
 * `useTracking` reemplaza el objeto entero cada 8 segundos con su poll: sin esto
 * el intervalo se desmontaría y volvería a montarse a ese ritmo.
 */
export function useCountdown(data: Tracking | null): CountdownView | null {
  const raw = data ? activeDeadline(data) : null
  const kind = raw?.kind ?? null
  const at = raw?.at ?? null
  const totalMs = raw?.totalMs ?? null

  const deadline = useMemo(
    () => (kind && at !== null && totalMs !== null ? { kind, at, totalMs } : null),
    [kind, at, totalMs],
  )

  const [view, setView] = useState<CountdownView | null>(null)

  useEffect(() => {
    if (!deadline) {
      setView(null)
      return
    }
    setView(countdownView(deadline))
    if (deadline.at <= Date.now()) return
    const id = setInterval(() => setView(countdownView(deadline)), 1000)
    return () => clearInterval(id)
  }, [deadline])

  return view
}
