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
    const { data: charge } = await (service as any)
      .from('business_charges')
      .select('id, report_id, amount, description, created_at')
      .or(`id.eq.${id},report_id.eq.${id}`)
      .eq('business_id', biz.id)
      .maybeSingle()

    if (charge?.report_id) {
      reportId = charge.report_id
    }

    // 3. Buscar el reporte
    const { data: report, error: repError } = await (service as any)
      .from('reports')
      .select(
        'id, type, description, resolution_note, refund_proof_path, refund_amount, appeal_status, evidence_url, created_at, order_id, business_id',
      )
      .eq('id', reportId)
      .eq('business_id', biz.id)
      .maybeSingle()

    if (repError) throw new Error(repError.message)
    if (!report) throw new DomainError('Detalle de devolución no encontrado', 'not_found')

    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://psjigdoinfpgrnedxeyf.supabase.co'
    const toPublicUrl = (path: string | null | undefined) => {
      if (!path) return null
      return path.startsWith('http://') || path.startsWith('https://')
        ? path
        : `${baseUrl}/storage/v1/object/public/order-proofs/${path}`
    }

    // 4. Buscar información del pedido si existe
    let order: any = null
    let events: any[] = []

    if (report.order_id) {
      const [{ data: rawOrder }, { data: rawLogs }] = await Promise.all([
        service
          .from('orders')
          .select(
            'id, short_id, order_amount, created_at, rejection_reason_code, rejection_reason_text, customer_name, customer_phone',
          )
          .eq('id', report.order_id)
          .maybeSingle(),
        (service as any)
          .from('order_event_log')
          .select('event_type, actor_role, created_at, data')
          .eq('order_id', report.order_id)
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

      events = (rawLogs || []).map((log: any) => {
        const proofUrls: { url: string; label: string }[] = []
        const d = log.data || {}
        if (d.proof_path) proofUrls.push({ url: toPublicUrl(d.proof_path)!, label: 'Comprobante' })
        if (d.proofPath) proofUrls.push({ url: toPublicUrl(d.proofPath)!, label: 'Comprobante de Devolución' })
        if (d.evidence_url) proofUrls.push({ url: toPublicUrl(d.evidence_url)!, label: 'Evidencia en Disputa' })

        return {
          eventType: log.event_type,
          actorRole: log.actor_role,
          createdAt: log.created_at,
          data: d,
          proofUrls,
        }
      })
    }

    const rawEvidenceUrls: string[] = []
    if (report.refund_proof_path) rawEvidenceUrls.push(report.refund_proof_path)
    if (report.evidence_url && !rawEvidenceUrls.includes(report.evidence_url)) {
      rawEvidenceUrls.push(report.evidence_url)
    }

    const evidenceUrls = rawEvidenceUrls
      .map((p) => toPublicUrl(p))
      .filter((u): u is string => Boolean(u))

    return ok(
      {
        id: report.id,
        type: report.type,
        reason: report.description || report.type,
        resolutionNotes: report.resolution_note,
        refundAmount: report.refund_amount ? Number(report.refund_amount) : charge?.amount ?? 0,
        appealStatus: report.appeal_status,
        createdAt: report.created_at,
        refundProofUrl: toPublicUrl(report.refund_proof_path),
        disputeProofUrl: toPublicUrl(report.evidence_url),
        evidenceUrls,
        chargeAmount: charge ? Number(charge.amount) : Number(report.refund_amount) || 0,
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
