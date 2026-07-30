'use client'

import { cn } from '@tindivo/ui'
import type { ReactNode } from 'react'

export interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

/**
 * Switch estilo iOS para toggles de perfil (disponibilidad, notificaciones).
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
    <div className="flex items-center justify-between gap-4">
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
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-brand' : 'bg-ink/20',
          disabled && 'opacity-50',
        )}
      >
        <span
          className="absolute top-[3px] left-[3px] h-[24px] w-[24px] rounded-full bg-white shadow-md transition-transform duration-200"
          style={{ transform: checked ? 'translateX(22px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  )
}
