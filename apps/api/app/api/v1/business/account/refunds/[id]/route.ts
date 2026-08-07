import { DomainError } from '@tindivo/core'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

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

    // biome-ignore lint/suspicious/noExplicitAny: business_charges table
    const { data: charge } = await (service as any)
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
    // biome-ignore lint/suspicious/noExplicitAny: reports table
    const { data: report, error: repError } = await (service as any)
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
    let order: any = null
    let events: any[] = []

    if (targetOrderId) {
      const [{ data: rawOrder }, { data: rawLogs }] = await Promise.all([
        service
          .from('orders')
          .select(
            'id, short_id, order_amount, created_at, rejection_reason_code, rejection_reason_text, customer_name, customer_phone',
          )
          .eq('id', targetOrderId)
          .maybeSingle(),
        // biome-ignore lint/suspicious/noExplicitAny: order_event_log table
        (service as any)
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
        (rawLogs || []).map(async (log: any) => {
          const proofUrls: { url: string; label: string }[] = []
          const d = log.data || {}

          if (d.proof_path) {
            const url = await getSignedUrl(d.proof_path)
            if (url) proofUrls.push({ url, label: 'Comprobante' })
          }
          if (d.proofPath) {
            const url = await getSignedUrl(d.proofPath)
            if (url) proofUrls.push({ url, label: 'Comprobante de Devolución' })
          }
          if (d.evidence_url) {
            const url = await getSignedUrl(d.evidence_url)
            if (url) proofUrls.push({ url, label: 'Evidencia en Disputa' })
          }

          return {
            eventType: log.event_type,
            actorRole: log.actor_role,
            createdAt: log.created_at,
            data: d,
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
