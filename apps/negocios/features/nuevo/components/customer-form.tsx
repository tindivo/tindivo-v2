'use client'

import { Icon } from '@tindivo/ui'

export function CustomerForm({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  isBlacklisted,
  phoneFormatOk,
}: {
  name: string
  onNameChange: (v: string) => void
  phone: string
  onPhoneChange: (v: string) => void
  isBlacklisted: boolean
  phoneFormatOk: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Datos del cliente
      </div>
      <div className="mb-3">
        <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Nombre (opcional)
        </label>
        <input
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[15px] text-ink outline-none focus:border-brand"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="María Quispe"
        />
      </div>
      <div>
        <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          Teléfono (opcional)
        </label>
        <input
          className="h-11 w-full rounded-xl border border-border bg-card px-3 font-mono text-[15px] text-ink outline-none focus:border-brand"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="987 654 321"
          inputMode="numeric"
        />
        {isBlacklisted && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
            <Icon name="error" size={14} filled /> Número de teléfono de prueba no permitido.
          </p>
        )}
        {!phoneFormatOk && !isBlacklisted && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
            <Icon name="error" size={14} filled /> Debe tener 9 dígitos y empezar por 9.
          </p>
        )}
      </div>
    </div>
  )
}
