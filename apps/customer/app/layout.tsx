import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { AuthOnboardingHost } from '@/components/auth-onboarding/host'
import { BottomNav } from '@/components/bottom-nav'
import { PushManager } from '@/components/push-manager'
import {
  PILOT_BYPASS_KEY,
  PILOT_BYPASS_TOKEN,
  PILOT_QUERY_PARAM,
} from '@/features/pilot/lib/bypass'
import { CartHydrator } from '@/lib/cart'
import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_LOCALE, SITE_TITLE, SITE_URL } from '@/lib/seo'
import './globals.css'

// Tipografía unificada del design system Tindivo (igual que motorizados y negocios):
// - Geist para display, body y labels.
// - JetBrains Mono solo para datos técnicos (IDs, precios, tiempos).
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  // Raíz de toda URL relativa de metadata. Sin esto, las imágenes de Open Graph
  // no se emiten y el enlace se comparte pelado. Ver `lib/seo.ts`.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    // Cada página manda solo su nombre ("La Florencia") y el sufijo lo pone
    // esta plantilla, en vez de repetirlo a mano en cada `metadata`.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  keywords: [
    'delivery San Jacinto',
    'comida a domicilio San Jacinto',
    'delivery Áncash',
    'restaurantes San Jacinto',
    'pedir comida Nepeña',
    'Tindivo',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'food',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Sin esto Google recorta la miniatura a un tamaño diminuto en resultados.
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: SITE_OG_LOCALE,
    url: '/',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    // `images` lo inyecta Next solo, desde `app/opengraph-image.tsx`.
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  /**
   * Google exige que el favicon de los resultados sea **múltiplo de 48px**
   * (48, 96, 144, 192...). El `favicon.ico` de este sitio es 256×256, que no lo
   * es, y cuando el icono no le vale Google cae al del hosting: por eso los
   * resultados de `tindivo.com` salían con el triángulo de Vercel teniendo el
   * sitio su propio icono bien declarado y bien servido.
   *
   * Los PNG de 96 y 192 van PRIMERO por eso. El `.ico` se queda al final para
   * los navegadores viejos que solo entienden ese formato.
   */
  icons: {
    icon: [
      { url: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.ico', sizes: '256x256', type: 'image/x-icon' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `suppressHydrationWarning` va AQUÍ por el script del muro del piloto que
    // hay unas líneas más abajo: corre antes de hidratar y le pone
    // `data-pilot-bypass="1"` a este mismo `<html>`, que el HTML del servidor no
    // trae. React lo veía como un desajuste y lo gritaba en consola en CADA
    // carga del dispositivo que tiene el bypass:
    //
    //   «A tree hydrated but some attributes of the server rendered HTML didn't
    //    match the client properties. This won't be patched up.»
    //
    // Medido el 2026-09-01 con un control: sin bypass la consola sale limpia,
    // con bypass aparece el error. No era un defecto —la mutación es
    // deliberada, es el anti-flash— pero enterraba en ruido cualquier
    // desajuste de verdad.
    //
    // El alcance del atributo es UN nivel: tapa los atributos de este `<html>`
    // y nada de lo que hay dentro, así que un desajuste real en la app sigue
    // saliendo.
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
          rel="stylesheet"
        />
        {/*
          El muro del piloto se renderiza en el servidor para que no parpadee la
          portada antes de aparecer. El precio de eso es el caso contrario: un
          dispositivo que YA tiene el bypass recibiría un HTML con muro y lo
          vería un instante, hasta que React monta y lo quita.

          Este script corre antes del primer pintado y marca el <html>; la regla
          `[data-pilot-bypass='1'] [data-pilot-wall]` de globals.css lo oculta.
          Mismo patrón que el anti-flash de los temas.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var u=new URL(location.href);if(u.searchParams.get('${PILOT_QUERY_PARAM}')==='${PILOT_BYPASS_TOKEN}')localStorage.setItem('${PILOT_BYPASS_KEY}','1');if(localStorage.getItem('${PILOT_BYPASS_KEY}')==='1')document.documentElement.setAttribute('data-pilot-bypass','1')}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-surface pb-16 font-sans text-ink antialiased lg:pb-0">
        {children}
        <CartHydrator />
        <PushManager />
        <AuthOnboardingHost />
        <BottomNav />
        <Analytics />
      </body>
    </html>
  )
}
