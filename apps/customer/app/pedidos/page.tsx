'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { Button, Card, CardBody, EmptyState, StatusPill } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ScreenHeader } from '@/components/ui'
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
  cancel_reason: string | null
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

function statusTone(status: string) {
  if (status === 'cancelled') return 'danger'
  if (status === 'delivered') return 'success'
  if (ACTIVE_STATUSES.has(status)) return 'brand'
  return 'neutral'
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
  return new Date(iso).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
  })
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
          'id,short_id,status,order_amount,delivery_fee,delivery_method,created_at,business_id,cancel_reason,customer_order_items(item_name_snapshot,quantity)',
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

  if (!ready) {
    return (
      <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16">
        <ScreenHeader title="Historial de pedidos" onBack={() => router.push('/cuenta')} />
        <div className="px-4 pt-4">
          <div className="h-40 animate-pulse rounded-[20px] bg-card" />
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16">
      <ScreenHeader title="Historial de pedidos" onBack={() => router.push('/cuenta')} />

      <div className="px-4 pt-3">
        {orders.length === 0 ? (
          <EmptyState
            icon="receipt_long"
            heading="Aún no tienes pedidos"
            description="Cuando hagas tu primera compra aparecerá aquí para que la revises cuando quieras."
            action={
              <Link href="/">
                <Button variant="brand" size="md">
                  Explorar restaurantes
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => {
              const items = o.customer_order_items ?? []
              const summary = items.map((i) => `${i.quantity}× ${i.item_name_snapshot}`).join(' · ')
              const isActive = ACTIVE_STATUSES.has(o.status)
              const isCancelled = o.status === 'cancelled'
              const total = Number(o.order_amount) + Number(o.delivery_fee)
              return (
                <Card key={o.id} className="overflow-hidden">
                  <CardBody className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-semibold text-[15px] text-ink">
                        {bizNames[o.business_id] ?? 'Restaurante'}
                      </span>
                      <StatusPill tone={statusTone(o.status)} dot={isActive}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </StatusPill>
                    </div>

                    {summary && (
                      <p className="line-clamp-2 text-[13px] leading-snug text-ink-muted">
                        {summary}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-subtle">
                      <span className="font-mono">#{o.short_id}</span>
                      <span>·</span>
                      <span>{relativeDate(o.created_at)}</span>
                      <span>·</span>
                      <span className="font-semibold tabular-nums text-ink">{soles(total)}</span>
                    </div>

                    <div className="flex gap-2">
                      {isActive && (
                        <Link href={`/pedido/${o.short_id}`} className="flex-1">
                          <Button variant="brand" size="sm" className="w-full">
                            Ver seguimiento
                          </Button>
                        </Link>
                      )}
                      {isCancelled && o.cancel_reason === 'proof_rejected_final' && (
                        <Link href={`/pedido/${o.short_id}`} className="flex-1">
                          <Button variant="danger" size="sm" className="w-full">
                            Ver caso de pago
                          </Button>
                        </Link>
                      )}
                      {(!isCancelled || o.cancel_reason !== 'proof_rejected_final') && (
                        <Link href={`/negocio/${o.business_id}`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full">
                            Volver a pedir
                          </Button>
                        </Link>
                      )}
                    </div>

                    {isCancelled && (
                      <a
                        href={`https://wa.me/${TINDIVO_SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Hola, tengo un problema con mi pedido #TDV-${o.short_id}. Motivo: `)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 text-[12px] text-ink-subtle hover:text-ink hover:underline"
                      >
                        <span aria-hidden>💬</span>
                        ¿Problema con este pedido?
                      </a>
                    )}
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
