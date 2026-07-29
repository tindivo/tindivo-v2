import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type Variant = 'brand' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  brand:
    'bg-gradient-to-br from-[#ff6b35] to-[#ff8c42] text-white shadow-[0_8px_24px_rgba(242,98,65,0.22)] hover:shadow-[0_12px_40px_rgba(255,107,53,0.32)]',
  outline: 'border border-ink/[0.08] bg-card text-ink hover:bg-surface',
  ghost: 'text-ink hover:bg-ink/[0.05]',
  danger: 'bg-danger text-white hover:bg-danger/90',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-6 text-base',
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
        'inline-flex items-center justify-center gap-2 rounded-full font-sans font-bold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        'disabled:pointer-events-none disabled:opacity-50',
        'active:scale-[0.97]',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
