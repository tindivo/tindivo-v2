import type { Metadata } from 'next'
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { PushManager } from '@/components/push-manager'
import './globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
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
        {children}
        <PushManager />
      </body>
    </html>
  )
}
