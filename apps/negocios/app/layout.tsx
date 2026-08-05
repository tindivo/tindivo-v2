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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Material Symbols Rounded — set de iconos canónico (DECISIONS.md §16).
            display=swap evita que los iconos desaparezcan mientras carga la fuente. */}
        <link
          rel="preload"
          as="style"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="min-h-dvh bg-surface font-sans text-ink antialiased">
        <EnvBanner />
        <DashboardChrome>{children}</DashboardChrome>
        <PushManager />
      </body>
    </html>
  )
}
