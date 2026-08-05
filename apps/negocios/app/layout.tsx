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
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`}>
      <head>
        {/* Material Symbols Rounded — self-hosted subset
            (opsz 24, wght 400..700, FILL 0..1, GRAD 0).
            Preload the font files so icons render without the broken-glyph flash. */}
        <link rel="preload" as="style" href="/fonts/material-symbols.css" />
        <link rel="preload" as="font" type="font/ttf" crossOrigin="anonymous" href="/fonts/material-symbols-rounded-400.ttf" />
        <link rel="preload" as="font" type="font/ttf" crossOrigin="anonymous" href="/fonts/material-symbols-rounded-500.ttf" />
        <link rel="preload" as="font" type="font/ttf" crossOrigin="anonymous" href="/fonts/material-symbols-rounded-600.ttf" />
        <link rel="preload" as="font" type="font/ttf" crossOrigin="anonymous" href="/fonts/material-symbols-rounded-700.ttf" />
        <link rel="stylesheet" href="/fonts/material-symbols.css" />
      </head>
      <body className="min-h-dvh bg-surface font-sans text-ink antialiased">
        <EnvBanner />
        <DashboardChrome>{children}</DashboardChrome>
        <PushManager />
      </body>
    </html>
  )
}
