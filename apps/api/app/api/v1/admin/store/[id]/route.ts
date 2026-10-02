import { storeProductPatchSchema } from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import {
  loadProduct,
  patchToColumns,
  storageDeleteUrls,
  storeDb,
  throwDbError,
} from '@/lib/store/store'

export const dynamic = 'force-dynamic'

const IdSchema = z.uuid()

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = IdSchema.parse((await params).id)
    return ok(await loadProduct(storeDb(), id), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Autosave: cualquier subconjunto de campos editables (`status` va por su ruta). */
export async function PATCH(req: Request, { params }: Ctx): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = IdSchema.parse((await params).id)
    const patch = storeProductPatchSchema.parse(await req.json())
    const columns = patchToColumns(patch)
    const db = storeDb()
    if (Object.keys(columns).length > 0) {
      const { error } = await db.from('store_products').update(columns).eq('id', id)
      if (error) throwDbError(error)
    }
    return ok(await loadProduct(db, id), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Solo se eliminan borradores; un publicado se oculta (su link ya circula). */
export async function DELETE(req: Request, { params }: Ctx): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = IdSchema.parse((await params).id)
    const db = storeDb()
    const product = await loadProduct(db, id)
    if (product.status !== 'draft') {
      throw new DomainError('Solo se eliminan borradores; usa Ocultar', 'conflict')
    }
    const { error } = await db.from('store_products').delete().eq('id', id).eq('status', 'draft')
    if (error) throw new Error(error.message)
    await storageDeleteUrls(
      db,
      product.images.flatMap((i) => [i.url, i.thumbUrl]),
    )
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
