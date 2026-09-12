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
