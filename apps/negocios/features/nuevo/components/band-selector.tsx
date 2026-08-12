'use client'

import { Icon } from '@tindivo/ui'
import type { DistanceBand } from '../hooks/use-create-order'

export function BandSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: DistanceBand | null
  onChange: (band: DistanceBand) => void
  disabled?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 transition-all ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        ¿A qué zona es la entrega?
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BandButton
          band="near"
          label="Cerca"
          zones="San Jacinto (zona regular)"
          icon="near_me"
          ariaLabel="Entrega cerca"
          selected={!disabled && value === 'near'}
          disabled={disabled}
          onSelect={onChange}
        />
        <BandButton
          band="far"
          label="Lejos"
          zones="San Francisco de la Losa (arriba), San Cristóbal, Cocharcas"
          icon="route"
          ariaLabel="Entrega lejos"
          selected={!disabled && value === 'far'}
          disabled={disabled}
          onSelect={onChange}
        />
      </div>

      <p className="mt-2.5 text-xs text-ink-muted">
        {disabled
          ? 'Primero ingresa el teléfono'
          : value === null
            ? 'Elige la zona para terminar'
            : 'El cliente paga el total de arriba, vayas donde vayas'}
      </p>
    </div>
  )
}

function BandButton({
  band,
  label,
  zones,
  icon,
  ariaLabel,
  selected,
  disabled = false,
  onSelect,
}: {
  band: DistanceBand
  label: string
  zones: string
  icon: string
  ariaLabel: string
  selected: boolean
  disabled?: boolean
  onSelect: (band: DistanceBand) => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(band)}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`flex flex-col items-center justify-start gap-1 rounded-xl border p-3 text-center transition-all active:scale-[0.97] ${
        disabled
          ? 'border-dashed border-border bg-ink/[0.04] text-ink-muted cursor-not-allowed opacity-60'
          : selected
            ? 'border-info bg-info text-white shadow-elev-2'
            : 'border-border bg-card text-ink hover:bg-surface'
      }`}
    >
      <Icon name={icon} size={20} filled={selected} />
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
      <span
        className={`text-[11px] leading-tight ${selected ? 'text-white/85' : 'text-ink-muted'}`}
      >
        {zones}
      </span>
    </button>
  )
}
