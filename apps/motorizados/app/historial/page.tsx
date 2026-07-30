'use client'

import { Card, EmptyState } from '@tindivo/ui'
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
        <h1 className="t-display mb-4 text-[24px]">Entregas de hoy</h1>

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
                  <span className="text-[12px] text-success font-semibold">Entregado</span>
                </div>
                <p className="mt-1 text-[15px] font-semibold">
                  {o.businesses?.name ?? 'Restaurante'}
                </p>
                <p className="text-[13px] text-ink-muted">
                  {o.customer_name ?? 'Cliente'} · {hourOf(o.delivered_at ?? o.created_at)}
                </p>
                <div className="mt-2 flex items-center justify-between text-[13px]">
                  <span className="text-ink-muted">
                    {PAYMENT_LABEL[o.payment_intent] ?? o.payment_intent}
                  </span>
                  <span className="t-display text-[16px] tabular-nums">
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
