'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import type { AccountSummaryData } from '../types'

export function DeudaSummary({ summary }: { summary: AccountSummaryData['summary'] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Card className="flex flex-col justify-between p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-ink-muted truncate">
            Comisiones
          </span>
          <Icon name="inventory_2" size={15} className="shrink-0 text-brand" />
        </div>
        <div className="mt-2 font-mono text-[15px] sm:text-xl font-bold leading-none text-ink truncate">
          {soles(summary.totalCommissions)}
        </div>
      </Card>

      <Card className="flex flex-col justify-between p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-ink-muted truncate">
            Delivery
          </span>
          <Icon name="two_wheeler" size={15} className="shrink-0 text-info" />
        </div>
        <div className="mt-2 font-mono text-[15px] sm:text-xl font-bold leading-none text-ink truncate">
          {soles(summary.totalDeliveryFees)}
        </div>
      </Card>

      <Card className="flex flex-col justify-between p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-1">
          <span className="font-mono text-[9.5px] sm:text-[10px] font-bold uppercase tracking-wider text-ink-muted truncate">
            Devoluciones
          </span>
          <Icon
            name="replay"
            size={15}
            className={`shrink-0 ${summary.totalRefunds > 0 ? 'text-danger' : 'text-ink-subtle'}`}
          />
        </div>
        <div
          className={`mt-2 font-mono text-[15px] sm:text-xl font-bold leading-none truncate ${
            summary.totalRefunds > 0 ? 'text-danger' : 'text-ink'
          }`}
        >
          {soles(summary.totalRefunds)}
        </div>
      </Card>
    </div>
  )
}
