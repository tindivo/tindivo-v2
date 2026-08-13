'use client'

import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

/**
 * Switch estilo iOS para toggles de perfil (disponibilidad, notificaciones, etc).
 * Animación suave del thumb y colores brand para estado activo.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  icon,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4', disabled && 'opacity-60')}>
      <div className="flex items-center gap-3">
        {icon && (
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-low text-ink">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-[15px] text-ink">{label}</p>
          {description && <p className="text-[13px] text-ink-muted">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        // El texto del switch vive en un <p> aparte, así que sin esto el botón
        // llega al lector de pantalla como "conmutador" a secas.
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-ink/20',
          disabled && 'opacity-50',
        )}
      >
        <span
          className="absolute top-[4px] left-[4px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}
