import {
  AppealStatusSchema,
  RefundStatusSchema,
  type AdminAppealDto,
  type CustomerAppealDto,
} from '@tindivo/contracts'
import type { Tables } from '@tindivo/supabase'

// ── Tipos de fila según el select de cada endpoint ──────────────────────────
// Cada tipo refleja exactamente los campos que devuelve el .select() del handler.
// No se usa Tables<'reports'> completo porque ningún endpoint hace select('*').

export type CustomerAppealRow = Pick<
  Tables<'reports'>,
  | 'id'
  | 'order_id'
  | 'appeal_status'
  | 'refund_status'
  | 'refund_amount'
  | 'refund_completed_at'
  | 'appeal_deadline'
  | 'description'
  | 'status'
  | 'created_at'
  | 'updated_at'
>

export type AdminAppealRow = Pick<
  Tables<'reports'>,
  | 'id'
  | 'order_id'
  | 'business_id'
  | 'customer_user_id'
  | 'customer_phone'
  | 'description'
  | 'evidence_url'
  | 'appeal_status'
  | 'refund_status'
  | 'refund_proof_path'
  | 'refund_amount'
  | 'refund_completed_at'
  | 'appeal_deadline'
  | 'resolved_by'
  | 'resolved_at'
  | 'resolution_note'
  | 'created_by'
  | 'type'
  | 'status'
  | 'created_at'
  | 'updated_at'
> & {
  orders: {
    short_id: string
    customer_name: string | null
    created_at: string
    rejection_reason_code: string | null
    rejection_reason_text: string | null
    proof_attempt: number | null
    businesses: { name: string; yape_number: string | null; plin_number: string | null } | null
  } | null
}

// ── Validaciones separadas según el contexto ────────────────────────────────

function assertCustomerAppealFields(row: CustomerAppealRow): void {
  const missing: string[] = []
  if (!row.order_id) missing.push('order_id')
  if (!row.appeal_status) missing.push('appeal_status')
  if (missing.length) {
    throw new Error(
      `Apelación de cliente incompleta ${row.id}: faltan ${missing.join(', ')}`,
    )
  }
}

function assertAdminAppealFields(row: AdminAppealRow): void {
  const missing: string[] = []
  if (!row.order_id) missing.push('order_id')
  if (!row.business_id) missing.push('business_id')
  if (!row.customer_user_id) missing.push('customer_user_id')
  if (!row.appeal_status) missing.push('appeal_status')
  if (missing.length) {
    throw new Error(
      `Apelación administrativa incompleta ${row.id}: faltan ${missing.join(', ')}`,
    )
  }
}

// ── Mappers ─────────────────────────────────────────────────────────────────

export function toCustomerAppealDto(row: CustomerAppealRow): CustomerAppealDto {
  assertCustomerAppealFields(row)
  return {
    id: row.id,
    orderId: row.order_id!,
    appealStatus: AppealStatusSchema.parse(row.appeal_status),
    refundStatus: row.refund_status
      ? RefundStatusSchema.parse(row.refund_status)
      : null,
    refundAmount:
      row.refund_amount !== null && row.refund_amount !== undefined
        ? Number(row.refund_amount)
        : null,
    refundCompletedAt: row.refund_completed_at ?? null,
    appealDeadline: row.appeal_deadline ?? null,
    description: row.description ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toAdminAppealDto(row: AdminAppealRow): AdminAppealDto {
  assertAdminAppealFields(row)
  const order = row.orders
  const biz = order?.businesses
  return {
    id: row.id,
    orderId: row.order_id!,
    orderShortId: order?.short_id ?? null,
    businessId: row.business_id!,
    customerUserId: row.customer_user_id!,
    customerPhone: row.customer_phone ?? null,
    customerName: order?.customer_name ?? null,
    description: row.description ?? null,
    evidenceUrl: row.evidence_url ?? null,
    appealStatus: AppealStatusSchema.parse(row.appeal_status),
    refundStatus: row.refund_status
      ? RefundStatusSchema.parse(row.refund_status)
      : null,
    refundProofPath: row.refund_proof_path ?? null,
    refundAmount:
      row.refund_amount !== null && row.refund_amount !== undefined
        ? Number(row.refund_amount)
        : null,
    refundCompletedAt: row.refund_completed_at ?? null,
    appealDeadline: row.appeal_deadline ?? null,
    resolvedBy: row.resolved_by ?? null,
    resolvedAt: row.resolved_at ?? null,
    resolutionNote: row.resolution_note ?? null,
    createdBy: row.created_by ?? null,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    orderCreatedAt: order?.created_at ?? null,
    businessName: biz?.name ?? null,
    yapeNumber: biz?.yape_number ?? biz?.plin_number ?? null,
    rejectionReasonCode: order?.rejection_reason_code ?? null,
    rejectionReasonText: order?.rejection_reason_text ?? null,
    proofAttempt: order?.proof_attempt ?? null,
  }
}

// ── Legacy alias (deprecado, mantener para compatibilidad temporal) ─────────

/** @deprecated Usar toCustomerAppealDto o toAdminAppealDto según el contexto. */
export { toCustomerAppealDto as mapReportRowToDto }
