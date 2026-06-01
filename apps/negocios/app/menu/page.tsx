'use client'

import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface Item {
  id: string
  name: string
  base_price: number
  is_available: boolean
}
interface Category {
  id: string
  name: string
  items: Item[]
}

const inputCls =
  'h-10 rounded-lg border border-border bg-surface px-3 text-[14px] outline-none focus:border-brand'

export default function MenuEditorPage() {
  const router = useRouter()
  const [bizId, setBizId] = useState<string | null>(null)
  const [cats, setCats] = useState<Category[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newCat, setNewCat] = useState('')

  const load = useCallback(async (businessId: string) => {
    const supabase = getSupabaseBrowser()
    const [{ data: categories }, { data: items }] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id,name,display_order')
        .eq('business_id', businessId)
        .order('display_order'),
      supabase
        .from('menu_items')
        .select('id,category_id,name,base_price,is_available,display_order')
        .eq('business_id', businessId)
        .order('display_order'),
    ])
    setCats(
      (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        items: (items ?? [])
          .filter((i) => i.category_id === c.id)
          .map((i) => ({
            id: i.id,
            name: i.name,
            base_price: i.base_price,
            is_available: i.is_available,
          })),
      })),
    )
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      const { data: biz } = await supabase.from('businesses').select('id').maybeSingle()
      if (biz?.id) {
        setBizId(biz.id)
        await load(biz.id)
      }
      setReady(true)
    })
  }, [router, load])

  async function addCategory(e: FormEvent) {
    e.preventDefault()
    if (!bizId || !newCat.trim()) return
    setError(null)
    const { error: err } = await getSupabaseBrowser()
      .from('menu_categories')
      .insert({ business_id: bizId, name: newCat.trim(), display_order: cats.length })
    if (err) setError(err.message)
    else {
      setNewCat('')
      await load(bizId)
    }
  }

  async function addItem(categoryId: string, name: string, price: number) {
    if (!bizId) return
    setError(null)
    const { error: err } = await getSupabaseBrowser()
      .from('menu_items')
      .insert({ business_id: bizId, category_id: categoryId, name, base_price: price })
    if (err) setError(err.message)
    else await load(bizId)
  }

  async function toggleItem(item: Item) {
    if (!bizId) return
    await getSupabaseBrowser()
      .from('menu_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)
    await load(bizId)
  }

  async function deleteItem(id: string) {
    if (!bizId) return
    await getSupabaseBrowser().from('menu_items').delete().eq('id', id)
    await load(bizId)
  }

  async function deleteCategory(id: string) {
    if (!bizId) return
    await getSupabaseBrowser().from('menu_categories').delete().eq('id', id)
    await load(bizId)
  }

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
        ← Pedidos
      </Link>
      <h1 className="mt-2 mb-5 font-display font-semibold text-[24px] text-ink">Editor de menú</h1>
      {error && <p className="mb-3 text-danger text-sm">{error}</p>}

      <ul className="space-y-4">
        {cats.map((cat) => (
          <li key={cat.id}>
            <Card>
              <CardBody>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-display font-semibold text-[17px] text-ink">{cat.name}</h2>
                  <button
                    type="button"
                    className="text-[12px] text-danger"
                    onClick={() => deleteCategory(cat.id)}
                  >
                    Eliminar categoría
                  </button>
                </div>
                <ul className="space-y-2">
                  {cat.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 border-border border-t pt-2"
                    >
                      <span
                        className={`text-[14px] ${item.is_available ? 'text-ink' : 'text-ink-subtle line-through'}`}
                      >
                        {item.name} ·{' '}
                        <span className="font-mono">S/ {Number(item.base_price).toFixed(2)}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-[12px] text-ink-muted"
                          onClick={() => toggleItem(item)}
                        >
                          {item.is_available ? 'Agotar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="text-[12px] text-danger"
                          onClick={() => deleteItem(item.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <AddItem onAdd={(name, price) => addItem(cat.id, name, price)} />
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <form onSubmit={addCategory} className="mt-4 flex gap-2">
        <input
          className={`${inputCls} flex-1`}
          placeholder="Nueva categoría (ej. Bebidas)"
          value={newCat}
          onChange={(e) => setNewCat(e.target.value)}
        />
        <Button type="submit" size="sm">
          Agregar categoría
        </Button>
      </form>
    </div>
  )
}

function AddItem({ onAdd }: { onAdd: (name: string, price: number) => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const p = Number(price)
    if (!name.trim() || !(p > 0)) return
    onAdd(name.trim(), p)
    setName('')
    setPrice('')
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2 border-border border-t pt-3">
      <input
        className={`${inputCls} flex-1`}
        placeholder="Nuevo ítem"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className={`${inputCls} w-24`}
        placeholder="Precio"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <Button type="submit" size="sm" variant="outline">
        + Ítem
      </Button>
    </form>
  )
}
