import { EnvBanner } from '@tindivo/ui'
import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { DashboardChrome } from '@/components/dashboard/chrome'
import { PushManager } from '@/components/push-manager'
import { InstallBanner } from '@/components/pwa/install-banner'
import './globals.css'

// Tipografía unificada del design system Tindivo (igual que motorizados):
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
  title: 'Tindivo · Negocio',
  description: 'Panel del negocio en Tindivo',
  manifest: '/manifest.webmanifest',
  applicationName: 'Tindivo Neg.',
  // SIN ESTO, WEB PUSH NO FUNCIONA EN iOS. Desde iOS 16.4, Safari solo permite
  // suscribirse a Web Push dentro de una PWA corriendo en modo standalone (agregada
  // a la pantalla de inicio); sin `appleWebApp.capable`, el ícono agregado abre una
  // pestaña normal de Safari y `Notification.requestPermission()` no llega a
  // conceder nada. `apps/motorizados` ya lo tiene — de ahí que ahí sí funcione en
  // iPhone y aquí no. Ver también las meta tags manuales más abajo.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tindivo Neg.',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
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
        <meta name="apple-mobile-web-app-title" content="Tindivo Neg." />
        {/* Material Symbols Rounded — subset variable auto-hospedado (92 KB).
            Un solo archivo con los cuatro ejes, así que basta un preload. */}
        <link rel="preload" as="style" href="/fonts/material-symbols.css?v=2" />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
          href="/fonts/material-symbols-rounded.woff2?v=2"
        />
        <link rel="stylesheet" href="/fonts/material-symbols.css?v=2" />
      </head>
      <body className="flex h-dvh flex-col overflow-hidden bg-surface font-sans text-ink antialiased">
        <EnvBanner />
        <DashboardChrome>{children}</DashboardChrome>
        <PushManager />
        <InstallBanner />
      </body>
    </html>
  )
}
