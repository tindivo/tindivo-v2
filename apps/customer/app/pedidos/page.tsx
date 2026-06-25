'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon, ScreenHeader } from '@/components/ui'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface OrderItem {
  item_name_snapshot: string
  quantity: number
}
interface OrderRow {
  id: string
  short_id: string
  status: string
  order_amount: number
  delivery_fee: number
  delivery_method: string
  created_at: string
  business_id: string
  customer_order_items: OrderItem[]
}

const soles = (n: number) => `S/ ${n.toFixed(2)}`

// Estados internos que aún están "en curso" (no terminales).
const ACTIVE_STATUSES = new Set([
  'validando',
  'pending_acceptance',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
])

// Etiqueta corta para el cliente (Etapa 5 unificará la proyección a 4 estados).
const STATUS_LABEL: Record<string, string> = {
  validando: 'En revisión',
  pending_acceptance: 'En revisión',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  waiting_driver: 'Preparando',
  heading_to_restaurant: 'En camino',
  waiting_at_restaurant: 'En camino',
  picked_up: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 30) return `hace ${d} días`
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })
}

export default function PedidosPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [bizNames, setBizNames] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/entrar?next=/pedidos')
        return
      }
      // RLS ord_customer_read / coi_participant_read: el cliente lee sus propios pedidos + ítems.
      const { data: rows } = await supabase
        .from('orders')
        .select(
          'id,short_id,status,order_amount,delivery_fee,delivery_method,created_at,business_id,customer_order_items(item_name_snapshot,quantity)',
        )
        .order('created_at', { ascending: false })
        .limit(40)
      setOrders((rows ?? []) as OrderRow[])
      // `businesses` no es legible por el cliente vía RLS → nombres desde la API pública.
      try {
        const res = await api.get<ApiEnvelope<{ id: string; name: string }[]>>('/public/businesses')
        const map: Record<string, string> = {}
        for (const b of res.data) map[b.id] = b.name
        setBizNames(map)
      } catch {
        // Sin nombres: se muestra "Restaurante" como fallback.
      }
      setReady(true)
    })
  }, [router])

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16">
      <ScreenHeader title="Historial de pedidos" onBack={() => router.push('/cuenta')} />
      <div className="px-4 pt-2">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <span style={{ color: 'rgba(26,22,20,0.3)' }}>
              <Icon.Bag />
            </span>
            <p className="font-semibold text-[15px]">Aún no tienes pedidos</p>
            <Link href="/" className="text-[13px] text-brand underline">
              Explorar restaurantes
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {orders.map((o) => {
              const items = o.customer_order_items ?? []
              const summary = items.map((i) => `${i.quantity}× ${i.item_name_snapshot}`).join(' · ')
              const isActive = ACTIVE_STATUSES.has(o.status)
              const isCancelled = o.status === 'cancelled'
              const total = Number(o.order_amount) + Number(o.delivery_fee)
              return (
                <div key={o.id} className="rounded-[18px] border border-border bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[14px]">
                      {bizNames[o.business_id] ?? 'Restaurante'}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-1 font-bold text-[10px] uppercase"
                      style={{
                        letterSpacing: '0.04em',
                        color: isCancelled ? '#DC2626' : isActive ? '#C2410C' : '#1A8050',
                        background: isCancelled
                          ? 'rgba(220,38,38,0.08)'
                          : isActive
                            ? 'rgba(249,115,22,0.1)'
                            : 'rgba(26,150,80,0.1)',
                      }}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </div>
                  {summary && (
                    <div
                      className="mt-1.5 text-[13px] leading-snug"
                      style={{ color: 'rgba(26,22,20,0.7)' }}
                    >
                      {summary}
                    </div>
                  )}
                  <div
                    className="mt-2 flex items-center gap-2 text-[12px]"
                    style={{ color: 'rgba(26,22,20,0.5)' }}
                  >
                    <span className="font-mono">#{o.short_id}</span>
                    <span>·</span>
                    <span>{relativeDate(o.created_at)}</span>
                    <span>·</span>
                    <span className="font-semibold tabular-nums" style={{ color: '#1A1614' }}>
                      {soles(total)}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {isActive && (
                      <Link
                        href={`/pedido/${o.short_id}`}
                        className="flex-1 rounded-[12px] py-2.5 text-center font-semibold text-[13px] text-white"
                        style={{ background: '#F97316' }}
                      >
                        Ver seguimiento
                      </Link>
                    )}
                    <Link
                      href={`/negocio/${o.business_id}`}
                      className="flex-1 rounded-[12px] py-2.5 text-center font-semibold text-[13px]"
                      style={{ background: 'rgba(26,22,20,0.06)', color: '#1A1614' }}
                    >
                      Volver a pedir
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
