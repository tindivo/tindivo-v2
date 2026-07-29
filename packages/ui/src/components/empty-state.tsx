import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../lib/cn'

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode
  heading: ReactNode
  description?: ReactNode
  action?: ReactNode
  ref?: Ref<HTMLDivElement>
}

export function EmptyState({
  className,
  icon,
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
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-ink-muted">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-ink">{heading}</h3>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
