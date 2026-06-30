import type { Metadata } from 'next'
import { Manrope } from 'next/font/google'
import type { ReactNode } from 'react'
import { AdminShell } from '@/components/admin-shell'
import { AuthGate } from '@/components/auth-gate'
import { PushManager } from '@/components/push-manager'
import './globals.css'

// Tipografía única de la plataforma (DECISIONS.md §16): Manrope cubre display
// (--font-bricolage), cuerpo (--font-geist) y mono/tabular (--font-jetbrains).
const bricolage = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-bricolage',
  display: 'swap',
})
const geist = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist',
  display: 'swap',
})
const jetbrains = Manrope({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tindivo · Admin',
  description: 'Sala de control de Tindivo',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${bricolage.variable} ${geist.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-surface font-sans text-ink antialiased">
        <AuthGate>
          <AdminShell>{children}</AdminShell>
        </AuthGate>
        <PushManager />
      </body>
    </html>
  )
}
