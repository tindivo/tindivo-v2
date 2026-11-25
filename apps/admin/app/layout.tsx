import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import type { CSSProperties, ReactNode } from 'react'
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
//
// Las fuentes se sirven desde el propio build, sin pedirlas a Google: antes
// el módulo de Google de Next las descargaba al compilar y, si la red fallaba, el build
// (y las previews) se caían. Geist viene del paquete `geist` (su variable es
// `--font-geist-sans`; más abajo se enlaza a `--font-geist`, que es la que lee
// `theme.css`). JetBrains Mono viene de `@fontsource-variable/jetbrains-mono`
// (licencia OFL), subconjunto latin.
const jetbrains = localFont({
  src: '../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '400 700',
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tindivo · Admin',
  description: 'Sala de control de Tindivo',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

import { EnvBanner } from '@tindivo/ui'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${GeistSans.variable} ${jetbrains.variable}`}
      style={{ '--font-geist': 'var(--font-geist-sans)' } as CSSProperties}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0&display=block"
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
