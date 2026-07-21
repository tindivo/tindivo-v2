'use client'

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
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-[10px] py-2 text-center text-[13px] font-semibold transition-colors ${
              tab === t.key
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {counts[t.key]}
              </span>
            )}
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
    </div>
  )
}
