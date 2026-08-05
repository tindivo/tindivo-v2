'use client'

import { DashboardShell } from '@/components/dashboard/shell'
import { EfectivoList } from '@/features/efectivo/components/efectivo-list'

export default function NegocioEfectivoPage() {
  return (
    <DashboardShell
      active="efectivo"
      title="Liquidaciones"
      subtitle="Liquidación diaria · cuenta el dinero antes de confirmar"
    >
      <EfectivoList />
    </DashboardShell>
  )
}
