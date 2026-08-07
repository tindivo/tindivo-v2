import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './icon'

type ToastVariant = 'success' | 'info' | 'warning' | 'danger'

const VARIANTS: Record<ToastVariant, { icon: string; container: string; accent: string }> = {
  success: {
    icon: 'check',
    container: 'border-success/20 bg-white',
    accent: 'bg-success/10 text-success',
  },
  info: {
    icon: 'info',
    container: 'border-info/20 bg-white',
    accent: 'bg-info/10 text-info',
  },
  warning: {
    icon: 'warning',
    container: 'border-warning/20 bg-white',
    accent: 'bg-warning/10 text-warning',
  },
  danger: {
    icon: 'error',
    container: 'border-danger/20 bg-white',
    accent: 'bg-danger/10 text-danger',
  },
}

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  variant?: ToastVariant
  heading?: ReactNode
  description?: ReactNode
  ref?: Ref<HTMLDivElement>
}

export function Toast({
  className,
  variant = 'info',
  heading,
  description,
  ref,
  ...props
}: ToastProps) {
  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'flex max-w-[92%] items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.28)]',
          VARIANTS[variant].container,
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            VARIANTS[variant].accent,
          )}
        >
          <Icon name={VARIANTS[variant].icon} size={18} filled />
        </span>
        <div className="min-w-0">
          {heading && <div className="font-semibold text-sm leading-tight">{heading}</div>}
          {description && <div className="truncate text-xs text-ink-muted">{description}</div>}
        </div>
      </div>
    </div>
  )
}
