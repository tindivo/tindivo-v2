/**
 * Compresión de imágenes en el navegador, antes de subirlas a Storage.
 *
 * Vive en un paquete y no en una app porque lo usan las dos que suben
 * imágenes: el dashboard del negocio (logo, banner, QR, fotos de plato) y el
 * cliente (comprobantes de pago). Son cinco puntos de subida con la misma
 * necesidad — que lo que salga del celular no pese megas.
 *
 * Todo esto corre SOLO en el navegador: usa canvas. No lo importes desde una
 * ruta de API.
 */
export { compressImage } from './compress'
export { fitWithin, type ImageProfile, PROFILES, type ProfileSpec } from './profiles'
export {
  ALLOWED_IMAGE_TYPES,
  MAX_INPUT_BYTES,
  MAX_UPLOAD_BYTES,
  UPLOAD_CACHE_CONTROL,
  validateImageInput,
} from './upload'
