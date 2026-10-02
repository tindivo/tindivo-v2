import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { loadProduct, storageDeleteUrls, storeDb, throwDbError } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * Quita una foto. Un artículo publicado no puede quedarse sin fotos (lo impide
 * un trigger de la 0242). Las que quedan se recompactan para que la portada
 * siga siendo la posición 0 sin huecos.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const p = await params
    const id = z.uuid().parse(p.id)
    const imageId = z.uuid().parse(p.imageId)
    const db = storeDb()
    const before = await loadProduct(db, id)
    const target = before.images.find((i) => i.id === imageId)
    if (!target) throw new DomainError('Foto no encontrada', 'not_found')

    const { error } = await db
      .from('store_product_images')
      .delete()
      .eq('id', imageId)
      .eq('product_id', id)
    if (error) throwDbError(error)

    const rest = before.images.filter((i) => i.id !== imageId).map((i) => i.id)
    if (rest.length > 0) {
      const { error: reorderError } = await db.rpc('reorder_store_images', {
        p_product_id: id,
        p_ids: rest,
      })
      if (reorderError) throw new Error(reorderError.message)
    }
    await storageDeleteUrls(db, [target.url, target.thumbUrl])
    return ok(await loadProduct(db, id), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
