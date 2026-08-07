'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'

const toneClasses: Record<
  'brand' | 'warning' | 'danger' | 'neutral',
  { bg: string; fg: string; icon?: string }
> = {
  brand: { bg: 'bg-brand-soft', fg: 'text-brand-dark', icon: 'text-brand-dark' },
  warning: { bg: 'bg-warning-soft', fg: 'text-amber-900', icon: 'text-amber-900' },
  danger: { bg: 'bg-danger-soft', fg: 'text-danger', icon: 'text-danger' },
  neutral: { bg: 'bg-card', fg: 'text-ink', icon: 'text-ink-muted' },
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  iconName,
}: {
  label: string
  value: string
  sub: string
  tone?: 'brand' | 'warning' | 'danger' | 'neutral'
  iconName?: string
}) {
  const t = toneClasses[tone]
  return (
    <Card className={`flex flex-col justify-between p-3.5 ${t.bg}`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${t.fg} opacity-70`}
        >
          {label}
        </span>
        {iconName && <Icon name={iconName} size={14} filled className={t.icon} />}
      </div>
      <div className={`font-mono text-2xl font-bold leading-none ${t.fg}`}>{value}</div>
      <div className="text-[11px] text-ink-muted">{sub}</div>
    </Card>
  )
}

export function CashSummary({
  totalToday,
  pendingCount,
  disputedCount,
  pendingAmount,
  totalCount,
}: {
  totalToday: number
  pendingCount: number
  disputedCount: number
  pendingAmount: number
  totalCount: number
}) {
  return (
    <>
      {/* Mobile summary hero */}
      <div className="lg:hidden mb-3.5">
        <Card className="bg-ink p-4 text-white">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-white/60">
            Recibido hoy
          </div>
          <div className="font-mono mt-1 text-[28px] font-bold leading-none">
            {soles(totalToday)}
          </div>
          <div className="mt-2 flex gap-3.5 text-xs text-white/70">
            <div>
              <strong className="text-white">{pendingCount}</strong> por confirmar
            </div>
            <div>
              <strong className="text-white">{totalCount - pendingCount}</strong> cerrados
            </div>
          </div>
        </Card>
      </div>

      {/* Desktop KPI strip */}
      <div className="mb-4 hidden grid-cols-4 gap-3 lg:grid">
        <KpiCard
          label="Recibido hoy"
          value={soles(totalToday)}
          sub={`${totalCount} cierres`}
          tone="brand"
        />
        <KpiCard
          label="Por confirmar"
          value={String(pendingCount)}
          sub="cierres pendientes"
          tone={pendingCount > 0 ? 'warning' : 'neutral'}
          iconName={pendingCount > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="En disputa"
          value={String(disputedCount)}
          sub="con soporte"
          tone={disputedCount > 0 ? 'danger' : 'neutral'}
          iconName={disputedCount > 0 ? 'gavel' : undefined}
        />
        <KpiCard
          label="Pendiente confirmar"
          value={soles(pendingAmount)}
          sub="efectivo en espera"
          tone="neutral"
        />
      </div>
    </>
  )
}
