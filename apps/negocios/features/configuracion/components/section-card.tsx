import { Card, Icon } from '@tindivo/ui'
import type { SectionId } from '../types'

interface SectionCardProps {
  id: SectionId
  title: string
  icon: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}

export function SectionCard({ id, title, icon, subtitle, right, children }: SectionCardProps) {
  return (
    <Card id={`section-${id}`} className="p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon name={icon} size={20} filled />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[17px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </Card>
  )
}
