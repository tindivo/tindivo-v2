import type { Payment } from '../types'

export const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50]

export const PAYMENTS: { id: Payment; icon: string; label: string; sub: string }[] = [
  {
    id: 'pending_cash',
    icon: 'payments',
    label: 'Efectivo',
    sub: 'El motorizado cobra en efectivo',
  },
  {
    id: 'pending_wallet',
    icon: 'qr_code_2',
    label: 'Billetera digital',
    sub: 'Yape, Plin u otra — el moto muestra QR',
  },
  {
    id: 'prepaid',
    icon: 'verified',
    label: 'Ya pagó',
    sub: 'El cliente ya realizó la transferencia',
  },
  {
    id: 'pending_mixed',
    icon: 'shuffle',
    label: 'Mixto',
    sub: 'Una parte con billetera, otra en efectivo',
  },
]
