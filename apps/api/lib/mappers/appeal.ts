import type { AppealReportDto, AppealStatus, RefundStatus } from '@tindivo/contracts'
import type { Tables } from '@tindivo/supabase'

/**
 * Mapper seguro que transforma una fila de public.reports en un AppealReportDto en camelCase.
 */
export function mapReportRowToDto(row: Tables<'reports'>): AppealReportDto {
  return {
    id: row.id,
    orderId: row.order_id ?? '',
    businessId: row.business_id ?? '',
    customerUserId: row.customer_user_id ?? '',
    customerPhone: row.customer_phone ?? null,
    description: row.description ?? null,
    evidenceUrl: row.evidence_url ?? null,
    appealStatus: (row.appeal_status ?? 'pending') as AppealStatus,
    refundStatus: row.refund_status as RefundStatus | null,
    refundProofPath: row.refund_proof_path ?? null,
    refundAmount: row.refund_amount !== null && row.refund_amount !== undefined ? Number(row.refund_amount) : null,
    refundCompletedAt: row.refund_completed_at ?? null,
    appealDeadline: row.appeal_deadline ?? row.created_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
