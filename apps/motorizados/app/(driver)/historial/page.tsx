'use client'

import { EmptyState } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { CourierCard } from '@/components/home/courier-card'
import { OrderCard } from '@/components/home/order-card'
import { useCourierHistory } from '@/hooks/use-courier-history'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'

/**
 * Lo entregado hoy: la comida y las Entregas en UNA lista, la más reciente
 * arriba. Son dos tableros distintos, pero el motorizado hizo una sola noche.
 */
export default function HistorialPage() {
  const router = useRouter()
  const now = useNow()
  const { deliveredToday } = useDriverOrders(now)
  const { delivered: courier } = useCourierHistory()

  const rows = [
    ...deliveredToday.map((o) => ({
      at: o.delivered_at,
      node: <OrderCard key={o.id} order={o} now={now} variant="delivered" />,
    })),
    ...courier.map((o) => ({
      at: o.deliveredAt,
      node: (
        <CourierCard
          key={o.id}
          order={o}
          variant="delivered"
          onOpen={() => router.push(`/entrega/${o.id}`)}
        />
      ),
    })),
  ].sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0))

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <h1 className="font-display text-[24px] font-bold tracking-tight">
          Entregados hoy {rows.length > 0 ? `(${rows.length})` : ''}
        </h1>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="history"
          heading="Sin entregas hoy"
          description="Los pedidos que entregues aparecerán aquí."
        />
      ) : (
        <div className="flex flex-col gap-3">{rows.map((r) => r.node)}</div>
      )}
    </main>
  )
}
