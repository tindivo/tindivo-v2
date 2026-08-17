import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PRIVATE_ROUTE } from '@/lib/seo'

/**
 * `/pedido/<shortId>` es el seguimiento de un pedido concreto: lleva dentro la
 * dirección y el teléfono de quien pidió. La página es un componente cliente y
 * no puede exportar `metadata`, así que el `noindex` vive aquí.
 */
export const metadata: Metadata = {
  title: 'Seguimiento de tu pedido',
  ...PRIVATE_ROUTE,
}

export default function PedidoLayout({ children }: { children: ReactNode }) {
  return children
}
