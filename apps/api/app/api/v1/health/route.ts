import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { ok } from '@/lib/http/problem'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

export function GET(req: Request): Response {
  return ok(
    { status: 'ok', service: 'tindivo-api', version: 'v1', time: new Date().toISOString() },
    { headers: corsHeaders(req) },
  )
}
