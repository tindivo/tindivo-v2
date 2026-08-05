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

const SIZES: Record<SpinnerSize, { container: string; border: string }> = {
  xs: { container: 'h-3.5 w-3.5', border: 'border-[2px]' },
  sm: { container: 'h-4 w-4', border: 'border-[2px]' },
  md: { container: 'h-6 w-6', border: 'border-[2.5px]' },
  lg: { container: 'h-8 w-8', border: 'border-[3px]' },
  xl: { container: 'h-10 w-10', border: 'border-[3.5px]' },
}

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: SpinnerVariant
  size?: SpinnerSize
}

/**
 * Spinner micro-animado de estilo Apple para Tindivo.
 * Posee un carril translúcido de fondo y un arco superior giratorio.
 */
export function Spinner({ variant = 'brand', size = 'md', className, ...props }: SpinnerProps) {
  const { container, border } = SIZES[size]

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center select-none align-middle',
        VARIANTS[variant],
        container,
        className,
      )}
      role="status"
      aria-label="Cargando"
      {...props}
    >
      {/* Carril pasivo translúcido estilo iOS */}
      <span className={cn('absolute inset-0 rounded-full border-current opacity-20', border)} />
      {/* Arco activo en rotación continua */}
      <span
        className={cn(
          'absolute inset-0 animate-spin rounded-full border-current border-t-transparent border-r-transparent',
          border,
        )}
      />
    </span>
  )
}
