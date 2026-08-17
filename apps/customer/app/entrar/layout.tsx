import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PRIVATE_ROUTE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Entrar',
  ...PRIVATE_ROUTE,
}

export default function EntrarLayout({ children }: { children: ReactNode }) {
  return children
}
