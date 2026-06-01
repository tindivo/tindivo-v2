'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const inputCls =
  'mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand'
const labelCls = 'font-mono text-[11px] text-ink-subtle uppercase tracking-wide'
const soles = (n: number) => `S/ ${n.toFixed(2)}`

interface MenuItem {
  id: string
  name: string
  base_price: number
}

export default function NuevoPedidoPage() {
  const router = useRouter()
  const [items, setItems] = useState<MenuItem[]>([])
  const [qty, setQty] = useState<Record<string, number>>({})
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    deliveryMethod: 'delivery',
    paymentIntent: 'pending_cash',
    deliveryAddress: '',
    deliveryReference: '',
    notes: '',
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      const { data: mi } = await supabase
        .from('menu_items')
        .select('id,name,base_price')
        .eq('is_available', true)
        .order('display_order')
      setItems((mi ?? []) as MenuItem[])
    })
  }, [router])

  const selected = items.filter((i) => (qty[i.id] ?? 0) > 0)
  const total = selected.reduce((s, i) => s + Number(i.base_price) * (qty[i.id] ?? 0), 0)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (selected.length === 0) {
      setMsg({ ok: false, text: 'Agrega al menos un ítem.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const r = await api.post<{ data: { shortId: string } }>('/business/orders', {
        deliveryMethod: form.deliveryMethod,
        paymentIntent: form.paymentIntent,
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        deliveryAddress: form.deliveryMethod === 'delivery' ? form.deliveryAddress : undefined,
        deliveryReference: form.deliveryMethod === 'delivery' ? form.deliveryReference : undefined,
        notes: form.notes || undefined,
        items: selected.map((i) => ({ menuItemId: i.id, quantity: qty[i.id] })),
      })
      setMsg({ ok: true, text: `Pedido #${r.data.shortId} creado.` })
      setQty({})
      setForm({
        ...form,
        customerName: '',
        customerPhone: '',
        deliveryAddress: '',
        deliveryReference: '',
        notes: '',
      })
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
        ← Pedidos
      </Link>
      <h1 className="mt-2 mb-5 font-display font-semibold text-[24px] text-ink">
        Nuevo pedido manual
      </h1>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Cliente</span>
              <input
                className={inputCls}
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className={labelCls}>Teléfono</span>
              <input
                className={inputCls}
                value={form.customerPhone}
                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className={labelCls}>Entrega</span>
              <select
                className={inputCls}
                value={form.deliveryMethod}
                onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}
              >
                <option value="delivery">Delivery</option>
                <option value="pickup">Recojo</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>Pago</span>
              <select
                className={inputCls}
                value={form.paymentIntent}
                onChange={(e) => setForm({ ...form, paymentIntent: e.target.value })}
              >
                <option value="pending_cash">Efectivo</option>
                <option value="pending_yape">Yape al recibir</option>
                <option value="prepaid">Prepago</option>
              </select>
            </label>
            {form.deliveryMethod === 'delivery' && (
              <>
                <label className="block sm:col-span-2">
                  <span className={labelCls}>Dirección</span>
                  <input
                    className={inputCls}
                    value={form.deliveryAddress}
                    onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelCls}>Referencia</span>
                  <input
                    className={inputCls}
                    value={form.deliveryReference}
                    onChange={(e) => setForm({ ...form, deliveryReference: e.target.value })}
                  />
                </label>
              </>
            )}
            <label className="block sm:col-span-2">
              <span className={labelCls}>Notas</span>
              <input
                className={inputCls}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-2 font-display font-semibold text-[15px] text-ink">Ítems</p>
            {items.length === 0 ? (
              <p className="text-[13px] text-ink-subtle">
                Sin ítems en el menú. Agrégalos en Menú.
              </p>
            ) : (
              <ul className="space-y-1">
                {items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-1 text-[14px]">
                    <span className="text-ink">
                      {i.name} · <span className="font-mono">{soles(Number(i.base_price))}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-7 w-7 rounded-lg border border-border"
                        onClick={() =>
                          setQty({ ...qty, [i.id]: Math.max(0, (qty[i.id] ?? 0) - 1) })
                        }
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-mono">{qty[i.id] ?? 0}</span>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-lg border border-border"
                        onClick={() => setQty({ ...qty, [i.id]: (qty[i.id] ?? 0) + 1 })}
                      >
                        +
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-right font-mono text-[15px] text-ink">
              Total ítems: {soles(total)}
            </p>
          </CardBody>
        </Card>

        {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Creando…' : 'Crear pedido'}
        </Button>
      </form>
    </div>
  )
}
