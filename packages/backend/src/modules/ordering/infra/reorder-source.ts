import type { TypedSupabaseClient } from '@tindivo/supabase'
import type { ReorderMenuDish, ReorderMenuGroup, ReorderOriginalLine } from '../domain/reorder'

/** Soles -> céntimos enteros, como la cotización: la suma no arrastra error de coma flotante. */
const cents = (soles: number): number => Math.round(Number(soles) * 100)

const byCreatedAtThenId = <T extends { created_at: string; id: string }>(a: T, b: T): number =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)

export interface ReorderSource {
  orderId: string
  businessId: string
  businessName: string
  lines: ReorderOriginalLine[]
  dishes: Map<string, ReorderMenuDish>
}

/**
 * El pedido de restaurante PROPIO y el menú actual de sus platos, o `null` si no
 * es del cliente o no existe (un 404 idéntico: no confirma que exista). Se lee con
 * el servicio, filtrando por el dueño: el cliente no lee precios ni opciones de un
 * negocio por RLS. Las Entregas viven en `courier_orders`, así que nunca entran.
 */
export async function loadReorderSource(
  db: TypedSupabaseClient,
  orderId: string,
  customerUserId: string,
): Promise<ReorderSource | null> {
  const { data: order, error } = await db
    .from('orders')
    .select(
      'id,business_id,customer_order_items(id,menu_item_id,item_name_snapshot,quantity,note,unit_price,created_at,customer_order_item_modifiers(group_name_snapshot,option_name_snapshot))',
    )
    .eq('id', orderId)
    .eq('customer_user_id', customerUserId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!order) return null

  // Los ítems se insertan en una sola transacción y empatan en `created_at`: el id
  // desempata para que el orden sea siempre el mismo.
  const items = [...order.customer_order_items].sort(byCreatedAtThenId)
  const lines: ReorderOriginalLine[] = items.map((i) => ({
    menuItemId: i.menu_item_id,
    itemName: i.item_name_snapshot,
    quantity: i.quantity,
    note: i.note,
    unitPriceCents: cents(i.unit_price),
    modifiers: i.customer_order_item_modifiers.map((m) => ({
      groupName: m.group_name_snapshot,
      optionName: m.option_name_snapshot,
    })),
  }))

  const { data: business, error: bizErr } = await db
    .from('businesses')
    .select('name')
    .eq('id', order.business_id)
    .maybeSingle()
  if (bizErr) throw new Error(bizErr.message)

  const itemIds = [
    ...new Set(lines.flatMap((l) => (l.menuItemId ? [l.menuItemId.toLowerCase()] : []))),
  ]
  const dishes = new Map<string, ReorderMenuDish>()
  if (itemIds.length > 0) {
    const [{ data: rows, error: dishErr }, { data: links, error: linkErr }] = await Promise.all([
      db
        .from('menu_items')
        .select(
          'id,business_id,name,base_price,is_available,deleted_at,available_days,available_from,available_to,image_url,thumbnail_url',
        )
        .in('id', itemIds),
      db
        .from('menu_item_modifier_groups')
        .select(
          'item_id,group_id,group:menu_modifier_groups!inner(id,name,selection_type,is_required,min_selections,max_selections)',
        )
        .in('item_id', itemIds)
        .order('display_order')
        .order('group_id'),
    ])
    if (dishErr) throw new Error(dishErr.message)
    if (linkErr) throw new Error(linkErr.message)

    const groupIds = [...new Set((links ?? []).map((l) => l.group_id))]
    const { data: options, error: optErr } =
      groupIds.length > 0
        ? await db
            .from('menu_modifier_options')
            .select('id,group_id,name,additional_price,is_available')
            .in('group_id', groupIds)
            .order('display_order')
            .order('id')
        : { data: [], error: null }
    if (optErr) throw new Error(optErr.message)

    // La misma franja que aplica la creación del pedido (`menu_item_orderable_now`).
    const orderable = new Map<string, boolean>()
    await Promise.all(
      (rows ?? []).map(async (d) => {
        const { data, error: rpcErr } = await db.rpc('menu_item_orderable_now', {
          p_days: d.available_days as number[],
          p_from: d.available_from as string,
          p_to: d.available_to as string,
        })
        if (rpcErr) throw new Error(rpcErr.message)
        orderable.set(d.id, data === true)
      }),
    )

    for (const d of rows ?? []) {
      const groups: ReorderMenuGroup[] = (links ?? [])
        .filter((l) => l.item_id === d.id)
        .map((l) => ({
          ...l.group,
          options: (options ?? [])
            .filter((o) => o.group_id === l.group_id)
            .map((o) => ({
              id: o.id,
              name: o.name,
              priceCents: cents(o.additional_price),
              isAvailable: o.is_available,
            })),
        }))
      dishes.set(d.id.toLowerCase(), {
        id: d.id,
        businessId: d.business_id,
        name: d.name,
        basePriceCents: cents(d.base_price),
        isAvailable: d.is_available,
        deleted: d.deleted_at !== null,
        orderableNow: orderable.get(d.id) === true,
        imageUrl: d.image_url,
        thumbnailUrl: d.thumbnail_url,
        groups,
      })
    }
  }

  return {
    orderId: order.id,
    businessId: order.business_id,
    businessName: business?.name ?? '',
    lines,
    dishes,
  }
}
