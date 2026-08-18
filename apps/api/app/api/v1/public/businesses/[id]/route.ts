import { corsHeaders, handleOptions } from '@/lib/http/cors'
import { handleError, ok, problem } from '@/lib/http/problem'
import { getRequestId } from '@/lib/http/request-id'
import { hasConfirmedOpening } from '@/lib/opening/service-day'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// Columnas seguras (sin yape_number/balance — el Yape se entrega al confirmar
// prepago). whatsapp_number es el contacto público opt-in del modo catálogo.
const BUSINESS_COLUMNS =
  'id,slug,name,accent_color,logo_url,banner_url,tagline,categoria,primary_capability,estimated_eta_min,estimated_eta_max,coordinates_lat,coordinates_lng,address,accepts_web_pickup,accepts_web_delivery,whatsapp_number'

/**
 * El segmento `[id]` acepta las DOS formas: el uuid y el slug público
 * (`/negocio/pizza-priamo`). Se distinguen por forma, no consultando dos veces:
 * un slug nunca tiene el formato de un uuid porque `slugify` solo deja
 * `[a-z0-9-]` y jamás produce los cuatro guiones en esas posiciones.
 *
 * Sigue aceptando uuid a propósito: hay enlaces repartidos por WhatsApp con esa
 * forma y tienen que seguir abriendo. El front los redirige al slug (301).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    // 1) Negocio y fecha de servicio en paralelo. La fecha no depende del
    // negocio, así que se lanza al mismo tiempo. Si falla, seguimos con
    // openingConfirmed = null (un fallo transitorio no puede cerrar el catálogo).
    const [businessResult, serviceDateResult] = await Promise.allSettled([
      supabase
        .from('businesses')
        .select(BUSINESS_COLUMNS)
        .eq(UUID_RE.test(id) ? 'id' : 'slug', id)
        .eq('publishes_catalog', true)
        .eq('is_active', true)
        .eq('is_blocked', false)
        .maybeSingle(),
      supabase.rpc('current_service_date'),
    ])

    if (businessResult.status === 'rejected') {
      throw new Error(String(businessResult.reason))
    }
    const { data: business, error: bizError } = businessResult.value
    if (bizError) throw new Error(bizError.message)
    if (!business) {
      return problem('not_found', {
        detail: 'Negocio no encontrado o no disponible',
        requestId,
        headers: corsHeaders(req),
      })
    }

    // A partir de aquí SIEMPRE el uuid resuelto, nunca el segmento de la URL:
    // `id` puede ser un slug, y `business_id` es una columna uuid. Compararla
    // contra 'pizza-priamo' no devuelve vacío, revienta la consulta entera
    // (22P02) y la página del negocio responde 500.
    const businessId = business.id

    const serviceDate =
      serviceDateResult.status === 'fulfilled' ? serviceDateResult.value.data : null

    // 2) Categorías, ítems, grupos, horario, opciones y links en paralelo.
    // Las tablas de opciones/links no tienen business_id propio; se filtran
    // vía join con menu_modifier_groups para evitar descargar TODO el catálogo.
    const [
      { data: categories, error: catError },
      { data: items, error: itemError },
      { data: groups },
      { data: options },
      { data: links },
      { data: schedule },
      openingConfirmed,
    ] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,blurb,display_order')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select(
          'id,category_id,name,description,base_price,image_url,image_hue,is_available,is_compact,badges,display_order',
        )
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('display_order'),
      supabase
        .from('menu_modifier_groups')
        .select(
          'id,name,selection_type,is_required,min_selections,max_selections,price_display,display_order',
        )
        .eq('business_id', businessId)
        .order('display_order'),
      supabase
        .from('menu_modifier_options')
        .select(
          'id,group_id,name,description,additional_price,display_order,is_available,menu_modifier_groups!inner(business_id)',
        )
        .eq('menu_modifier_groups.business_id', businessId)
        .order('display_order'),
      supabase
        .from('menu_item_modifier_groups')
        .select('item_id,group_id,display_order,menu_modifier_groups!inner(business_id)')
        .eq('menu_modifier_groups.business_id', businessId)
        .order('display_order'),
      // Horario semanal (informativo + estado abierto/cerrado; el cliente lo computa).
      supabase
        .from('business_schedule')
        .select('day_of_week,is_open,shift1_start,shift1_end,shift2_start,shift2_end')
        .eq('business_id', businessId)
        .order('day_of_week'),
      hasConfirmedOpening(supabase, businessId, serviceDate),
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
          // Solo cambia cómo se muestra el precio de las opciones: 'total'
          // enseña el precio final del plato en vez de "+ S/ x" (migración
          // 0156). La suma que cobra el servidor es la misma.
          price_display: g.price_display ?? 'delta',
          options: optionsByGroup(g.id),
        }))

    const menu = (categories ?? [])
      .map((category) => ({
        ...category,
        items: (items ?? [])
          .filter((item) => item.category_id === category.id)
          // is_compact = "featured" (historical column name). Featured items first;
          // stable sort preserves display_order within each half.
          .sort((a, b) => Number(b.is_compact) - Number(a.is_compact))
          .map((item) => ({ ...item, modifier_groups: groupsForItem(item.id) })),
      }))
      // No mostrar categorías vacías al cliente (una categoría sin platos no aporta).
      .filter((category) => category.items.length > 0)

    const cacheHeaders = {
      'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=45',
      Vary: 'Accept-Encoding',
    }
    return ok(
      { business, categories: menu, schedule: schedule ?? [], opening_confirmed: openingConfirmed },
      { headers: { ...corsHeaders(req), ...cacheHeaders } },
    )
  } catch (err) {
    return handleError(err, requestId, req)
  }
}
