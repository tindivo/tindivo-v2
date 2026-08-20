/**
 * Los tres avisos sonoros del seguimiento, sintetizados con Web Audio.
 *
 * Sin archivos de audio a propósito: tres notas no justifican meter mp3 al
 * bundle de una PWA que en San Jacinto se abre con datos móviles, y un
 * `<audio src>` obliga a que el asset cargue ANTES del evento — justo cuando el
 * cliente necesita oírlo. Un oscilador suena al instante y pesa cero.
 *
 * **El navegador no deja sonar sin un gesto previo del usuario.** El
 * `AudioContext` nace suspendido y solo se puede reanudar dentro del manejador
 * de un toque, así que se crea perezosamente en el primer toque de la página
 * (`unlockChimes`) y no antes. Si el cliente llegó por un enlace de WhatsApp y
 * dejó la pestaña sin tocarla, no habrá sonido: por eso los avisos vibran y
 * parpadean el título además de sonar, y no dependen de esto para funcionar.
 */

export type ChimeTone = 'good' | 'action' | 'bad'

let ctx: AudioContext | null = null

type WindowConAudio = Window & { webkitAudioContext?: typeof AudioContext }

/**
 * Prepara el audio. **Tiene que llamarse dentro del gesto del usuario** (un
 * `pointerdown`, no un `setTimeout` posterior) o el contexto se queda suspendido.
 */
export function unlockChimes(): void {
  if (typeof window === 'undefined') return
  const Ctor = window.AudioContext ?? (window as WindowConAudio).webkitAudioContext
  if (!Ctor) return
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
}

/** Una nota con ataque y caída suaves: un gain plano produce un chasquido. */
function nota(at: number, hz: number, durMs: number, vol: number): void {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(hz, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(vol, at + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durMs / 1000)
  osc.connect(gain).connect(ctx.destination)
  osc.start(at)
  osc.stop(at + durMs / 1000 + 0.05)
}

/**
 * Las tres formas están pensadas para distinguirse SIN mirar la pantalla, que es
 * el único caso en que un sonido sirve de algo:
 *
 *   · `good`   · dos notas que suben  · «avanzó, todo bien»
 *   · `action` · tres pulsos iguales  · «tienes que hacer algo AHORA»
 *   · `bad`    · dos notas que bajan  · «se cayó»
 */
const FORMAS: Record<ChimeTone, { hz: number; delayMs: number; durMs: number; vol: number }[]> = {
  good: [
    { hz: 660, delayMs: 0, durMs: 130, vol: 0.14 },
    { hz: 880, delayMs: 120, durMs: 220, vol: 0.14 },
  ],
  action: [
    { hz: 880, delayMs: 0, durMs: 110, vol: 0.2 },
    { hz: 880, delayMs: 190, durMs: 110, vol: 0.2 },
    { hz: 880, delayMs: 380, durMs: 200, vol: 0.2 },
  ],
  bad: [
    { hz: 520, delayMs: 0, durMs: 160, vol: 0.12 },
    { hz: 390, delayMs: 150, durMs: 280, vol: 0.12 },
  ],
}

/** Suena, si el navegador lo permite. Nunca lanza: un aviso no rompe la página. */
export function playChime(tone: ChimeTone): void {
  if (ctx?.state !== 'running') return
  try {
    const t0 = ctx.currentTime
    for (const n of FORMAS[tone]) nota(t0 + n.delayMs / 1000, n.hz, n.durMs, n.vol)
  } catch {
    // Un aviso que falla es un aviso perdido, no un error que enseñar.
  }
}

/** Patrones de vibración, para cuando el sonido no es opción (o está en silencio). */
export const VIBRACION: Record<ChimeTone, number[]> = {
  good: [80],
  action: [90, 70, 90, 70, 160],
  bad: [200, 100, 200],
}
