'use client'

import { Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { DashboardShell } from '@/components/dashboard/shell'
import { EfectivoList } from '@/features/efectivo/components/efectivo-list'
import { HistorialNochesSheet } from '@/features/efectivo/components/historial-noches'

export default function NegocioEfectivoPage() {
  const [historialOpen, setHistorialOpen] = useState(false)

  return (
    <DashboardShell
      active="efectivo"
      title="Liquidaciones"
      subtitle="Liquidación diaria · cuenta el dinero antes de confirmar"
      headerRight={
        <Button
          variant="outline"
          size="sm"
          onClick={() => setHistorialOpen(true)}
          className="gap-1.5"
        >
          <Icon name="history" size={16} />
          <span className="hidden sm:inline">Noches cerradas</span>
          <span className="sm:hidden">Historial</span>
        </Button>
      }
    >
      <EfectivoList onOpenHistorial={() => setHistorialOpen(true)} />
      <HistorialNochesSheet open={historialOpen} onClose={() => setHistorialOpen(false)} />
    </DashboardShell>
  )
}
