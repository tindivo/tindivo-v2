import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PRIVATE_ROUTE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Mis pedidos',
  ...PRIVATE_ROUTE,
}

export default function PedidosLayout({ children }: { children: ReactNode }) {
  return children
}
