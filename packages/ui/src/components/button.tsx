import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type Variant = 'brand' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  brand: 'bg-brand text-white hover:bg-brand-dark active:bg-brand-dark',
  outline: 'border border-border bg-card text-ink hover:bg-surface',
  ghost: 'text-ink hover:bg-surface',
  danger: 'bg-danger text-white hover:opacity-90',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]', // 44px = touch target mínimo
  lg: 'h-12 px-5 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  ref?: Ref<HTMLButtonElement>
}

export function Button({ className, variant = 'brand', size = 'md', ref, ...props }: ButtonProps) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-sans font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
