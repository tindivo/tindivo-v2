import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from '@/lib/site'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'es_PE',
    url: '/',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: '/icon-512x512.png', width: 512, height: 512, alt: 'Tindivo' }],
  },
  twitter: { card: 'summary', title: SITE_TITLE, description: SITE_DESCRIPTION },
  icons: {
    icon: [
      { url: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.ico', sizes: '256x256', type: 'image/x-icon' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#ee6417',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE" className={geist.variable}>
      <body className="flex min-h-dvh flex-col bg-page font-sans text-ink antialiased">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-lg focus:bg-card focus:px-4 focus:py-3 focus:text-brand-text"
        >
          Ir al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  )
}
