'use client'

import { Badge, Card, EmptyState } from '@tindivo/ui'
import { DriverShell } from '@/components/driver-shell'
import { useDriverOrders } from '@/hooks/use-driver-orders'
import { useNow } from '@/hooks/use-now'
import { hourOf, PAYMENT_LABEL, soles } from '@/lib/format'

export default function HistorialPage() {
  const now = useNow()
  const { deliveredToday } = useDriverOrders(now)

  return (
    <DriverShell>
      <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
        <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
          <h1 className="font-display text-[24px] font-bold tracking-tight">Entregas de hoy</h1>
        </div>

        {deliveredToday.length === 0 ? (
          <EmptyState
            icon="history"
            heading="Sin entregas hoy"
            description="Los pedidos que entregues aparecerán aquí."
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {deliveredToday.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] font-semibold text-ink">
                    #{o.short_id}
                  </span>
                  <Badge variant="success" size="sm">
                    Entregado
                  </Badge>
                </div>
                <p className="mt-1 text-[15px] font-semibold">
                  {o.business?.name ?? 'Restaurante'}
                </p>
                <p className="text-[13px] text-ink-muted">
                  {o.customer_name ?? 'Cliente'} · {hourOf(o.delivered_at ?? o.created_at)}
                </p>
                <div className="mt-2 flex items-center justify-between text-[13px]">
                  <span className="text-ink-muted">
                    {PAYMENT_LABEL[o.payment_intent] ?? o.payment_intent}
                  </span>
                  <span className="font-display text-[16px] font-bold tracking-tight tabular-nums">
                    {soles(o.order_amount + o.delivery_fee)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </DriverShell>
  )
}
