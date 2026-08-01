import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { OfflineBanner } from '@/components/offline-banner'
import { PushManager } from '@/components/push-manager'
import { TransferWatcher } from '@/components/transfers/transfer-watcher'
import './globals.css'

// Sistema tipográfico unificado con el resto de Tindivo:
// Bricolage Grotesque para titulares, Geist para cuerpo, JetBrains Mono para etiquetas.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bricolage',
  display: 'swap',
})
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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Tindivo Moto',
  },
}

export const viewport: Viewport = { themeColor: '#f26241', width: 'device-width', initialScale: 1 }

import { EnvBanner } from '@tindivo/ui'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${bricolage.variable} ${geist.variable} ${jetbrains.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh bg-surface font-sans text-ink antialiased">
        <EnvBanner />
        <OfflineBanner />
        <TransferWatcher />
        {children}
        <PushManager />
      </body>
    </html>
  )
}
