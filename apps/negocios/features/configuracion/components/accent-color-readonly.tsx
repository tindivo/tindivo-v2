import { Icon } from '@tindivo/ui'

interface AccentColorReadonlyProps {
  value: string
}

export function AccentColorReadonly({ value }: AccentColorReadonlyProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink/[0.06] bg-card px-4 py-3">
      <span
        className="h-6 w-6 shrink-0 rounded-md border border-ink/[0.06]"
        style={{ backgroundColor: `#${value}` }}
      />
      <span className="font-mono text-[15px] font-semibold text-ink">#{value}</span>
      <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
        <Icon name="lock" size={14} />
        Lo gestiona Tindivo
      </span>
    </div>
  )
}
