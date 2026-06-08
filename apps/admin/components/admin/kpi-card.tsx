import type { ReactNode } from 'react'

type KpiTone = 'default' | 'brand' | 'success' | 'warning' | 'danger'

const ACCENT: Record<KpiTone, string> = {
  default: 'text-ink',
  brand: 'text-brand-dark',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/** Tarjeta KPI: número grande (display, tabular) + etiqueta eyebrow + sub opcional. */
export function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: KpiTone
  icon?: ReactNode
}) {
  return (
    <div className="t-card flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="t-eyebrow !text-[10px]">{label}</span>
        {icon && <span className="text-ink-subtle">{icon}</span>}
      </div>
      <span className={`t-display text-[24px] tabular-nums leading-none ${ACCENT[tone]}`}>
        {value}
      </span>
      {sub && <span className="text-[11px] text-ink-subtle">{sub}</span>}
    </div>
  )
}
