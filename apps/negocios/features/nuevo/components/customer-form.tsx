'use client'

import { Icon, Spinner } from '@tindivo/ui'
import type { LookupState } from '../hooks/use-address-lookup'

export function CustomerForm({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  isBlacklisted,
  phoneFormatOk,
  lookup,
  disabled = false,
}: {
  name: string
  onNameChange: (v: string) => void
  phone: string
  onPhoneChange: (v: string) => void
  isBlacklisted: boolean
  phoneFormatOk: boolean
  lookup: LookupState
  disabled?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        Datos del cliente
      </div>

      {/* EL TELÉFONO VA PRIMERO (Llave del directorio) */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="cliente-telefono"
            className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Teléfono del cliente
          </label>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
            Obligatorio
          </span>
        </div>
        <div className="relative">
          <input
            id="cliente-telefono"
            className="h-11 w-full rounded-xl border border-border bg-card px-3 pr-10 font-mono text-[15px] text-ink outline-none focus:border-brand"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="987654321"
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
          />
          {lookup.status === 'loading' && (
            <span className="-translate-y-1/2 absolute top-1/2 right-3">
              <Spinner size="sm" variant="brand" />
            </span>
          )}
        </div>

        {isBlacklisted && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
            <Icon name="error" size={14} filled /> Número de teléfono de prueba no permitido.
          </p>
        )}
        {!phoneFormatOk && phone.length > 0 && !isBlacklisted && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-danger">
            <Icon name="error" size={14} filled /> Debe tener 9 dígitos y empezar por 9.
          </p>
        )}

        {lookup.status === 'empty' && !isBlacklisted && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
            <Icon name="person_add" size={14} /> Cliente nuevo — escribe el nombre y la dirección.
          </p>
        )}
      </div>

      {/* NOMBRE DEL CLIENTE: Deshabilitado si el teléfono no es válido (Fidelidad Legacy) */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="cliente-nombre"
            className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted"
          >
            Nombre del cliente
          </label>
          <span className="text-[10px] font-bold uppercase tracking-wider text-brand">
            Obligatorio
          </span>
        </div>
        <input
          id="cliente-nombre"
          disabled={disabled}
          className={`h-11 w-full rounded-xl border px-3 text-[15px] outline-none transition-all ${
            disabled
              ? 'border-dashed border-border bg-ink/[0.04] text-ink-muted cursor-not-allowed opacity-60'
              : 'border-border bg-card text-ink focus:border-brand'
          }`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={disabled ? 'Primero ingresa el teléfono' : 'María Quispe'}
          required
          aria-invalid={!disabled && name.trim().length === 0}
        />
        {!disabled && name.trim().length === 0 && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-muted">
            <Icon name="info" size={14} /> El motorizado identifica el pedido por este nombre.
          </p>
        )}
      </div>
    </div>
  )
}
