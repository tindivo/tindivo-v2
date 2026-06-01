import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Columnas seguras (sin yape_number/balance — el Yape se entrega al confirmar prepago).
const BUSINESS_COLUMNS =
  'id,name,accent_color,logo_url,banner_url,tagline,categoria,primary_capability,estimated_eta_min,estimated_eta_max,coordinates_lat,coordinates_lng,address,accepts_web_pickup,accepts_web_delivery'

export function OPTIONS(req: Request): Response {
  return handleOptions(req)
}

/** Negocio publicado + su menú (categorías e ítems). Público, sin auth. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = getRequestId(req)
  try {
    const { id } = await params
    const supabase = createServiceClient()

    const { data: business, error: bizError } = await supabase
      .from('businesses')
      .select(BUSINESS_COLUMNS)
      .eq('id', id)
      .eq('publishes_catalog', true)
      .eq('is_active', true)
      .eq('is_blocked', false)
      .maybeSingle()
    if (bizError) throw new Error(bizError.message)
    if (!business) {
      return problem('not_found', {
        detail: 'Negocio no encontrado o no disponible',
        requestId,
        headers: corsHeaders(req),
      })
    }

    const [
      { data: categories, error: catError },
      { data: items, error: itemError },
      { data: groups },
      { data: options },
      { data: links },
    ] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,blurb,display_order')
        .eq('business_id', id)
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select(
          'id,category_id,name,description,base_price,image_hue,is_available,is_compact,badges,display_order',
        )
        .eq('business_id', id)
        .order('display_order'),
      supabase
        .from('menu_modifier_groups')
        .select('id,name,selection_type,is_required,min_selections,max_selections,display_order')
        .eq('business_id', id)
        .order('display_order'),
      supabase
        .from('menu_modifier_options')
        .select('id,group_id,name,description,additional_price,display_order,is_available')
        .order('display_order'),
      supabase.from('menu_item_modifier_groups').select('item_id,group_id,display_order'),
    ])
    if (catError) throw new Error(catError.message)
    if (itemError) throw new Error(itemError.message)

    // Modificadores por ítem (grupo + opciones disponibles).
    const optionsByGroup = (groupId: string) =>
      (options ?? [])
        .filter((o) => o.group_id === groupId && o.is_available)
        .map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description,
          additional_price: o.additional_price,
        }))
    const groupsForItem = (itemId: string) =>
      (links ?? [])
        .filter((l) => l.item_id === itemId)
        .sort((a, b) => a.display_order - b.display_order)
        .map((l) => (groups ?? []).find((g) => g.id === l.group_id))
        .filter((g): g is NonNullable<typeof g> => Boolean(g))
        .map((g) => ({
          id: g.id,
          name: g.name,
          selection_type: g.selection_type,
          is_required: g.is_required,
          min_selections: g.min_selections,
          max_selections: g.max_selections,
          options: optionsByGroup(g.id),
        }))

    const menu = (categories ?? []).map((category) => ({
      ...category,
      items: (items ?? [])
        .filter((item) => item.category_id === category.id)
        .map((item) => ({ ...item, modifier_groups: groupsForItem(item.id) })),
    }))

    return ok({ business, categories: menu }, { headers: corsHeaders(req) })
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
