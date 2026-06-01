import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

const Schema = z.object({
  status: z.enum(['resolved', 'dismissed']).default('resolved'),
  resolutionNote: z.string().trim().max(500).optional(),
})

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** El admin resuelve/descarta un reporte de la bandeja con una nota. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const { id } = await params
    const body = Schema.parse(await req.json().catch(() => ({})))
    const service = createServiceClient()
    const { data, error } = await service
      .from('reports')
      .update({
        status: body.status,
        resolution_note: body.resolutionNote ?? null,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'open')
      .select('id,status')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new DomainError('Reporte no encontrado o ya resuelto', 'not_found')
    return ok(data, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
