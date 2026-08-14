import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tindivo Negocios',
    short_name: 'Tindivo Neg.',
    description: 'Panel del negocio: pedidos en vivo, menú, efectivo y deuda.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF6F1',
    theme_color: '#F97316',
    lang: 'es-PE',
    icons: [
      { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}
