import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

/** Pedido asociado a la devolución, tal y como lo consume /deuda/devoluciones/[id]. */
type RefundOrderDetail = {
  id: string
  shortId: string
  orderAmount: number
  createdAt: string
  rejectionReasonCode: string | null
  rejectionReasonText: string | null
  customerName: string | null
  customerPhone: string | null
}

/** Entrada del historial del pedido, con las URLs firmadas ya resueltas. */
type RefundTimelineEvent = {
  eventType: string
  actorRole: string | null
  createdAt: string
  data: unknown
  proofUrls: { url: string; label: string }[]
}

/** Claves de `data` que pueden traer un adjunto, en el orden en que se muestran. */
const ATTACHMENT_KEYS = [
  ['proof_path', 'Comprobante'],
  ['proofPath', 'Comprobante de Devolución'],
  ['evidence_url', 'Evidencia en Disputa'],
] as const

/** Los adjuntos viajan dentro de `order_event_log.data` (jsonb), sin forma garantizada. */
function readAttachmentPath(data: unknown, key: string): string | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null
  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Detalle completo de una devolución (apelación/reporte) para el restaurante.
 * Carga perezosa (on-demand) cuando el usuario entra a /deuda/devoluciones/[id].
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { id } = await params
    const { user } = await requireRole(req, 'business')
    const service = createServiceClient()

    // 1. Verificar el negocio del usuario
    const { data: biz, error: bizError } = await service
      .from('businesses')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle()

    if (bizError) throw new Error(bizError.message)
    if (!biz) throw new DomainError('Negocio no encontrado', 'not_found')

    // 2. Buscar por report_id o por charge_id
    let reportId = id
    let targetOrderId: string | null = null

    const { data: charge } = await service
      .from('business_charges')
      .select('id, order_id, report_id, amount, description, created_at')
      .or(`id.eq.${id},report_id.eq.${id}`)
      .eq('business_id', biz.id)
      .maybeSingle()

    if (charge?.report_id) {
      reportId = charge.report_id
    }
    if (charge?.order_id) {
      targetOrderId = charge.order_id
    }

    // 3. Buscar el reporte si existe
    const { data: report, error: repError } = await service
      .from('reports')
      .select(
        'id, type, description, resolution_note, refund_proof_path, refund_amount, appeal_status, evidence_url, created_at, order_id, business_id',
      )
      .eq('id', reportId)
      .eq('business_id', biz.id)
      .maybeSingle()

    if (repError) throw new Error(repError.message)

    if (report?.order_id) {
      targetOrderId = report.order_id
    }

    // El fallback a contingency_advances desapareció con la migración 0123: esa
    // tabla ya no existe y toda devolución vive en business_charges.
    if (!report && !charge) {
      throw new DomainError('Detalle de devolución no encontrado', 'not_found')
    }

    const getSignedUrl = async (pathOrUrl: string | null | undefined): Promise<string | null> => {
      if (!pathOrUrl) return null
      if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
      try {
        const { data, error } = await service.storage
          .from('payment-proofs')
          .createSignedUrl(pathOrUrl, 3600)
        if (error || !data?.signedUrl) return null
        return data.signedUrl
      } catch {
        return null
      }
    }

    // 4. Buscar información del pedido si existe
    let order: RefundOrderDetail | null = null
    let events: RefundTimelineEvent[] = []

    if (targetOrderId) {
      const [{ data: rawOrder }, { data: rawLogs }] = await Promise.all([
        service
          .from('orders')
          .select(
            'id, short_id, order_amount, created_at, rejection_reason_code, rejection_reason_text, customer_name, customer_phone',
          )
          .eq('id', targetOrderId)
          .maybeSingle(),
        service
          .from('order_event_log')
          .select('event_type, actor_role, created_at, data')
          .eq('order_id', targetOrderId)
          .order('created_at', { ascending: true }),
      ])

      order = rawOrder
        ? {
            id: rawOrder.id,
            shortId: rawOrder.short_id,
            orderAmount: Number(rawOrder.order_amount) || 0,
            createdAt: rawOrder.created_at,
            rejectionReasonCode: rawOrder.rejection_reason_code,
            rejectionReasonText: rawOrder.rejection_reason_text,
            customerName: rawOrder.customer_name,
            customerPhone: rawOrder.customer_phone,
          }
        : null

      events = await Promise.all(
        (rawLogs ?? []).map(async (log) => {
          const proofUrls: { url: string; label: string }[] = []
          const d = log.data

          for (const [key, label] of ATTACHMENT_KEYS) {
            const path = readAttachmentPath(d, key)
            if (!path) continue
            const url = await getSignedUrl(path)
            if (url) proofUrls.push({ url, label })
          }

          return {
            eventType: log.event_type,
            actorRole: log.actor_role,
            createdAt: log.created_at,
            data: d ?? {},
            proofUrls,
          }
        }),
      )
    }

    const [refundProofUrl, disputeProofUrl] = await Promise.all([
      getSignedUrl(report?.refund_proof_path),
      getSignedUrl(report?.evidence_url),
    ])

    const evidenceUrls: string[] = []
    if (refundProofUrl) evidenceUrls.push(refundProofUrl)
    if (disputeProofUrl && !evidenceUrls.includes(disputeProofUrl))
      evidenceUrls.push(disputeProofUrl)

    return ok(
      {
        id: report?.id ?? charge?.id ?? id,
        type: report?.type ?? 'prepay_cancellation',
        reason:
          report?.description || report?.type || charge?.description || 'Devolución al cliente',
        resolutionNotes: report?.resolution_note ?? null,
        refundAmount: report?.refund_amount
          ? Number(report.refund_amount)
          : charge
            ? Number(charge.amount)
            : 0,
        appealStatus: report?.appeal_status ?? 'resolved',
        createdAt: report?.created_at ?? charge?.created_at ?? new Date().toISOString(),
        refundProofUrl,
        disputeProofUrl,
        evidenceUrls,
        chargeAmount: charge ? Number(charge.amount) : Number(report?.refund_amount) || 0,
        chargeDescription: charge?.description || 'Cargo por devolución al cliente',
        order,
        events,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
