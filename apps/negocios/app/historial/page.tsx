'use client'

import { DashboardShell } from '@/components/dashboard/shell'
import { HistorialList } from '@/features/historial/components/historial-list'

export default function NegocioHistorialPage() {
  return (
    <DashboardShell
      active="historial"
      title="Historial del día"
      subtitle="Pedidos completados y cancelados de la jornada — solo lectura"
    >
      <HistorialList />
    </DashboardShell>
  )
}
