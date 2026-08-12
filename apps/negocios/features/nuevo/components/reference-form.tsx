'use client'

import { Icon } from '@tindivo/ui'

/** Cómo llegó al formulario la dirección que se está mostrando. */
export type AddressOrigin =
  | { kind: 'manual' }
  | { kind: 'linked'; hasGps: boolean }
  | { kind: 'unlinked' }
  | { kind: 'degraded' }

export function ReferenceForm({
  reference,
  onChange,
  isValid,
  origin,
  disabled = false,
}: {
  reference: string
  onChange: (v: string) => void
  isValid: boolean
  origin: AddressOrigin
  disabled?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 transition-all ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Dirección o referencia
        </span>
        <span className="font-mono text-[11px] text-ink-muted">{reference.length}/500</span>
      </div>

      <textarea
        disabled={disabled}
        className={`min-h-[80px] w-full resize-none rounded-xl border px-3 py-2.5 text-[15px] leading-relaxed outline-none transition-all ${
          disabled
            ? 'border-dashed border-border bg-ink/[0.04] text-ink-muted cursor-not-allowed'
            : 'border-border bg-card text-ink focus:border-brand'
        }`}
        maxLength={500}
        value={reference}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          disabled
            ? 'Primero ingresa el teléfono'
            : 'Jr. San Martín 245 — Casa azul, al lado de la bodega Lucy'
        }
      />

      {!disabled && !isValid && reference.trim().length > 0 && (
        <p className="mt-1 text-[11px] text-danger">
          La referencia debe tener al menos 5 caracteres.
        </p>
      )}

      {!disabled && origin.kind === 'linked' && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-success">
          <Icon name="check_circle" size={14} filled />
          {origin.hasGps
            ? 'Usando dirección registrada · GPS incluido'
            : 'Usando dirección registrada'}
        </p>
      )}

      {!disabled && origin.kind === 'unlinked' && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] font-semibold text-warning">
          <Icon name="edit_location_alt" size={14} filled className="mt-px shrink-0" />
          <span>Dirección editada — se guardará como una dirección nueva, sin GPS.</span>
        </p>
      )}

      {!disabled && origin.kind === 'degraded' && (
        <p className="mt-1.5 flex items-start gap-1 text-[11px] text-ink-muted">
          <Icon name="cloud_off" size={14} className="mt-px shrink-0" />
          <span>No se pudo consultar direcciones guardadas — escríbelas.</span>
        </p>
      )}

      <p className="mt-1 text-[11px] text-ink-muted">
        El motorizado verá este texto en su app al recoger el pedido.
      </p>
    </div>
  )
}
