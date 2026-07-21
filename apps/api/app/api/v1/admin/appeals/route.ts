import { AppealListQuerySchema } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { toAdminAppealDto } from '@/lib/mappers/appeal'
import { createUserClient } from '@/lib/supabase/user'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Bandeja de apelaciones del admin.
 * Lista reportes de tipo rejected_proof_disputed con filtros, paginación y conteo exacto.
 * Usa createUserClient(token) — la RLS rep_admin_all autoriza la lectura.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { token } = await requireRole(req, 'admin')
    const url = new URL(req.url)
    const query = AppealListQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries()),
    )

    const client = createUserClient(token)
    const offset = (query.page - 1) * query.per_page

    let builder = client
      .from('reports')
      .select(
        `id, type, status, order_id, business_id, customer_user_id, customer_phone,
        description, evidence_url, appeal_status, refund_status, refund_amount,
        refund_proof_path, refund_completed_at, appeal_deadline,
        resolved_by, resolved_at, resolution_note, created_by, created_at, updated_at,
        orders(short_id, customer_name, created_at, rejection_reason_code, rejection_reason_text, proof_attempt, businesses(name, yape_number, plin_number))`,
        { count: 'exact' },
      )
      .eq('type', 'rejected_proof_disputed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + query.per_page - 1)

    if (query.appeal_status) {
      builder = builder.eq('appeal_status', query.appeal_status)
    }
    if (query.refund_status) {
      builder = builder.eq('refund_status', query.refund_status)
    }

    const { data, error, count } = await builder

    if (error) throw new Error(error.message)

    const items = (data ?? []).map((row) => toAdminAppealDto(row as any))

    return ok(
      {
        items,
        total: count ?? 0,
        page: query.page,
        perPage: query.per_page,
      },
      { headers: corsHeaders(req) },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
