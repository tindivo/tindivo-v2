import { DomainError } from '@tindivo/core'
import { z } from 'zod'
import { requireRole } from '@/lib/http/auth'
import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { loadProduct, storeDb, throwDbError } from '@/lib/store/store'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

type Ctx = { params: Promise<{ id: string }> }

const RegisterSchema = z.object({ url: z.url(), thumbUrl: z.url() })
const OrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(6) })

/**
 * Registra una foto que el admin YA subió al bucket `store-products` (cada foto
 * se sube por separado, PRD §6.3). La URL tiene que apuntar a la carpeta de ESTE
 * artículo: así nadie registra una foto de otro bucket o de internet. La
 * posición es la siguiente libre; el tope de 6 lo hace cumplir la base.
 */
export async function POST(req: Request, { params }: Ctx): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = z.uuid().parse((await params).id)
    const body = RegisterSchema.parse(await req.json())
    const folder = `/storage/v1/object/public/store-products/${id}/`
    if (!body.url.includes(folder) || !body.thumbUrl.includes(folder)) {
      throw new DomainError('La foto no pertenece a este artículo', 'validation_error')
    }
    const db = storeDb()
    const product = await loadProduct(db, id)
    const position =
      product.images.length === 0 ? 0 : Math.max(...product.images.map((i) => i.position)) + 1
    const { error } = await db
      .from('store_product_images')
      .insert({ product_id: id, url: body.url, thumb_url: body.thumbUrl, position })
    if (error) {
      // Una posición fuera de rango (>5) es en realidad «ya hay 6 fotos».
      if (error.message.includes('store_product_images_position_check')) {
        throw new DomainError('Máximo 6 fotos por artículo', 'validation_error')
      }
      throwDbError(error)
    }
    return ok(await loadProduct(db, id), { status: 201, headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}

/** Reordena las fotos: `ids` es el orden nuevo; la primera pasa a ser la portada. */
export async function PUT(req: Request, { params }: Ctx): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    await requireRole(req, 'admin')
    const id = z.uuid().parse((await params).id)
    const { ids } = OrderSchema.parse(await req.json())
    const db = storeDb()
    const { error } = await db.rpc('reorder_store_images', { p_product_id: id, p_ids: ids })
    if (error) {
      if (error.code === 'P0002') throw new DomainError('Artículo no encontrado', 'not_found')
      if (error.message.includes('store_images_order_mismatch')) {
        throw new DomainError('El orden no coincide con las fotos del artículo', 'conflict')
      }
      throw new Error(error.message)
    }
    return ok(await loadProduct(db, id), { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
