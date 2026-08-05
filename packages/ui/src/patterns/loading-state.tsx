import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Icon } from '../primitives/icon'
import { Spinner } from '../primitives/spinner'

export interface LoadingStateProps {
  variant?: 'fullscreen' | 'card' | 'inline'
  label?: string
  description?: string
  icon?: string
  className?: string
  children?: ReactNode
}

/**
 * Estado de Carga elegante y consistente para el Design System Tindivo.
 *
 * Cumple RNF §12:
 * - Skeleton / Spinner con identidad visual cálida.
 * - Variantes: fullscreen (gate/layout), card (módulos/paneles), inline (botones/filas).
 */
export function LoadingState({
  variant = 'inline',
  label = 'Cargando…',
  description,
  icon,
  className,
  children,
}: LoadingStateProps) {
  if (variant === 'fullscreen') {
    return (
      <div
        className={cn(
          'grid min-h-dvh w-full place-items-center bg-surface p-6 text-center animate-in fade-in duration-200',
          className,
        )}
      >
        <div className="flex max-w-sm flex-col items-center justify-center gap-4 rounded-3xl border border-white/40 bg-card/85 p-8 shadow-elev-3 backdrop-blur-md">
          {icon ? (
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand shadow-elev-1">
              <Icon name={icon} size={28} filled />
              <Spinner
                size="xl"
                variant="brand"
                className="absolute -inset-1 h-16 w-16 opacity-80"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
              <Spinner size="lg" variant="brand" />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <h3 className="font-sans text-base font-bold text-ink">{label}</h3>
            {description && (
              <p className="font-sans text-xs text-ink-muted leading-relaxed">{description}</p>
            )}
          </div>
          {children}
        </div>
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/80 bg-card p-8 text-center shadow-elev-1',
          className,
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
          {icon ? (
            <Icon name={icon} size={20} className="text-brand animate-pulse" />
          ) : (
            <Spinner size="md" variant="brand" />
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="font-sans text-sm font-semibold text-ink">{label}</p>
          {description && <p className="font-sans text-xs text-ink-muted">{description}</p>}
        </div>
        {children}
      </div>
    )
  }

  // Inline variant
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-3 py-2 font-sans text-sm text-ink-muted',
        className,
      )}
    >
      <Spinner size="sm" variant="brand" />
      <span>{label}</span>
      {children}
    </div>
  )
}
