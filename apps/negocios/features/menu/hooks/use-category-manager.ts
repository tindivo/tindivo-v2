import { useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { CatRow } from '../types'

export function useCategoryManager(bizId: string | null, open: boolean, onChanged: () => void) {
  const [rows, setRows] = useState<CatRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CatRow | null>(null)

  const reload = useCallback(async () => {
    if (!bizId) return
    const supabase = getSupabaseBrowser()
    setLoading(true)
    setError(null)
    const [{ data: catData, error: catErr }, { data: itemData }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,blurb,display_order,is_active')
        .eq('business_id', bizId)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select('category_id')
        .eq('business_id', bizId)
        .is('deleted_at', null),
    ])
    if (catErr) {
      setError(catErr.message)
      setLoading(false)
      return
    }
    const counts: Record<string, number> = {}
    for (const it of itemData ?? []) counts[it.category_id] = (counts[it.category_id] ?? 0) + 1
    setRows(
      (catData ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        blurb: c.blurb ?? '',
        display_order: c.display_order,
        is_active: c.is_active,
        itemCount: counts[c.id] ?? 0,
      })),
    )
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

  async function addCategory() {
    if (!bizId) return
    const supabase = getSupabaseBrowser()
    const nextOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0
    await persist(() =>
      supabase.from('menu_categories').insert({
        business_id: bizId,
        name: 'Nueva categoría',
        display_order: nextOrder,
        is_active: true,
      }),
    )
  }

  async function saveName(row: CatRow, name: string) {
    if (!bizId || name.trim() === row.name) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_categories')
        .update({ name: name.trim() || 'Sin nombre' })
        .eq('id', row.id)
        .eq('business_id', bizId),
    )
  }

  async function saveBlurb(row: CatRow, blurb: string) {
    if (!bizId || blurb.trim() === row.blurb) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_categories')
        .update({ blurb: blurb.trim() || null })
        .eq('id', row.id)
        .eq('business_id', bizId),
    )
  }

  async function toggleActive(row: CatRow) {
    if (!bizId) return
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase
        .from('menu_categories')
        .update({ is_active: !row.is_active })
        .eq('id', row.id)
        .eq('business_id', bizId),
    )
  }

  async function move(index: number, dir: -1 | 1) {
    if (!bizId) return
    const other = index + dir
    if (other < 0 || other >= rows.length) return
    const newRows = [...rows]
    const a = newRows[index]
    const b = newRows[other]
    if (!a || !b) return
    newRows[index] = b
    newRows[other] = a
    const supabase = getSupabaseBrowser()
    setBusy(true)
    setError(null)
    for (let i = 0; i < newRows.length; i++) {
      const r = newRows[i]
      if (r && r.display_order !== i) {
        const { error: e } = await supabase
          .from('menu_categories')
          .update({ display_order: i })
          .eq('id', r.id)
          .eq('business_id', bizId)
        if (e) {
          setError(e.message)
          setBusy(false)
          return
        }
      }
    }
    setBusy(false)
    await reload()
    onChanged()
  }

  async function doDelete(row: CatRow) {
    if (!bizId) return
    setConfirmDelete(null)
    const supabase = getSupabaseBrowser()
    await persist(() =>
      supabase.from('menu_categories').delete().eq('id', row.id).eq('business_id', bizId),
    )
  }

  return {
    rows,
    loading,
    busy,
    error,
    confirmDelete,
    setConfirmDelete,
    addCategory,
    saveName,
    saveBlurb,
    toggleActive,
    move,
    doDelete,
  }
}
