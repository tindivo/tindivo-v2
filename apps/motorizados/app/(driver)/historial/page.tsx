'use client'

import { EmptyState } from '@tindivo/ui'
import { OrderCard } from '@/components/home/order-card'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'

export default function HistorialPage() {
  const now = useNow()
  const { deliveredToday } = useDriverOrders(now)

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <h1 className="font-display text-[24px] font-bold tracking-tight">
          Entregados hoy {deliveredToday.length > 0 ? `(${deliveredToday.length})` : ''}
        </h1>
      </div>

      {deliveredToday.length === 0 ? (
        <EmptyState
          icon="history"
          heading="Sin entregas hoy"
          description="Los pedidos que entregues aparecerán aquí."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {deliveredToday.map((o) => (
            <OrderCard key={o.id} order={o} now={now} variant="delivered" />
          ))}
        </div>
      )}
    </main>
  )
}
