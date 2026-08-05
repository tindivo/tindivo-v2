import { type ReactNode, useEffect, useState } from 'react'
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
 * Estado de Carga elegante y consistente con diseño Apple-like para Tindivo.
 *
 * Cumple RNF §12:
 * - Apariencia translúcida estilo Apple con bordes finos y sombra difusa.
 * - Si tarda más de 3s en cargar, muestra de forma sutil "Estamos cargando, un segundo...".
 */
export function LoadingState({
  variant = 'inline',
  label = 'Cargando…',
  description,
  icon,
  className,
  children,
}: LoadingStateProps) {
  const [slowNotice, setSlowNotice] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSlowNotice(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const effectiveDescription =
    description ?? (slowNotice ? 'Estamos cargando, un segundo…' : undefined)

  if (variant === 'fullscreen') {
    return (
      <div
        className={cn(
          'grid min-h-dvh w-full place-items-center bg-surface p-6 text-center transition-opacity duration-300',
          className,
        )}
      >
        <div className="relative flex max-w-xs w-full flex-col items-center justify-center gap-4 rounded-[28px] border border-white/60 bg-card/85 p-8 shadow-[0_20px_50px_rgba(26,22,20,0.08)] backdrop-blur-2xl">
          {icon ? (
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand shadow-sm">
              <Icon name={icon} size={28} filled />
              <Spinner
                size="xl"
                variant="brand"
                className="absolute -inset-1.5 h-[60px] w-[60px] opacity-75"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft">
              <Spinner size="lg" variant="brand" />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <h3 className="font-sans text-base font-bold tracking-tight text-ink">{label}</h3>
            {effectiveDescription && (
              <p className="font-sans text-xs text-ink-muted/80 leading-relaxed transition-all duration-300">
                {effectiveDescription}
              </p>
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
          'flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/90 p-8 text-center shadow-elev-1 backdrop-blur-md',
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
          <p className="font-sans text-sm font-semibold tracking-tight text-ink">{label}</p>
          {effectiveDescription && (
            <p className="font-sans text-xs text-ink-muted/80 transition-all duration-300">
              {effectiveDescription}
            </p>
          )}
        </div>
        {children}
      </div>
    )
  }

  // Inline variant
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-3 py-2 font-sans text-sm font-medium text-ink-muted',
        className,
      )}
    >
      <Spinner size="sm" variant="brand" />
      <span>{label}</span>
      {children}
    </div>
  )
}
