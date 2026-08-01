import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tindivo Motorizados',
    short_name: 'Tindivo Moto',
    description: 'Panel del motorizado: pedidos disponibles, en curso y efectivo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF6F1',
    theme_color: '#F97316',
    lang: 'es-PE',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
