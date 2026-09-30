/**
 * Efectos de sonido para la app de Motorizados.
 *
 * Utiliza los archivos de audio en public/sound (y public/sounds):
 * - notication-tindivo-1.mp3: Al tomar un pedido (con slide o botón directo).
 * - notication-tindivo-4.mp3: Al finalizar la entrega.
 */

export const DRIVER_SOUNDS = {
  orderTaken: '/sounds/notication-tindivo-1.mp3',
  orderDelivered: '/sounds/notication-tindivo-4.mp3',
} as const

export type DriverSoundKey = keyof typeof DRIVER_SOUNDS

/**
 * Reproduce un audio de Motorizados de forma segura en navegador.
 */
export function playDriverSound(key: DriverSoundKey, volume = 0.8): void {
  if (typeof window === 'undefined') return
  try {
    const audio = new Audio(DRIVER_SOUNDS[key])
    audio.volume = volume
    void audio.play().catch(() => {
      // Silencioso si el navegador bloquea autoplay sin interacción previa
    })
  } catch {
    // Entornos sin soporte de Audio
  }
}

/**
 * Crea un disparador de audio precargado durante el gesto del usuario.
 *
 * En Safari iOS y PWA móvil, llamar a `audio.play()` tras un `await` de red prolongado
 * puede ser bloqueado si el elemento se crea después del gesto.
 * Instanciar el elemento y llamar a `.load()` dentro del evento síncrono del gesto
 * preserva la activación del usuario para reproducirlo al terminar la llamada.
 */
export function createDriverAudioTrigger(key: DriverSoundKey, volume = 0.8): () => void {
  if (typeof window === 'undefined') return () => {}
  try {
    const audio = new Audio(DRIVER_SOUNDS[key])
    audio.volume = volume
    try {
      audio.load()
    } catch {
      // Ignorar si load falla
    }
    return () => {
      try {
        void audio.play().catch(() => {})
      } catch {
        // Silencioso
      }
    }
  } catch {
    return () => {}
  }
}

/**
 * Aviso de «entrega nueva» (Tindivo Entregas). Dos notas generadas con Web
 * Audio en vez de un .mp3: así no se confunde con los sonidos de comida
 * (tomar / entregar) y no pesa ningún archivo. Vibra además, para el
 * motorizado que lleva el celular en el soporte con el volumen bajo.
 *
 * Solo suena con la app ABIERTA: con el celular bloqueado no hay aviso (el
 * push de Entregas está en el backlog). Si el navegador aún no tuvo un toque
 * del usuario, el AudioContext nace suspendido y el tono no suena; la
 * vibración sí.
 */
let chimeCtx: AudioContext | null = null

export function playCourierChime(): void {
  if (typeof window === 'undefined') return
  try {
    navigator.vibrate?.([120, 80, 120])
  } catch {
    // Sin vibración
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    chimeCtx ??= new Ctx()
    const ctx = chimeCtx
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
    const notes = [880, 1318.5]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = ctx.currentTime + i * 0.18
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.18)
    })
  } catch {
    // Entornos sin Web Audio
  }
}
