import type { Metadata, Viewport } from 'next'
import { Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { AuthOnboardingHost } from '@/components/auth-onboarding/host'
import { BottomNav } from '@/components/bottom-nav'
import { PushManager } from '@/components/push-manager'
import { CartHydrator } from '@/lib/cart'
import './globals.css'

// Tipografía unificada del design system Tindivo (igual que motorizados y negocios):
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
  title: 'Tindivo — Delivery de tu barrio',
  description: 'Pide de los negocios de San Jacinto y recíbelo en tu puerta.',
}

export const viewport: Viewport = {
  themeColor: '#f97316',
  width: 'device-width',
  initialScale: 1,
}

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
      <body className="min-h-dvh bg-surface pb-16 font-sans text-ink antialiased lg:pb-0">
        {children}
        <CartHydrator />
        <PushManager />
        <AuthOnboardingHost />
        <BottomNav />
      </body>
    </html>
  )
}
