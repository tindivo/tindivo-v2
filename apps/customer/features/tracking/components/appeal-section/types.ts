export interface AppealStatus {
  appealStatus: string
  refundStatus: string | null
  refundAmount: number | null
  appealDeadline: string | null
  refundProofUrl: string | null
}

export interface AppealSectionProps {
  orderId: string | null
  shortId: string
  hasAppeal: boolean
  total: number
  onAppealCreated: () => void
}

export const APPEAL_STEPS = [
  {
    key: 'pending',
    label: 'Recibido',
    description: 'Tu apelación fue recibida. Revisaremos tu pago en máximo 24h.',
  },
  {
    key: 'in_review',
    label: 'En revisión',
    description: 'Estamos verificando tu pago con el restaurante.',
  },
  { key: 'resolved', label: 'Resuelto', description: '' },
]
