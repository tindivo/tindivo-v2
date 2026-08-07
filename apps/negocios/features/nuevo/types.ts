export type Payment = 'pending_cash' | 'pending_wallet' | 'prepaid' | 'pending_mixed'

export interface IntakeStatus {
  isOpen: boolean
  cutoff: string
  startTime?: string
  serverTimeLima: string
  message: string | null
}
