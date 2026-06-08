import type { ReactNode } from 'react'

/** Estado vacío centrado con icono opcional. */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon?: ReactNode
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {icon && (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-ink/[0.05] text-ink-subtle">
          {icon}
        </div>
      )}
      <p className="t-display text-[16px] text-ink">{title}</p>
      {hint && <p className="max-w-xs text-[13px] text-ink-subtle">{hint}</p>}
    </div>
  )
}
