import { storeSettingsSchema } from '@tindivo/contracts'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { readStoreSettings, storeDb } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Ajustes de Store (`app_settings.store`): WhatsApp, delivery y texto de entrega. */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    return ok(await readStoreSettings(storeDb()), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

export async function PUT(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { user } = await requireRole(req, 'admin')
    const value = storeSettingsSchema.parse(await req.json())
    const db = storeDb()
    const { error } = await db
      .from('app_settings')
      .upsert({ key: 'store', value, updated_by: user.id }, { onConflict: 'key' })
    if (error) throw new Error(error.message)
    return ok(value, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
