'use client'

import { Button, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { AccountSummaryData, PendingGroupItem } from '../types'
import { DeudaHero } from './deuda-hero'
import { DeudaSummary } from './deuda-summary'
import { PaymentHistoryList } from './payment-history-list'
import { PendingList, type TypeFilter } from './pending-list'

const MAIN_TABS = [
  { key: 'pending' as const, label: 'Cargos pendientes', icon: 'receipt_long' },
  { key: 'history' as const, label: 'Historial de pagos', icon: 'history' },
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
    <div className="flex flex-col gap-3.5 pb-6">
      {/* El motivo lo decide `blockedForDebt`, no `isBlocked`. Antes se daba por
          hecho que toda suspensión era por deuda, así que a un negocio bloqueado
          por fraude se le decía que debía dinero — y se le mandaba a pagar algo
          que no le iba a devolver el servicio. */}
      {data.isBlocked && (
        <div className="flex items-center gap-2.5 rounded-xl border border-danger/20 bg-danger-soft p-3 text-sm font-semibold text-danger">
          <Icon name="block" size={18} filled className="shrink-0" />
          <span>
            {data.blockedForDebt
              ? 'Tu cuenta está suspendida por deuda acumulada. Coordina tu pago para reactivar el servicio.'
              : 'Tu cuenta está suspendida. Escríbenos para saber qué pasó y cómo reactivarla.'}
          </span>
        </div>
      )}

      <DeudaHero balance={balance} isBlocked={data.isBlocked} threshold={data.debtBlockThreshold} />
      <DeudaSummary summary={data.summary} />

      {/* Botón WhatsApp contextual */}
      <div className="lg:hidden">
        {balance > 0 ? (
          <Button
            as="a"
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full h-11 text-[14px] font-bold shadow-elev-1"
          >
            <Icon name="chat" size={18} /> Pagar deuda por WhatsApp ({soles(balance)})
          </Button>
        ) : (
          <Button
            as="a"
            href={supportHref}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            className="w-full h-11 text-[13px] font-semibold text-ink"
          >
            <Icon name="chat" size={18} /> Coordinar con Tindivo por WhatsApp
          </Button>
        )}
      </div>

      {/* Main segmented tabs */}
      <div className="flex rounded-xl border border-border bg-surface p-1">
        {MAIN_TABS.map((t) => {
          const active = mainTab === t.key
          const count = t.key === 'pending' ? groupedUnits.length : data.paymentHistory.length
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-all cursor-pointer ${
                active
                  ? 'bg-card text-ink shadow-elev-1 font-bold'
                  : 'bg-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Icon
                name={t.icon}
                size={16}
                filled={active}
                className={active ? 'text-brand' : 'text-ink-subtle'}
              />
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold ${
                    active ? 'bg-ink text-white' : 'bg-ink/[0.08] text-ink-muted'
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
