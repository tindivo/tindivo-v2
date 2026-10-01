'use client'

import { Segmented } from '@tindivo/ui'
import { useState } from 'react'
import { TindivoDebtList } from '@/features/deuda-tindivo/components/tindivo-debt-list'
import { useCourierDebt } from '@/features/deuda-tindivo/hooks/use-courier-debt'
import { EfectivoList } from '@/features/efectivo/components/efectivo-list'
import { useCashSummary } from '@/features/efectivo/hooks/use-cash-summary'

type Tab = 'restaurantes' | 'tindivo'

/**
 * «Deuda»: lo que el motorizado tiene encima y no es suyo, en dos ventanas.
 *
 *   · Restaurantes — el efectivo de la comida, que se entrega a cada cajera.
 *   · Tindivo — lo cobrado por Entregas (Yape o efectivo), que se le rinde a
 *     Jesús (0237).
 *
 * Separadas porque son dos personas distintas a las que se les entrega, en dos
 * momentos distintos. Abre en la que tiene algo pendiente.
 */
export default function DeudaPage() {
  const { businesses } = useCashSummary()
  const { items } = useCourierDebt()
  const cash = businesses.flatMap((b) => b.orders.filter((o) => o.state === 'pending')).length
  const tindivo = items.filter((o) => o.state === 'pending').length
  const [picked, setPicked] = useState<Tab | null>(null)
  const tab: Tab = picked ?? (cash === 0 && tindivo > 0 ? 'tindivo' : 'restaurantes')

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-20 pb-10">
      <div className="sticky top-[calc(44px+env(safe-area-inset-top))] z-30 -mx-4 mb-4 bg-surface/95 px-4 py-2 backdrop-blur-sm">
        <h1 className="font-display text-[24px] font-bold tracking-tight">Deuda</h1>
        <div className="mt-2">
          <Segmented<Tab>
            size="sm"
            value={tab}
            onChange={setPicked}
            options={[
              { value: 'restaurantes', label: 'Restaurantes', badge: cash || undefined },
              { value: 'tindivo', label: 'Tindivo', badge: tindivo || undefined },
            ]}
          />
        </div>
      </div>
      {tab === 'restaurantes' ? <EfectivoList /> : <TindivoDebtList />}
    </main>
  )
}
