'use client'

import { Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { AccountSummaryData, PendingGroupItem } from '../types'
import { DeudaHero } from './deuda-hero'
import { DeudaSummary } from './deuda-summary'
import { PaymentHistoryList } from './payment-history-list'
import { PendingList, type TypeFilter } from './pending-list'

const MAIN_TABS = [
  { key: 'pending' as const, label: 'Cargos pendientes' },
  { key: 'history' as const, label: 'Historial de pagos' },
]

export function DeudaList({
  data,
  groupedUnits,
  balance,
  supportHref,
}: {
  data: AccountSummaryData
  groupedUnits: PendingGroupItem[]
  balance: number
  supportHref: string
}) {
  const [mainTab, setMainTab] = useState<(typeof MAIN_TABS)[number]['key']>('pending')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  return (
    <div className="flex flex-col gap-3.5">
      {data.isBlocked && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/10 bg-danger-soft p-3 text-sm font-semibold text-danger">
          <Icon name="block" size={18} filled />
          Tu cuenta está suspendida por deuda acumulada. Coordina tu pago para reactivar el
          servicio.
        </div>
      )}

      <DeudaHero balance={balance} isBlocked={data.isBlocked} />
      <DeudaSummary summary={data.summary} />

      <div className="lg:hidden">
        <Button
          as="a"
          href={supportHref}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full"
        >
          <Icon name="chat" size={18} /> Pagar por WhatsApp a Tindivo
        </Button>
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface p-1">
        {MAIN_TABS.map((t) => {
          const active = mainTab === t.key
          const count = t.key === 'pending' ? groupedUnits.length : data.paymentHistory.length
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-all ${
                active
                  ? 'bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
                  : 'bg-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0 text-[10px] font-bold text-white ${
                    active ? 'bg-ink' : 'bg-ink-subtle'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {mainTab === 'pending' && (
        <PendingList
          groups={groupedUnits}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
        />
      )}
      {mainTab === 'history' && <PaymentHistoryList items={data.paymentHistory} />}
    </div>
  )
}
