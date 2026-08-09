'use client'

import { useEffect, useRef } from 'react'

/**
 * Dispara beep + vibración cuando aparece un nuevo pedido en tier `overdue`
 * (zona roja). Da feedback audible/háptico inmediato al repartidor con la app abierta.
 */
export function useOverdueFeedback(overdueIds: Set<string>) {
  const seenRef = useRef<Set<string>>(new Set())
  const primedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!primedRef.current) {
      primedRef.current = true
      for (const id of overdueIds) seenRef.current.add(id)
      return
    }

    const fresh: string[] = []
    for (const id of overdueIds) {
      if (!seenRef.current.has(id)) fresh.push(id)
    }
    if (fresh.length === 0) return
    for (const id of fresh) seenRef.current.add(id)

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([400, 150, 400, 150, 400])
      }
    } catch {
      // Ignorar si no soporta vibración
    }

    try {
      playAlertBeep()
    } catch {
      // Ignorar si autoplay está bloqueado por el navegador
    }
  }, [overdueIds])
}

/**
 * Beep doble estilo "alerta" usando Web Audio API sin assets binarios.
 */
function playAlertBeep(): void {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return

  const ctx = new AudioCtx()
  const now = ctx.currentTime

  const osc1 = ctx.createOscillator()
  const gain1 = ctx.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(880, now) // A5
  gain1.gain.setValueAtTime(0.15, now)
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
  osc1.connect(gain1)
  gain1.connect(ctx.destination)
  osc1.start(now)
  osc1.stop(now + 0.15)

  const osc2 = ctx.createOscillator()
  const gain2 = ctx.createGain()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(1174.66, now + 0.2) // D6
  gain2.gain.setValueAtTime(0.2, now + 0.2)
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
  osc2.connect(gain2)
  gain2.connect(ctx.destination)
  osc2.start(now + 0.2)
  osc2.stop(now + 0.4)
}
