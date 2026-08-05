import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../lib/cn'
import { Icon } from '../primitives/icon'

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: string
  heading: ReactNode
  description?: ReactNode
  action?: ReactNode
  ref?: Ref<HTMLDivElement>
}

export function EmptyState({
  className,
  icon = 'inbox',
  heading,
  description,
  action,
  ref,
  ...props
}: EmptyStateProps) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
      {...props}
    >
      <div className="relative mb-5 flex h-28 w-28 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-brand/15 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-ink/[0.06] bg-card shadow-elev-2">
          <Icon name={icon} size={40} className="text-brand" />
        </div>
      </div>
      <h3 className="text-lg font-extrabold tracking-tight text-ink">{heading}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
