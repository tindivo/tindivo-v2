import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import { OfflineBanner } from '@/components/offline-banner'
import { PushManager } from '@/components/push-manager'
import { TransferWatcher } from '@/components/transfers/transfer-watcher'
import './globals.css'

// Tipografía única de la plataforma: Manrope con todos los pesos.
// Se exponen tres variables para no romper los call sites existentes.
const bricolage = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
})
const geist = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-geist',
  display: 'swap',
})
const jetbrains = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tindivo · Motorizado',
  description: 'Panel del motorizado en Tindivo',
}

export const viewport: Viewport = { themeColor: '#f26241', width: 'device-width', initialScale: 1 }

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
        <OfflineBanner />
        <TransferWatcher />
        {children}
        <PushManager />
      </body>
    </html>
  )
}
