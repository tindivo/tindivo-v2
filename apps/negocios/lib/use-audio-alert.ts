'use client'

import { useEffect, useRef } from 'react'

/**
 * Alerta de audio crítica del negocio (DECISIONS §7.2): pita cada ~3s mientras
 * haya pedidos por atender, hasta que el cajero reconozca. Requiere un gesto
 * previo del usuario (`enabled`) por la política de autoplay del navegador.
 */
export function useAudioAlert(active: boolean, enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    if (!active || !enabled) {
      stop()
      return stop
    }

    const beep = () => {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = ctxRef.current ?? new Ctx()
      ctxRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
      osc.start()
      osc.stop(ctx.currentTime + 0.45)
    }

    beep()
    timerRef.current = setInterval(beep, 3000)
    return stop
  }, [active, enabled])
}
