import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PRIVATE_ROUTE } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Confirmar pedido',
  ...PRIVATE_ROUTE,
}

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children
}
