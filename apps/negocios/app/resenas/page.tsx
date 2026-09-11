'use client'

import { DashboardShell } from '@/components/dashboard/shell'
import { ResenasView } from '@/features/resenas/components/resenas-view'

export default function NegocioResenasPage() {
  return (
    <DashboardShell
      active="resenas"
      title="Reseñas"
      subtitle="Cómo calificaron tus pedidos los clientes que piden por la app"
    >
      <ResenasView />
    </DashboardShell>
  )
}
