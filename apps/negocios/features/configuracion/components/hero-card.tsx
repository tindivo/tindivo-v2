import { Card } from '@tindivo/ui'
import { capabilityLabel } from '../lib/constants'
import type { Form } from '../types'

interface HeroCardProps {
  form: Form
  bizName: string
  capability: string
}

export function HeroCard({ form, bizName, capability }: HeroCardProps) {
  return (
    <Card className="mb-1 flex items-center gap-4 p-4">
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-[22px] font-bold text-white"
        style={{ backgroundColor: `#${form.accentColor}` }}
      >
        {bizName[0] ?? 'T'}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[18px] font-bold text-ink">{bizName}</h2>
        {capability && (
          <p className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Modo: {capabilityLabel(capability)}
          </p>
        )}
      </div>
    </Card>
  )
}
