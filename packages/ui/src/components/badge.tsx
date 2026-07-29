import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'
type BadgeSize = 'sm' | 'md'

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-surface text-ink-muted border-border',
  brand: 'bg-brand-light text-brand-dark border-brand-light',
  success: 'bg-green-100 text-green-800 border-green-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  danger: 'bg-red-100 text-red-800 border-red-200',
  info: 'bg-sky-100 text-sky-800 border-sky-200',
}

const SIZES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  ref?: Ref<HTMLSpanElement>
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  ref,
  ...props
}: BadgeProps) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-full border font-medium',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
