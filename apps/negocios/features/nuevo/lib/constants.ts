import type { Payment } from '../types'

export const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50]

/**
 * `tile` es el degradado de la pastilla del icono. Cada método tiene el suyo
 * para que la cajera los distinga por color de un vistazo, sin leer: verde
 * dinero para efectivo, violeta para billetera (es el color de Yape), azul
 * para el que ya pagó, y la mezcla de los dos para el mixto.
 *
 * Todos ACLARAN, nunca oscurecen — misma regla que el degradado de marca en
 * `theme.css`. El tratamiento viene del selector de método de pago de
 * tindivo-delivery, que resuelve esta misma pantalla.
 */
export const PAYMENTS: {
  id: Payment
  icon: string
  label: string
  sub: string
  tile: string
}[] = [
  {
    id: 'prepaid',
    icon: 'verified',
    label: 'Ya pagó',
    sub: 'El cliente ya realizó la transferencia',
    tile: 'bg-[linear-gradient(135deg,var(--color-info),#38bdf8)]',
  },
  {
    id: 'pending_wallet',
    icon: 'qr_code_2',
    label: 'Billetera digital',
    sub: 'Yape, Plin u otra — el moto muestra QR',
    tile: 'bg-[linear-gradient(135deg,#7c3aed,#a78bfa)]',
  },
  {
    id: 'pending_cash',
    icon: 'payments',
    label: 'Efectivo',
    sub: 'El motorizado cobra en efectivo',
    tile: 'bg-[linear-gradient(135deg,var(--color-success),#4ade80)]',
  },
  {
    id: 'pending_mixed',
    icon: 'shuffle',
    label: 'Mixto',
    sub: 'Una parte con billetera, otra en efectivo',
    tile: 'bg-[linear-gradient(135deg,#7c3aed,var(--color-success))]',
  },
]
