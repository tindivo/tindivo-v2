import type { HTMLAttributes } from 'react'
import { cn } from '../lib/cn'

type SpinnerVariant = 'brand' | 'white' | 'ink' | 'muted'
type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const VARIANTS: Record<SpinnerVariant, string> = {
  brand: 'text-brand',
  white: 'text-white',
  ink: 'text-ink',
  muted: 'text-ink-muted',
}

const SIZES: Record<SpinnerSize, string> = {
  xs: 'h-3.5 w-3.5 border-2',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2.5',
  lg: 'h-8 w-8 border-3',
  xl: 'h-11 w-11 border-4',
}

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: SpinnerVariant
  size?: SpinnerSize
}

/**
 * Spinner micro-animado de Tindivo.
 * Anillo suavizado con gradiente de marca y animación fluida.
 */
export function Spinner({ variant = 'brand', size = 'md', className, ...props }: SpinnerProps) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      role="status"
      aria-label="Cargando"
      {...props}
    />
  )
}
