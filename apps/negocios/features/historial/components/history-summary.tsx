'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'
import type { HistDisplay } from '../types'

export function HistorySummary({
  rows,
  isTodayOnly = true,
}: {
  rows: HistDisplay[]
  isTodayOnly?: boolean
}) {
  const delivered = rows.filter((r) => !r.isCancel)
  const cancelled = rows.filter((r) => r.isCancel)
  const revenue = delivered.reduce((s, r) => s + r.total, 0)
  const webCount = rows.filter((r) => r.source === 'web').length
  const manCount = rows.filter((r) => r.source === 'manual').length
  const cancelPct = rows.length > 0 ? Math.round((cancelled.length / rows.length) * 100) : 0

  return (
    <div className="grid grid-cols-3 gap-2 lg:gap-3">
      <Card className="flex flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            {isTodayOnly ? 'Ventas hoy' : 'Ventas del periodo'}
          </span>
          <Icon name="payments" size={14} className="text-brand" />
        </div>
        <div className="font-mono text-xl font-bold leading-none text-ink lg:text-2xl">
          {soles(revenue)}
        </div>
        <div className="text-[11px] text-ink-muted">{delivered.length} entregados</div>
      </Card>

      <Card className="flex flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Web / Manual
          </span>
          <Icon name="devices" size={14} className="text-info" />
        </div>
        <div className="font-mono text-xl font-bold leading-none text-ink lg:text-2xl">
          {webCount}/{manCount}
        </div>
        <div className="text-[11px] text-ink-muted">{rows.length} total</div>
      </Card>

      <Card className="flex flex-col justify-between p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Cancelados
          </span>
          <Icon
            name="cancel"
            size={14}
            className={cancelled.length > 0 ? 'text-danger' : 'text-ink-subtle'}
          />
        </div>
        <div
          className={`font-mono text-xl font-bold leading-none lg:text-2xl ${
            cancelled.length > 0 ? 'text-danger' : 'text-ink'
          }`}
        >
          {cancelled.length}
        </div>
        <div className="text-[11px] text-ink-muted">{cancelPct}% del total</div>
      </Card>
    </div>
  )
}
