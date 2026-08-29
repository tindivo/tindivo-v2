import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { modeToRule } from '../lib/utils'
import type { LibraryGroup, LibraryItem, LibraryOption, RuleMode } from '../types'

async function loadLibrary(
  bizId: string,
): Promise<{ groups: LibraryGroup[]; items: LibraryItem[] }> {
  const supabase = getSupabaseBrowser()

  const [{ data: groupRows, error: gErr }, { data: itemRows }, { data: catRows }] =
    await Promise.all([
      supabase
        .from('menu_modifier_groups')
        .select(
          'id,name,selection_type,is_required,min_selections,max_selections,price_display,display_order,is_library',
        )
        .eq('business_id', bizId)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select('id,name,category_id,display_order')
        .eq('business_id', bizId)
        .is('deleted_at', null)
        .order('display_order'),
      supabase.from('menu_categories').select('id,name').eq('business_id', bizId),
    ])
  if (gErr) throw new Error(gErr.message)

  const groupIds = (groupRows ?? []).map((g) => g.id)
  const itemIds = (itemRows ?? []).map((i) => i.id)

  const [{ data: optionRows }, { data: linkRows }] = await Promise.all([
    groupIds.length > 0
      ? supabase
          .from('menu_modifier_options')
          .select('id,group_id,name,additional_price,is_available,display_order')
          .in('group_id', groupIds)
          .order('display_order')
      : Promise.resolve({ data: [] }),
    // Se acota a los platos del negocio a propósito: la policy de lectura de
    // `menu_item_modifier_groups` es pública para negocios publicados, así que
    // sin este filtro el contador diría "en 9 platos" contando los de otro.
    itemIds.length > 0
      ? supabase.from('menu_item_modifier_groups').select('item_id,group_id').in('item_id', itemIds)
      : Promise.resolve({ data: [] }),
  ])

  const optionsByGroup: Record<string, LibraryOption[]> = {}
  for (const o of optionRows ?? []) {
    const list = optionsByGroup[o.group_id] ?? []
    list.push({
      id: o.id,
      name: o.name,
      additional_price: Number(o.additional_price ?? 0),
      is_available: o.is_available,
      display_order: o.display_order,
    })
    optionsByGroup[o.group_id] = list
  }

  const itemsByGroup: Record<string, string[]> = {}
  for (const l of linkRows ?? []) {
    const list = itemsByGroup[l.group_id] ?? []
    list.push(l.item_id)
    itemsByGroup[l.group_id] = list
  }

  const catNames: Record<string, string> = {}
  for (const c of catRows ?? []) catNames[c.id] = c.name

  return {
    groups: (groupRows ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      selection_type: g.selection_type === 'multi' ? ('multi' as const) : ('single' as const),
      is_required: g.is_required,
      min_selections: g.min_selections,
      max_selections: g.max_selections,
      price_display: g.price_display === 'total' ? ('total' as const) : ('delta' as const),
      display_order: g.display_order,
      options: optionsByGroup[g.id] ?? [],
      itemIds: itemsByGroup[g.id] ?? [],
      isLibrary: g.is_library,
    })),
    items: (itemRows ?? []).map((i) => ({
      id: i.id,
      name: i.name,
      categoryName: catNames[i.category_id] ?? 'Sin categoría',
    })),
  }
}

export function useModifierLibrary(bizId: string | null, open: boolean, onChanged: () => void) {
  const [groups, setGroups] = useState<LibraryGroup[]>([])
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!bizId) return
    setLoading(true)
    setError(null)
    try {
      const data = await loadLibrary(bizId)
      setGroups(data.groups)
      setItems(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar los extras.')
    }
    setLoading(false)
  }, [bizId])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload])

  async function persist(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
  ): Promise<void> {
    setBusy(true)
    setError(null)
    const { error: e } = await fn()
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    await reload()
    onChanged()
  }

  /**
   * El único cambio que se aplica en caliente. La cajera apaga una salsa en
   * plena noche y tiene que verlo ya, sin esperar la recarga; el resto de la
   * edición sí puede permitirse el viaje de ida y vuelta.
   */
  async function toggleOption(groupId: string, optionId: string, next: boolean): Promise<boolean> {
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== groupId
          ? g
          : {
              ...g,
              options: g.options.map((o) => (o.id === optionId ? { ...o, is_available: next } : o)),
            },
      ),
    )
    const supabase = getSupabaseBrowser()
    const { error: e } = await supabase
      .from('menu_modifier_options')
      .update({ is_available: next })
      .eq('id', optionId)
    if (e) {
      setError(e.message)
      setGroups((prev) =>
        prev.map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                options: g.options.map((o) =>
                  o.id === optionId ? { ...o, is_available: !next } : o,
                ),
              },
        ),
      )
      return false
    }
    onChanged()
    return true
  }

  async function addGroup() {
    if (!bizId) return
    const supabase = getSupabaseBrowser()
    const nextOrder = groups.length > 0 ? Math.max(...groups.map((g) => g.display_order)) + 1 : 0
    await persist(() =>
      supabase.from('menu_modifier_groups').insert({
        business_id: bizId,
        name: 'Nuevo grupo',
        selection_type: 'multi',
        is_required: false,
        min_selections: 0,
        max_selections: 3,
        price_display: 'delta',
        display_order: nextOrder,
        // Nace EN la biblioteca: se está creando desde el panel de Extras, que
        // es la declaración de intención. Sin esto caería en `false` por el
        // defecto de la columna y no saldría en el buscador de ningún plato —
        // un grupo recién creado aquí tiene cero enlaces, así que deducir la
        // pertenencia del número de platos lo dejaría invisible justo cuando el
        // dueño lo acaba de crear y lo va a buscar.
        is_library: true,
      }),
    )
  }

  async function saveGroupName(group: LibraryGroup, name: string) {
    if (!bizId || name.trim() === group.name) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_modifier_groups')
        .update({ name: name.trim() || 'Sin nombre' })
        .eq('id', group.id)
        .eq('business_id', bizId),
    )
  }

  async function saveGroupRule(group: LibraryGroup, mode: RuleMode) {
    if (!bizId) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_modifier_groups')
        .update(modeToRule(mode, group.max_selections))
        .eq('id', group.id)
        .eq('business_id', bizId),
    )
  }

  async function addOption(group: LibraryGroup) {
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase.from('menu_modifier_options').insert({
        group_id: group.id,
        name: 'Nueva opción',
        additional_price: 0,
        is_available: true,
        display_order: group.options.length,
      }),
    )
  }

  async function saveOption(option: LibraryOption, patch: { name?: string; price?: number }) {
    const next: { name?: string; additional_price?: number } = {}
    if (patch.name !== undefined && patch.name.trim() !== option.name) {
      next.name = patch.name.trim() || 'Sin nombre'
    }
    if (patch.price !== undefined && patch.price !== option.additional_price) {
      next.additional_price = patch.price
    }
    if (Object.keys(next).length === 0) return
    const supabase = getSupabaseBrowser()
    await persist(() => supabase.from('menu_modifier_options').update(next).eq('id', option.id))
  }

  async function deleteOption(optionId: string) {
    const supabase = getSupabaseBrowser()
    await persist(() => supabase.from('menu_modifier_options').delete().eq('id', optionId))
  }

  async function deleteGroup(group: LibraryGroup) {
    if (!bizId) return
    // Las opciones y los enlaces caen por `on delete cascade`. El historial de
    // pedidos no se toca: `customer_order_item_modifiers` guarda nombre y
    // precio como texto, no como referencia (ver 0002_tables.sql).
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase.from('menu_modifier_groups').delete().eq('id', group.id).eq('business_id', bizId),
    )
  }

  /**
   * Reemplaza de una sola vez los platos donde vive el grupo. Es la operación
   * que hace reutilizable a un grupo: sin ella, dejar "Salsas" en once platos
   * obliga a entrar once veces al editor.
   */
  async function setGroupItems(group: LibraryGroup, nextItemIds: string[]) {
    const current = new Set(group.itemIds)
    const next = new Set(nextItemIds)
    const toAdd = nextItemIds.filter((id) => !current.has(id))
    const toRemove = group.itemIds.filter((id) => !next.has(id))
    if (toAdd.length === 0 && toRemove.length === 0) return

    const supabase = getSupabaseBrowser()
    setBusy(true)
    setError(null)

    if (toRemove.length > 0) {
      const { error: delErr } = await supabase
        .from('menu_item_modifier_groups')
        .delete()
        .eq('group_id', group.id)
        .in('item_id', toRemove)
      if (delErr) {
        setError(delErr.message)
        setBusy(false)
        return
      }
    }

    if (toAdd.length > 0) {
      // El orden del grupo dentro del plato vive en la tabla de enlace, no en
      // el grupo: el mismo grupo puede ir primero en un plato y último en otro.
      const countByItem: Record<string, number> = {}
      for (const g of groups) {
        for (const itemId of g.itemIds) countByItem[itemId] = (countByItem[itemId] ?? 0) + 1
      }
      const { error: insErr } = await supabase.from('menu_item_modifier_groups').insert(
        toAdd.map((itemId) => ({
          item_id: itemId,
          group_id: group.id,
          display_order: countByItem[itemId] ?? 0,
        })),
      )
      if (insErr) {
        setError(insErr.message)
        setBusy(false)
        return
      }
    }

    setBusy(false)
    await reload()
    onChanged()
  }

  return {
    groups,
    items,
    loading,
    busy,
    error,
    reload,
    toggleOption,
    addGroup,
    saveGroupName,
    saveGroupRule,
    addOption,
    saveOption,
    deleteOption,
    deleteGroup,
    setGroupItems,
  }
}
