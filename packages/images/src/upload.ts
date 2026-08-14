/**
 * Cache-Control de todo lo que el dashboard sube a Storage.
 *
 * Un año. Es seguro porque la URL que se guarda en la DB lleva `?v=<timestamp>`
 * y cambia en cada reemplazo: el navegador y el CDN nunca sirven una imagen
 * vieja, simplemente dejan de repedir la que ya tienen. Sin esto Supabase
 * responde con el default de 1 hora y el cliente vuelve a bajarse el menú
 * entero cada mañana.
 */
export const UPLOAD_CACHE_CONTROL = '31536000'

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Tope de lo que ENTRA, no de lo que se sube: después de comprimir, una foto
 * de estas sale en unos cientos de KB. Es holgado a propósito —una cámara de
 * 12 MP pasa de 5 MB sin despeinarse— pero no infinito, porque decodificar la
 * imagen sigue costando memoria en los celulares baratos del piloto.
 */
export const MAX_INPUT_BYTES = 15 * 1024 * 1024

/**
 * Espejo del `file_size_limit` que la migración 0151 puso en los buckets
 * `business-logos`, `business-qrs` y `menu-items`. Si estos dos números se
 * separan, Storage empieza a rechazar subidas con un error que no dice nada.
 */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024

export function validateImageInput(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'Formato no permitido. Usa JPG, PNG o WebP.'
  }
  if (file.size > MAX_INPUT_BYTES) {
    return 'La imagen supera el máximo de 15 MB.'
  }
  return null
}
