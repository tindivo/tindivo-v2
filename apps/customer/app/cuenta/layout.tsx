import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PRIVATE_ROUTE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Mi cuenta',
  ...PRIVATE_ROUTE,
}

export default function CuentaLayout({ children }: { children: ReactNode }) {
  return children
}
