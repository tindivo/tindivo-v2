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
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
