import { EnvBanner } from '@tindivo/ui'
import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { OfflineBanner } from '@/components/offline-banner'
import { InstallBanner } from '@/components/pwa/install-banner'
import { RegisterSW } from '@/components/pwa/register-sw'
import { TransferWatcher } from '@/components/transfers/transfer-watcher'
import './globals.css'

// Tipografía unificada del design system Tindivo:
// - Geist para display, body y labels (única familia de interfaz).
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
  title: 'Tindivo · Motorizado',
  description: 'Panel del motorizado en Tindivo',
  manifest: '/manifest.webmanifest',
  applicationName: 'Tindivo Moto',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tindivo Moto',
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#F97316',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Tindivo Moto" />
        {/* Material Symbols Rounded — subset variable auto-hospedado (103 KB).
            Un solo archivo con los cuatro ejes, así que basta un preload. El
            porqué de no usar el CDN está en `public/fonts/material-symbols.css`;
            en corto: por la URL que había, el prop `filled` no funcionaba, y
            arreglarlo contra el CDN costaba 5.2 MB. Además esto es local, y
            esta app se abre con la señal del pueblo. */}
        <link rel="preload" as="style" href="/fonts/material-symbols.css" />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
          href="/fonts/material-symbols-rounded.woff2"
        />
        <link rel="stylesheet" href="/fonts/material-symbols.css" />
      </head>
      <body className="min-h-dvh bg-surface font-sans text-ink antialiased">
        {/* Primero el service worker: push, avisos e instalación dependen de
            que esté registrado. */}
        <RegisterSW />
        <div className="contents">
          <EnvBanner />
          <OfflineBanner />
          <TransferWatcher />
        </div>
        {children}
        <InstallBanner />
      </body>
    </html>
  )
}
