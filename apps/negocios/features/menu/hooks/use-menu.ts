import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { MenuCategory, ModifierGroup, ModifierOption } from '../types'

async function loadMenu(businessId: string): Promise<MenuCategory[]> {
  const supabase = getSupabaseBrowser()

  const [{ data: categories }, { data: items }, { data: junctions }, { data: groupsDetails }] =
    await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,display_order')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select(
          'id,category_id,name,base_price,is_available,is_compact,badges,image_url,display_order',
        )
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .order('display_order'),
      supabase.from('menu_item_modifier_groups').select('item_id,group_id'),
      supabase
        .from('menu_modifier_groups')
        .select('id,is_required,max_selections')
        .eq('business_id', businessId),
    ])

  const groupIds = (junctions ?? []).map((j) => j.group_id)
  const { data: options } =
    groupIds.length > 0
      ? await supabase
          .from('menu_modifier_options')
          .select('id,group_id,is_available,additional_price')
          .in('group_id', groupIds)
      : { data: [] }

  const optionsByGroup: Record<string, ModifierOption[]> = {}
  for (const opt of options ?? []) {
    const list = optionsByGroup[opt.group_id] ?? []
    list.push({
      id: opt.id,
      is_available: opt.is_available,
      additional_price: Number(opt.additional_price ?? 0),
    })
    optionsByGroup[opt.group_id] = list
  }

  const groupsDetailsMap: Record<string, { is_required: boolean; max_selections: number | null }> =
    {}
  for (const g of groupsDetails ?? []) {
    groupsDetailsMap[g.id] = {
      is_required: Boolean(g.is_required),
      max_selections: g.max_selections != null ? Number(g.max_selections) : null,
    }
  }

  const groupsByItem: Record<string, ModifierGroup[]> = {}
  for (const j of junctions ?? []) {
    const list = groupsByItem[j.item_id] ?? []
    const details = groupsDetailsMap[j.group_id] ?? { is_required: false, max_selections: null }
    list.push({
      id: j.group_id,
      is_required: details.is_required,
      max_selections: details.max_selections,
      options: optionsByGroup[j.group_id] ?? [],
    })
    groupsByItem[j.item_id] = list
  }

  return (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    display_order: c.display_order,
    items: (items ?? [])
      .filter((i) => i.category_id === c.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        base_price: Number(i.base_price),
        is_available: i.is_available,
        is_compact: i.is_compact,
        badges: i.badges ?? [],
        imageUrl: i.image_url ?? null,
        modifierGroups: groupsByItem[i.id] ?? [],
      })),
  }))
}

export function useMenu() {
  const router = useRouter()
  const [cats, setCats] = useState<MenuCategory[]>([])
  const [bizId, setBizId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async (businessId: string) => {
    const data = await loadMenu(businessId)
    setCats(data)
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      // SE FILTRA POR `user_id`. Ver el porqué largo en `chrome.tsx:refetchBiz`.
      //
      // En corto: `businesses` tiene dos policies permisivas que se suman con
      // OR —`biz_self_read` y `biz_admin_all`—, así que un usuario con rol
      // business Y admin (la cuenta del piloto los tiene los dos) ve TODOS los
      // negocios y `maybeSingle()` revienta con "multiple (or no) rows
      // returned". Aquí el error se descartaba con `const { data: biz }`, así
      // que `bizId` se quedaba en null y la pantalla pintaba "Tu menú está
      // vacío" sobre un menú lleno: la cajera no podía tocar sus platos y nada
      // le decía por qué.
      //
      // `chrome.tsx` ya lo arreglaba —por eso la barra lateral sí acertaba el
      // negocio mientras el contenido salía vacío—, pero el arreglo se quedó
      // allí. Medido el 2026-08-12 con `negocio@e2e.local`.
      const { data: biz, error } = await supabase
        .from('businesses')
        .select('id')
        .eq('user_id', data.session.user.id)
        .maybeSingle()
      if (error) console.error('[menu] no se pudo resolver el negocio:', error.message)
      if (biz?.id) {
        setBizId(biz.id)
        await load(biz.id)
      }
      setReady(true)
    })
  }, [router, load])

  const toggleItemAvailability = useCallback(
    async (itemId: string, nextAvailable: boolean) => {
      if (!bizId) return false
      // Actualización optimista inmediata en la UI
      setCats((prevCats) =>
        prevCats.map((cat) => ({
          ...cat,
          items: cat.items.map((item) =>
            item.id === itemId ? { ...item, is_available: nextAvailable } : item,
          ),
        })),
      )

      const supabase = getSupabaseBrowser()
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: nextAvailable })
        .eq('id', itemId)
        .eq('business_id', bizId)

      if (error) {
        console.error('[menu] no se pudo actualizar la disponibilidad del plato:', error.message)
        // Revertir en caso de error
        setCats((prevCats) =>
          prevCats.map((cat) => ({
            ...cat,
            items: cat.items.map((item) =>
              item.id === itemId ? { ...item, is_available: !nextAvailable } : item,
            ),
          })),
        )
        return false
      }
      return true
    },
    [bizId],
  )

  return { cats, bizId, ready, reload: load, toggleItemAvailability }
}
