import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/**
 * GET /public/courier/directory: los comercios del directorio de Entregas.
 *
 * SIN `phone` NI `whatsapp`, a propósito. La tabla los guarda y la web los
 * leía con `select(...)` directo, pero son datos del comercio que no tienen
 * por qué estar en el teléfono de cualquiera (hallazgo de seguridad de
 * `Docs/negocio/servicios/entregas.md`, DECISIONS.md §31). La lista de
 * columnas es explícita: una columna nueva en la tabla nunca sale sola.
 */
export async function GET(req: Request): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { data, error } = await createServiceClient()
      .from('directory_businesses')
      .select(
        'id,name,category,lat,lng,reference_text,opens_at,closes_at,cover_photo_url,is_partner,partner_business_id,courier_enabled,has_menu_in_tindivo,works_with_zorritos',
      )
      .eq('visible_on_map', true)
      .order('name')
    if (error) throw new Error(error.message)
    const items = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
      referenceText: r.reference_text,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
      coverPhotoUrl: r.cover_photo_url,
      isPartner: r.is_partner,
      partnerBusinessId: r.partner_business_id,
      courierEnabled: r.courier_enabled,
      hasMenuInTindivo: r.has_menu_in_tindivo,
      worksWithZorritos: r.works_with_zorritos,
    }))
    return ok({ items }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
