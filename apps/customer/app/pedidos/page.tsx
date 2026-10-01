'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { ACTIVE_ORDER_STATUSES } from '@tindivo/contracts'
import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { Button, Card, CardBody, EmptyState, ScreenHeader, StatusPill } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  COURIER_HISTORY_COLUMNS,
  CourierHistoryCard,
  type CourierHistoryRow,
} from '@/features/courier/components/courier-history-card'
import { ReviewPromptButton } from '@/features/reviews/components/review-prompt-button'
import { usePendingReview } from '@/features/reviews/hooks/use-pending-review'
import { useActiveCourierOrders } from '@/lib/active-courier-orders'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { getSupportWhatsapp } from '@/lib/support'

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
const ACTIVE_STATUSES: ReadonlySet<string> = new Set(ACTIVE_ORDER_STATUSES)

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

type Fila = { kind: 'order'; row: OrderRow } | { kind: 'courier'; row: CourierHistoryRow }

/**
 * Comida y entregas en una sola lista, lo más reciente arriba — como las vive
 * el cliente. Las entregas EN CURSO van primero aunque sean más viejas que un
 * pedido ya entregado: es lo que vino a mirar.
 */
function mezclar(orders: OrderRow[], entregas: CourierHistoryRow[]): Fila[] {
  const filas: Fila[] = [
    ...orders.map((row) => ({ kind: 'order' as const, row })),
    ...entregas.map((row) => ({ kind: 'courier' as const, row })),
  ]
  const viva = (f: Fila) =>
    f.kind === 'order'
      ? ACTIVE_STATUSES.has(f.row.status)
      : f.row.status !== 'delivered' && f.row.status !== 'cancelled'
  return filas.sort(
    (a, b) => Number(viva(b)) - Number(viva(a)) || b.row.created_at.localeCompare(a.row.created_at),
  )
}

export default function PedidosPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [entregas, setEntregas] = useState<CourierHistoryRow[]>([])
  const [bizNames, setBizNames] = useState<Record<string, string>>({})
  const [wa, setWa] = useState(TINDIVO_SUPPORT_WHATSAPP)
  /**
   * La segunda puerta a la reseña, para quien no pasó por la espera.
   *
   * Se consulta siempre que se abra el historial: aquí el cliente ya vino a
   * mirar sus pedidos, así que la pregunta no le quita la atención de nada.
   */
  const resena = usePendingReview(true)

  useEffect(() => {
    getSupportWhatsapp().then(setWa)
  }, [])

  /*
   * La lista de entregas sigue al store de activas, que sí está vivo
   * (Realtime + recargas). Cada vez que una entrega cambia de estado o termina,
   * se relee solo `courier_orders`: sin esto la tarjeta seguía en «Confirmado»
   * después de entregada hasta salir y volver a entrar.
   */
  const activas = useActiveCourierOrders()
  const firmaActivas = activas.map((o) => `${o.shortId}:${o.status}`).join(',')
  const primeraFirma = useRef(true)
  useEffect(() => {
    void firmaActivas
    if (primeraFirma.current) {
      primeraFirma.current = false
      return
    }
    void getSupabaseBrowser()
      .from('courier_orders')
      .select(COURIER_HISTORY_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setEntregas(data as CourierHistoryRow[])
      })
  }, [firmaActivas])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/entrar?next=/pedidos')
        return
      }
      // Las tres lecturas son independientes: en paralelo, no una tras otra
      // (con datos móviles cada viaje de ida y vuelta se nota).
      // RLS ord_customer_read / coi_participant_read: el cliente lee sus propios pedidos + ítems.
      // RLS co_customer_select: y sus propias entregas.
      // `businesses` no es legible por el cliente vía RLS → nombres desde la API pública.
      const [{ data: rows }, { data: courierRows }, negocios] = await Promise.all([
        supabase
          .from('orders')
          .select(
            'id,short_id,status,order_amount,delivery_fee,delivery_method,created_at,business_id,cancel_reason,customer_order_items(item_name_snapshot,quantity)',
          )
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('courier_orders')
          .select(COURIER_HISTORY_COLUMNS)
          .order('created_at', { ascending: false })
          .limit(20),
        api
          .get<ApiEnvelope<{ id: string; name: string }[]>>('/public/businesses')
          .catch(() => null), // Sin nombres: se muestra "Restaurante" como fallback.
      ])
      setOrders((rows ?? []) as OrderRow[])
      setEntregas((courierRows ?? []) as CourierHistoryRow[])
      if (negocios) {
        const map: Record<string, string> = {}
        for (const b of negocios.data) map[b.id] = b.name
        setBizNames(map)
      }
      setReady(true)
    })
  }, [router])

  if (!ready) {
    return (
      <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-4">
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
        {orders.length === 0 && entregas.length === 0 ? (
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
            {mezclar(orders, entregas).map((fila) => {
              if (fila.kind === 'courier') {
                return (
                  <CourierHistoryCard
                    key={`c-${fila.row.id}`}
                    row={fila.row}
                    relativeDate={relativeDate(fila.row.created_at)}
                  />
                )
              }
              const o = fila.row
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
                      <ReviewPromptButton estado={resena} orderId={o.id} />
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
                        href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola, tengo un problema con mi pedido #TDV-${o.short_id}. Motivo: `)}`}
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
