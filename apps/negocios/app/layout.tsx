import { EnvBanner } from '@tindivo/ui'
import type { Metadata } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { DashboardChrome } from '@/components/dashboard/chrome'
import { PushManager } from '@/components/push-manager'
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
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`}>
      <head>
        {/* Material Symbols Rounded — subset variable auto-hospedado (92 KB).
            Un solo archivo con los cuatro ejes, así que basta un preload. */}
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
      <body className="flex h-dvh flex-col overflow-hidden bg-surface font-sans text-ink antialiased">
        <EnvBanner />
        <DashboardChrome>{children}</DashboardChrome>
        <PushManager />
      </body>
    </html>
  )
}
