'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import type { AccountSummaryData } from '../types'

export function DeudaSummary({ summary }: { summary: AccountSummaryData['summary'] }) {
  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-3">
      <Card className="flex flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Comisiones
          </span>
          <Icon name="inventory_2" size={14} className="text-brand" />
        </div>
        <div className="font-mono text-lg font-bold leading-none text-ink lg:text-xl">
          {soles(summary.totalCommissions)}
        </div>
      </Card>

      <Card className="flex flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Delivery fees
          </span>
          <Icon name="two_wheeler" size={14} className="text-info" />
        </div>
        <div className="font-mono text-lg font-bold leading-none text-ink lg:text-xl">
          {soles(summary.totalDeliveryFees)}
        </div>
      </Card>

      <Card className="flex flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Devoluciones
          </span>
          <Icon
            name="replay"
            size={14}
            className={summary.totalRefunds > 0 ? 'text-danger' : 'text-ink-subtle'}
          />
        </div>
        <div
          className={`font-mono text-lg font-bold leading-none lg:text-xl ${
            summary.totalRefunds > 0 ? 'text-danger' : 'text-ink'
          }`}
        >
          {soles(summary.totalRefunds)}
        </div>
      </Card>
    </div>
  )
}
