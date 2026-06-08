import type { Tone } from '@/lib/labels'

const TONE: Record<Tone, string> = {
  info: 'bg-info/15 text-info',
  warning: 'bg-warning/15 text-warning',
  brand: 'bg-brand-light text-brand-dark',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  neutral: 'bg-ink/[0.06] text-ink-muted',
}

/** Pastilla de estado con tono semántico. */
export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-lg px-2 py-0.5 font-medium text-[12px] ${TONE[tone]}`}
    >
      {label}
    </span>
  )
}
