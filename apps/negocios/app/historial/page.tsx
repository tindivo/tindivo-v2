'use client'

import { DashboardShell } from '@/components/dashboard/shell'
import { HistorialList } from '@/features/historial/components/historial-list'

export default function NegocioHistorialPage() {
  return (
    <DashboardShell
      active="historial"
      title="Historial de pedidos"
      subtitle="Pedidos entregados, cancelados y reclamos del periodo seleccionado"
    >
      <HistorialList />
    </DashboardShell>
  )
}
