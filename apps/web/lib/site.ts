/** Raíz de las URL absolutas (Open Graph, sitemap). El apex redirige a `www`, por eso va `www`. */
export const SITE_URL = 'https://www.tindivo.com'
export const SITE_NAME = 'Tindivo'
export const SITE_TITLE = 'Tindivo — Delivery de tu barrio'
export const SITE_DESCRIPTION =
  'Pide de los negocios de San Jacinto y recíbelo en tu puerta. Pagas por Yape, Plin o en efectivo directo al negocio.'

/** Soporte por WhatsApp: un solo número (capacidad `soporte`). */
export const WHATSAPP_NUMBER = '51906550166'

/** Ficha de la app del cliente en Google Play (`applicationId` de `apps/android/customer`). */
export const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.tindivo.customer'

/** Sin ficha en App Store, no hay botón (CUS-WPU-002). Cuando exista, se pone aquí su URL. */
export const APP_STORE_URL: string | null = null

/**
 * El enlace del Libro en el pie queda oculto mientras el formulario no exista
 * (CUS-LIB-008: cerrado hasta que el RUC y el domicilio estén en `app_settings`).
 */
export const SHOW_LIBRO_LINK = false

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`
}
