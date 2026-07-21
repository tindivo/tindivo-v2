'use client'

import { Button } from '@tindivo/ui'
import { useState } from 'react'
import { SectionHeader } from '@/components/admin'
import { TabClaims } from '@/components/casos/tab-claims'
import { TabIncidentes } from '@/components/casos/tab-incidentes'
import { TabReportes } from '@/components/casos/tab-reportes'

type Tab = 'reportes' | 'incidentes' | 'claims'

const TABS: { key: Tab; label: string }[] = [
  { key: 'reportes', label: 'Reportes' },
  { key: 'incidentes', label: 'Incidentes' },
  { key: 'claims', label: 'Cobertura' },
]

export default function CasosPage() {
  const [tab, setTab] = useState<Tab>('reportes')
  const [infoTab, setInfoTab] = useState<Tab | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({
    reportes: 0,
    incidentes: 0,
    claims: 0,
  })

  const totalPending = Object.values(counts).reduce((a, b) => a + b, 0)

  function updateCount(key: Tab, count: number) {
    setCounts((prev) => ({ ...prev, [key]: count }))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Antifraude"
        title="Casos"
        description={
          totalPending > 0
            ? `${totalPending} caso${totalPending > 1 ? 's' : ''} pendiente${totalPending > 1 ? 's' : ''}`
            : 'Sin pendientes 🎉'
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-[14px] bg-ink/[0.04] p-1">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-[10px] py-2 text-center text-[13px] font-semibold transition-colors cursor-pointer select-none ${
              tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span>{t.label}</span>
            {counts[t.key] > 0 && (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {counts[t.key]}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setInfoTab(t.key)
              }}
              className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ink/[0.05] text-[10px] text-ink-subtle hover:bg-ink/10 hover:text-ink transition-colors"
              title="Información"
            >
              ℹ️
            </button>
          </button>
        ))}
      </div>

      {/* Contenido — display:none para preservar estado entre tabs */}
      <div style={{ display: tab === 'reportes' ? 'block' : 'none' }}>
        <TabReportes onCountChange={(n) => updateCount('reportes', n)} />
      </div>
      <div style={{ display: tab === 'incidentes' ? 'block' : 'none' }}>
        <TabIncidentes onCountChange={(n) => updateCount('incidentes', n)} />
      </div>
      <div style={{ display: tab === 'claims' ? 'block' : 'none' }}>
        <TabClaims onCountChange={(n) => updateCount('claims', n)} />
      </div>

      {/* Modal de información de la pestaña */}
      {infoTab && (
        <div
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          onKeyDown={(e) => e.key === 'Escape' && setInfoTab(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in"
          onClick={() => setInfoTab(null)}
        >
          <div
            role="document"
            className="w-full max-w-md rounded-[22px] bg-white p-6 shadow-2xl border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="text-[16px] font-bold text-ink flex items-center gap-2">
                <span>ℹ️</span>
                {infoTab === 'reportes' && 'Bandeja de Reportes'}
                {infoTab === 'incidentes' && 'Historial de Incidentes'}
                {infoTab === 'claims' && 'Fondo de Cobertura'}
              </h3>
              <button
                type="button"
                onClick={() => setInfoTab(null)}
                className="text-[16px] text-ink-subtle hover:text-ink"
              >
                ✕
              </button>
            </div>

            <p className="text-[14px] leading-relaxed text-ink-muted">
              {infoTab === 'reportes' &&
                'Bandeja de alertas pendientes que requieren revisión manual del administrador. Por ejemplo, reportes de "No-show" (el cliente no apareció) enviados por los repartidores para confirmar si se aplica o descarta un strike.'}
              {infoTab === 'incidentes' &&
                'Historial completo de faltas e infracciones registradas contra los clientes. Aquí se listan todos los strikes aplicados (por no-shows confirmados o intentos de fraude) y el estado de bloqueo del usuario.'}
              {infoTab === 'claims' &&
                'Solicitudes de reembolso del fondo de cobertura de Tindivo. Los negocios solicitan compensación aquí cuando prepararon y despacharon un pedido prepago cuyo comprobante resultó ser inválido.'}
            </p>

            <div className="mt-6 flex justify-end">
              <Button size="sm" onClick={() => setInfoTab(null)}>
                Entendido
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
