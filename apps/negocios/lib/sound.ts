/**
 * Efectos de sonido para la app de Negocios.
 *
 * Utiliza los archivos de audio en public/sound (y public/sounds):
 * - notication-tindivo-levelup.mp3: Al pasar un pedido a cocina (creación manual
 *   o pase a cocina tras aceptar / validar pago).
 */

export const NEGOCIOS_SOUNDS = {
  kitchen: '/sounds/notication-tindivo-levelup.mp3',
} as const

export type NegociosSoundKey = keyof typeof NEGOCIOS_SOUNDS

/**
 * Reproduce un audio de Negocios de forma segura en navegador.
 */
export function playNegociosSound(key: NegociosSoundKey = 'kitchen', volume = 0.8): void {
  if (typeof window === 'undefined') return
  try {
    const audio = new Audio(NEGOCIOS_SOUNDS[key])
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
 * En Safari iOS y navegadores móviles, llamar a `audio.play()` tras un `await` de red prolongado
 * puede ser bloqueado si el elemento se crea después del gesto.
 * Instanciar el elemento y llamar a `.load()` dentro del evento síncrono del clic
 * preserva la activación del usuario para reproducirlo al terminar la llamada.
 */
export function createNegociosAudioTrigger(
  key: NegociosSoundKey = 'kitchen',
  volume = 0.8,
): () => void {
  if (typeof window === 'undefined') return () => {}
  try {
    const audio = new Audio(NEGOCIOS_SOUNDS[key])
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
 * Crea el disparador de sonido para pasar a cocina durante el clic del usuario.
 */
export function createKitchenSoundTrigger(volume = 0.8): () => void {
  return createNegociosAudioTrigger('kitchen', volume)
}

/**
 * Reproduce inmediatamente el sonido de pase a cocina.
 */
export function playKitchenSound(volume = 0.8): void {
  playNegociosSound('kitchen', volume)
}
