import type { Metadata } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { AdminShell } from '@/components/admin-shell'
import { AuthGate } from '@/components/auth-gate'
import { PushManager } from '@/components/push-manager'
import './globals.css'

// Tipografía unificada del design system Tindivo (igual que motorizados,
// negocios y customer):
// - Geist para display, body y labels.
// - JetBrains Mono solo para datos técnicos (IDs, precios, tiempos).
//
// Antes las tres variables cargaban Manrope. Como `theme.css` mapea
// `--font-mono` a `--font-jetbrains`, los 34 `font-mono` de este panel salían
// en una fuente PROPORCIONAL: los importes y los IDs no alineaban en columna.
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
  title: 'Tindivo · Admin',
  description: 'Sala de control de Tindivo',
}

import { EnvBanner } from '@tindivo/ui'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${jetbrains.variable}`}>
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
        <AuthGate>
          <AdminShell>{children}</AdminShell>
        </AuthGate>
        <PushManager />
      </body>
    </html>
  )
}
