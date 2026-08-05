'use client'

import { cn } from '@tindivo/ui'

export function DetailRow({
  label,
  value,
  mono,
  bold,
}: {
  label: string
  value: string
  mono?: boolean
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-ink-muted">{label}</span>
      <span className={cn(mono && 'font-mono', bold ? 'font-bold' : 'font-medium')}>{value}</span>
    </div>
  )
}
