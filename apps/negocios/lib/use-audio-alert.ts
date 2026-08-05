'use client'

import { useEffect, useRef } from 'react'

let sharedCtx: AudioContext | null = null
let audioBusyUntil = 0
let autoUnlocked = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!sharedCtx) {
    sharedCtx = new Ctx()
  }
  return sharedCtx
}

/** Desbloquea el audio dentro de un gesto del usuario (toggle o primer toque PWA). */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
}

/**
 * Registra listeners globales para auto-desbloquear audio en PWA al primer gesto
 * y mantener activo el AudioContext cuando la PWA se minimiza/restaura.
 */

if (typeof window !== 'undefined' && !autoUnlocked) {
  autoUnlocked = true
  const handleGesture = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', handleGesture)
    window.removeEventListener('keydown', handleGesture)
  }
  window.addEventListener('pointerdown', handleGesture, { passive: true })
  window.addEventListener('keydown', handleGesture, { passive: true })

  // Re-activar AudioContext cuando la PWA sale de segundo plano / se minimiza
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      unlockAudio()
    }
  })
}

/**
 * Anuncia verbalmente el estado de pedidos pendientes u otros avisos.
 * Usa la API de Web Speech (SpeechSynthesis). Se desfasa suavemente tras el bip
 * para evitar que la voz hable sobre los tonos de audio.
 */
export function speak(text: string, delayMs = 350): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

  setTimeout(() => {
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'es-PE'
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = 1.0
      window.speechSynthesis.speak(utterance)
    } catch {
      // Ignorar fallos de speech en entornos donde la voz no está disponible
    }
  }, delayMs)
}

/** Genera el texto de anuncio según la cantidad de pedidos pendientes. */
function pendingAnnouncement(count: number): string {
  if (count === 1) return 'Tienes un pedido nuevo'
  return `Tienes ${count} pedidos en espera`
}

/**
 * Reproduce una secuencia de tonos senoidales con prevención de solapamiento.
 * Si `isInterval` es verdadero y el canal está ocupado, el tick del intervalo se salta
 * para evitar acumulación de sonidos cuando la PWA está minimizada.
 */
function playToneSequence(
  freqs: number[],
  durEach: number,
  peak = 0.3,
  isInterval = false,
): boolean {
  const ctx = getCtx()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }

  const now = ctx.currentTime

  // Si es un intervalo repetitivo y el canal de audio está ocupado, omitir para no acumular bips
  if (isInterval && now < audioBusyUntil) {
    return false
  }

  const startAt = Math.max(now, audioBusyUntil)
  let at = startAt

  for (const f of freqs) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = f

    // Envolvente de ganancia suave para evitar clics eléctricos
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.001), at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + durEach - 0.015)

    osc.start(at)
    osc.stop(at + durEach)
    at += durEach + 0.04
  }

  audioBusyUntil = at + 0.06
  return true
}

/**
 * Alertas de audio del dashboard de negocios (PROPUESTAS_UX_PEDIDOS §7):
 *  · Tipo 1 — pedido nuevo: 880Hz + 1175Hz, doble bip, cada 3s mientras haya pendientes.
 *  · Tipo 2 — motorizado llegó: 660-880-660Hz, triple bip suave, una vez al cambiar a `waiting`.
 *  · Tipo 3 — buffer fase 3 (5m+ sin moto): 440Hz, bip largo, cada 8s.
 */
export function useDashboardSounds({
  hasPending,
  pendingCount,
  hasWaiting,
  hasBufferP3,
  soundOn,
}: {
  hasPending: boolean
  pendingCount: number
  hasWaiting: boolean
  hasBufferP3: boolean
  soundOn: boolean
}) {
  const t1 = useRef<ReturnType<typeof setInterval> | null>(null)
  const t3 = useRef<ReturnType<typeof setInterval> | null>(null)
  const tVoice = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPendingCount = useRef(0)
  const prevWaiting = useRef(false)

  // Tipo 1 — pedido nuevo
  useEffect(() => {
    const stop = () => {
      if (t1.current) clearInterval(t1.current)
      t1.current = null
    }
    if (!soundOn || !hasPending) {
      stop()
      return stop
    }
    const play = () => playToneSequence([880, 1175], 0.18, 0.55, true)
    play()
    t1.current = setInterval(play, 3000)
    return stop
  }, [soundOn, hasPending])

  // Anuncio por voz — cada 15s o inmediatamente al subir la cuenta
  useEffect(() => {
    const stop = () => {
      if (tVoice.current) clearInterval(tVoice.current)
      tVoice.current = null
    }
    if (!soundOn || !hasPending) {
      stop()
      prevPendingCount.current = 0
      return stop
    }

    if (pendingCount > prevPendingCount.current) {
      speak(pendingAnnouncement(pendingCount), 450)
    }
    prevPendingCount.current = pendingCount

    tVoice.current = setInterval(() => {
      speak(pendingAnnouncement(pendingCount), 450)
    }, 15000)

    return stop
  }, [soundOn, hasPending, pendingCount])

  // Tipo 3 — buffer fase 3
  useEffect(() => {
    const stop = () => {
      if (t3.current) clearInterval(t3.current)
      t3.current = null
    }
    if (!soundOn || !hasBufferP3) {
      stop()
      return stop
    }
    const play = () => playToneSequence([440], 0.8, 0.25, true)
    play()
    t3.current = setInterval(play, 8000)
    return stop
  }, [soundOn, hasBufferP3])

  // Tipo 2 — motorizado llegó (evento único de alta prioridad)
  useEffect(() => {
    if (hasWaiting && !prevWaiting.current) {
      playToneSequence([660, 880, 660], 0.3, 0.22, false)
      speak('El motorizado llegó al local', 650)
    }
    prevWaiting.current = hasWaiting
  }, [hasWaiting])
}
