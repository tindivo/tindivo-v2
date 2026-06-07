'use client'

import { useEffect, useRef } from 'react'

let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!sharedCtx) sharedCtx = new Ctx()
  return sharedCtx
}

/** Desbloquea el audio dentro de un gesto del usuario (toggle de Alertas). */
export function unlockAudio(): void {
  void getCtx()?.resume?.()
}

/**
 * Tres alertas de audio del dashboard (PROPUESTAS_UX_PEDIDOS §7):
 *  · Tipo 1 — pedido nuevo: 880Hz + 1175Hz, doble bip, cada 3s mientras haya
 *    pendientes y `soundOn`.
 *  · Tipo 2 — motorizado llegó: 660-880-660Hz, triple bip suave, una vez al
 *    cambiar a `waiting`. Suena AUNQUE `soundOn` esté apagado (acción física).
 *  · Tipo 3 — buffer fase 3 (5m+ sin moto): 440Hz, bip largo, cada 8s.
 * Requiere un gesto previo (toggle de Alertas) por la política de autoplay.
 */
export function useDashboardSounds({
  hasPending,
  hasWaiting,
  hasBufferP3,
  soundOn,
}: {
  hasPending: boolean
  hasWaiting: boolean
  hasBufferP3: boolean
  soundOn: boolean
}) {
  const t1 = useRef<ReturnType<typeof setInterval> | null>(null)
  const t3 = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevWaiting = useRef(false)

  function seq(freqs: number[], durEach: number, peak = 0.3) {
    const ctx = getCtx()
    if (!ctx) return
    void ctx.resume?.()
    let at = ctx.currentTime
    for (const f of freqs) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = f
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + durEach)
      osc.start(at)
      osc.stop(at + durEach)
      at += durEach + 0.04
    }
  }

  // Tipo 1 — pedido nuevo.
  useEffect(() => {
    const stop = () => {
      if (t1.current) clearInterval(t1.current)
      t1.current = null
    }
    if (!soundOn || !hasPending) {
      stop()
      return stop
    }
    const play = () => seq([880, 1175], 0.18, 0.32)
    play()
    t1.current = setInterval(play, 3000)
    return stop
  }, [soundOn, hasPending])

  // Tipo 3 — buffer fase 3.
  useEffect(() => {
    const stop = () => {
      if (t3.current) clearInterval(t3.current)
      t3.current = null
    }
    if (!soundOn || !hasBufferP3) {
      stop()
      return stop
    }
    const play = () => seq([440], 0.8, 0.25)
    play()
    t3.current = setInterval(play, 8000)
    return stop
  }, [soundOn, hasBufferP3])

  // Tipo 2 — motorizado llegó (edge, ignora soundOn).
  useEffect(() => {
    if (hasWaiting && !prevWaiting.current) seq([660, 880, 660], 0.3, 0.22)
    prevWaiting.current = hasWaiting
  }, [hasWaiting])
}
