import type { Metadata } from 'next'

/**
 * Constantes de metadata compartidas por todas las rutas del cliente.
 *
 * `SITE_URL` es lo que alimenta `metadataBase`, y no es un adorno: Open Graph
 * exige URLs ABSOLUTAS. Sin `metadataBase`, una ruta relativa en
 * `openGraph.images` no se resuelve y Next directamente no emite la etiqueta —
 * el enlace se comparte sin imagen y sin que nada falle de forma visible.
 *
 * El defecto lleva `www` a propósito: el apex `tindivo.com` responde 307 hacia
 * `www.tindivo.com`, así que el dominio canónico real es el segundo. Apuntar
 * ahí evita que cada `<link rel="canonical">` y cada `og:url` señalen a una
 * URL que redirige.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tindivo.com').replace(
  /\/+$/,
  '',
)

export const SITE_NAME = 'Tindivo'
export const SITE_TAGLINE = 'Delivery de tu barrio'
export const SITE_TITLE = `${SITE_NAME} — ${SITE_TAGLINE}`
export const SITE_DESCRIPTION =
  'Pide de los negocios de San Jacinto y recíbelo en tu puerta. Pagas por Yape, Plin o en efectivo directo al negocio.'

/** Open Graph usa el formato `es_PE`, no el `es-PE` de la etiqueta `lang`. */
export const SITE_OG_LOCALE = 'es_PE'

/** Paleta de marca, duplicada aquí porque `next/og` no ve las variables CSS. */
export const BRAND = {
  orange: '#f97316',
  orangeLight: '#fb923c',
  ink: '#1a1614',
  surface: '#faf6f1',
} as const

/** Convierte una ruta de la app en URL absoluta (para JSON-LD y sitemap). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Metadata de las rutas privadas: carrito, cuenta, seguimiento de un pedido.
 *
 * `index: false` no es opcional aquí. `/pedido/<shortId>` es el enlace que el
 * cliente recibe por push y reenvía por WhatsApp; si Google lo indexa, el
 * seguimiento de una persona —con su dirección— queda en resultados de
 * búsqueda. `follow: false` además evita que el crawler siga desde ahí.
 */
export const PRIVATE_ROUTE: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
}
