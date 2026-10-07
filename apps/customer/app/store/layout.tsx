import type { ReactNode } from 'react'
import '@/features/store/store.css'

/**
 * Tindivo Store usa el sistema visual v4, acotado a `.st-root`.
 *
 * `-mb-16 lg:mb-0` anula el `pb-16` que el `<body>` del layout raíz reserva para
 * la barra inferior de la app: aquí no hay barra inferior (el pie fijo es el
 * botón de compra), y sin esto quedaría una franja en blanco bajo él.
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  return <div className="st-root -mb-16 lg:mb-0">{children}</div>
}
