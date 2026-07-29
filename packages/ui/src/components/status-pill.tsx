import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone
  dot?: boolean
  ref?: Ref<HTMLSpanElement>
}

const TONE_CLASSES: Record<StatusTone, { dot: string; pill: string }> = {
  neutral: { dot: 'bg-ink-muted', pill: 'bg-surface text-ink-muted border-ink/[0.06]' },
  brand: { dot: 'bg-brand', pill: 'bg-brand-light text-brand-dark border-brand-light' },
  success: { dot: 'bg-success', pill: 'bg-success-soft text-success border-success/15' },
  warning: { dot: 'bg-warning', pill: 'bg-warning-soft text-amber-900 border-warning/20' },
  danger: { dot: 'bg-danger', pill: 'bg-danger-soft text-danger border-danger/15' },
  info: { dot: 'bg-info', pill: 'bg-sky-100 text-sky-800 border-sky-200' },
}

export function StatusPill({
  className,
  tone = 'neutral',
  dot = false,
  ref,
  children,
  ...props
}: StatusPillProps) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        TONE_CLASSES[tone].pill,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', TONE_CLASSES[tone].dot)} />}
      {children}
    </span>
  )
}
