export interface ReportOrder {
  id: string
  shortId: string
  orderAmount: number
  createdAt: string
  rejectionReasonCode: string | null
  rejectionReasonText: string | null
  customerName: string | null
  customerPhone: string | null
}

export interface ReportTimelineEvent {
  eventType: string
  actorRole: string | null
  createdAt: string
  data: Record<string, unknown>
  proofUrls?: { url: string; label: string }[]
}

export interface ReportDetail {
  id: string
  type: string
  reason: string
  resolutionNotes: string | null
  refundAmount: number | null
  appealStatus: string | null
  createdAt: string
  refundProofUrl: string | null
  disputeProofUrl: string | null
  evidenceUrls: string[]
  order: ReportOrder | null
  events: ReportTimelineEvent[]
}

export type ChargeType = 'commission' | 'delivery_fee' | 'refund_charge'

export interface PendingCharge {
  id: string
  chargeType: ChargeType
  amount: number
  description: string | null
  createdAt: string
  orderId: string | null
  shortId: string | null
  reportId: string | null
  report: ReportDetail | null
}

export interface PendingGroupItem {
  key: string
  type: 'order' | 'refund'
  orderId: string | null
  shortId: string | null
  createdAt: string
  charges: PendingCharge[]
  totalAmount: number
}

export interface PaymentHistoryItem {
  id: string
  amount: number
  paymentMethod: string
  paidAt: string
  note: string | null
  settledChargeCount: number
  orderCount: number
}

export interface RefundDetail {
  id: string
  type: string
  reason: string
  resolutionNotes: string | null
  refundAmount: number
  appealStatus: string | null
  createdAt: string
  refundProofUrl: string | null
  disputeProofUrl: string | null
  evidenceUrls: string[]
  chargeAmount: number
  chargeDescription: string
  order: ReportOrder | null
  events: ReportTimelineEvent[]
}

export interface AccountSummaryData {
  balanceDue: number
  isBlocked: boolean
  blockedForDebt: boolean
  /** Límite de crédito vigente (`app_settings.debt_block_threshold`, 0178). */
  debtBlockThreshold: number
  supportPhone: string | null
  summary: {
    totalCommissions: number
    totalDeliveryFees: number
    totalRefunds: number
  }
  pendingCharges: PendingCharge[]
  paymentHistory: PaymentHistoryItem[]
}
