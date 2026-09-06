'use client'

import { DashboardShell } from '@/components/dashboard/shell'
import { RendimientoView } from '@/features/rendimiento/components/rendimiento-view'

export default function NegocioRendimientoPage() {
  return (
    <DashboardShell
      active="rendimiento"
      title="Rendimiento y Retorno"
      subtitle="Métricas de ventas, retorno Tindivo y clientes del periodo seleccionado"
    >
      <RendimientoView />
    </DashboardShell>
  )
}
