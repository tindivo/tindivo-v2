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
  title: 'Tindivo — Delivery de tu barrio',
  description: 'Pide de los negocios de San Jacinto y recíbelo en tu puerta.',
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=block"
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
      </body>
    </html>
  )
}
