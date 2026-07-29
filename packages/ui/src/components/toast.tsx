import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../lib/cn'
import { Icon } from './icon'

type ToastVariant = 'success' | 'info' | 'warning' | 'danger'
type IconName = keyof typeof Icon

const VARIANTS: Record<ToastVariant, { icon: IconName; container: string; accent: string }> = {
  success: {
    icon: 'Check',
    container: 'border-green-200 bg-white',
    accent: 'bg-green-100 text-green-700',
  },
  info: {
    icon: 'Info',
    container: 'border-sky-200 bg-white',
    accent: 'bg-sky-100 text-sky-700',
  },
  warning: {
    icon: 'Warning',
    container: 'border-amber-200 bg-white',
    accent: 'bg-amber-100 text-amber-700',
  },
  danger: {
    icon: 'Error',
    container: 'border-red-200 bg-white',
    accent: 'bg-red-100 text-red-700',
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
  const IconComponent = Icon[VARIANTS[variant].icon]
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
          <IconComponent width={18} height={18} />
        </span>
        <div className="min-w-0">
          {heading && <div className="font-semibold text-sm leading-tight">{heading}</div>}
          {description && (
            <div className="truncate text-xs text-ink-muted">{description}</div>
          )}
        </div>
      </div>
    </div>
  )
}
