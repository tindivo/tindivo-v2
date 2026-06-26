import type { Metadata } from 'next'
import { JetBrains_Mono, Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import { DashboardChrome } from '@/components/dashboard/chrome'
import { PushManager } from '@/components/push-manager'
import './globals.css'

// Tipografía de branding del negocio (#6): Manrope cubre display (--font-bricolage)
// y cuerpo (--font-geist). JetBrains Mono se mantiene para IDs/precios tabulares.
const manropeDisplay = Manrope({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})
const manropeBody = Manrope({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tindivo · Negocio',
  description: 'Panel del negocio en Tindivo',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${manropeDisplay.variable} ${manropeBody.variable} ${jetbrains.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Material Symbols Rounded — set de iconos canónico (DECISIONS.md §16).
            display=block es intencional para iconos (regla useGoogleFontDisplay off en biome.json). */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-dvh bg-surface font-sans text-ink antialiased">
        <DashboardChrome>{children}</DashboardChrome>
        <PushManager />
      </body>
    </html>
  )
}
