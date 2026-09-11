/**
 * Efectos de sonido para la app de Customer.
 *
 * Utiliza los archivos de audio en public/sound:
 * - notication-tindivo-2.mp3: Al enviar la solicitud de pedido (checkout).
 * - kitchen-bell.mp3: Campanilla de cocina cuando el restaurante acepta / entra a cocina (tracking).
 */

export const CUSTOMER_SOUNDS = {
  orderSubmitted: '/sound/notication-tindivo-2.mp3',
  kitchenBell: '/sound/kitchen-bell.mp3',
} as const

export type CustomerSoundKey = keyof typeof CUSTOMER_SOUNDS

/**
 * Reproduce un audio de Customer de forma segura en navegador.
 */
export function playCustomerSound(key: CustomerSoundKey, volume = 0.8): void {
  if (typeof window === 'undefined') return
  try {
    const audio = new Audio(CUSTOMER_SOUNDS[key])
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
 * En Safari iOS, llamar a `audio.play()` tras un `await` de red prolongado
 * puede ser bloqueado si el elemento se crea después del gesto.
 * Instanciar el elemento y llamar a `.load()` dentro del evento síncrono del clic
 * preserva la activación del usuario para reproducirlo al terminar la llamada.
 */
export function createAudioTrigger(key: CustomerSoundKey, volume = 0.8): () => void {
  if (typeof window === 'undefined') return () => {}
  try {
    const audio = new Audio(CUSTOMER_SOUNDS[key])
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
