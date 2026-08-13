'use client'

import { Icon, IconButton } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import type { DirectoryAddress } from '../hooks/use-address-lookup'
import { formatPhone, initialOf, relativeLastUsed, timesUsedLabel } from '../lib/address-format'

/**
 * Selector cuando un teléfono tiene direcciones registradas (spec_ui_cajera.md B3 y paridad tindivo-delivery).
 */
export function AddressPickerModal({
  addresses,
  onPick,
  onWriteNew,
  onClose,
}: {
  addresses: DirectoryAddress[]
  onPick: (address: DirectoryAddress) => void
  /** "Escribir dirección nueva": limpia y deja los campos en blanco. */
  onWriteNew: () => void
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState<string>(addresses[0]?.id ?? '')

  const customerName = addresses.find((a) => a.customerName)?.customerName ?? null
  const phone = addresses[0]?.phone ?? ''
  const isMultiple = addresses.length >= 2

  // Escuchar tecla Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const confirm = () => {
    if (selectedId === NEW_ADDRESS) {
      onWriteNew()
      return
    }
    const picked = addresses.find((a) => a.id === selectedId)
    if (picked) onPick(picked)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Clic fuera del contenedor para cerrar */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Contenedor principal del modal */}
      <div className="relative flex w-full max-w-md sm:max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-[28px] border border-border/40 bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-200 z-10">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon name={isMultiple ? 'fact_check' : 'contact_phone'} size={22} />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-ink">
              {isMultiple
                ? 'Este cliente tiene varias direcciones'
                : 'Cliente frecuente encontrado'}
            </h2>
          </div>
          <IconButton
            size="sm"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-ink-muted hover:text-ink"
          >
            <Icon name="close" size={20} />
          </IconButton>
        </div>

        {/* Contenido desplazable */}
        <div className="flex flex-col overflow-y-auto p-5 gap-3.5">
          {/* Tarjeta con datos del cliente */}
          <div className="flex items-center gap-3.5 rounded-2xl bg-ink/[0.03] border border-ink/[0.04] p-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-sm font-bold text-brand">
              {initialOf(customerName)}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Cliente
              </span>
              <h3 className="truncate text-sm sm:text-base font-bold text-ink">
                {customerName ?? 'Cliente sin nombre'}
              </h3>
              <p className="font-mono text-[11px] font-medium text-ink-muted">
                Celular: {formatPhone(phone)}
              </p>
            </div>
          </div>

          {/* Subtítulo descriptivo */}
          <p className="text-xs sm:text-sm font-medium text-ink-muted px-1">
            {isMultiple
              ? 'Selecciona la dirección donde desea recibir el pedido actual:'
              : 'Confirma con el cliente si el pedido va a esta dirección:'}
          </p>

          {/* Lista de direcciones */}
          <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto pr-0.5">
            {addresses.map((address) => {
              const selected = address.id === selectedId
              const used = timesUsedLabel(address.timesUsed)
              return (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => setSelectedId(address.id)}
                  className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                    selected
                      ? 'border-brand bg-brand/[0.05] shadow-xs'
                      : address.isDefault
                        ? 'border-amber-500/30 bg-amber-500/[0.03] hover:border-amber-500/50'
                        : 'border-border/60 bg-card hover:border-border hover:bg-surface/60'
                  }`}
                >
                  {/* Radio button personalizado */}
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                      selected ? 'border-brand bg-brand' : 'border-ink/30 bg-card'
                    }`}
                  >
                    {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </span>

                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block break-words text-xs sm:text-sm font-bold leading-snug text-ink">
                      {address.reference}
                    </span>

                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-ink-muted">
                      {address.customerName && (
                        <span className="uppercase text-ink-muted/90">{address.customerName}</span>
                      )}
                      <span>•</span>
                      <span>{relativeLastUsed(address.lastUsedAt)}</span>
                      {used && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-brand">{used}</span>
                        </>
                      )}
                      {address.hasGps && (
                        <>
                          <span>•</span>
                          <span className="inline-flex items-center gap-0.5 font-semibold text-brand">
                            <Icon name="gps_fixed" size={11} /> GPS
                          </span>
                        </>
                      )}
                      {address.isDefault && (
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 border border-amber-500/20">
                          <Icon name="star" size={10} filled /> Principal
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}

            {/* Opción para escribir una dirección nueva */}
            <button
              type="button"
              onClick={() => setSelectedId(NEW_ADDRESS)}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                selectedId === NEW_ADDRESS
                  ? 'border-brand bg-brand/[0.05] shadow-xs'
                  : 'border-dashed border-border/70 bg-card hover:border-border hover:bg-surface/60'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                  selectedId === NEW_ADDRESS ? 'border-brand bg-brand' : 'border-ink/30 bg-card'
                }`}
              >
                {selectedId === NEW_ADDRESS && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="add" size={16} className="text-ink-muted shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-ink">
                  Escribir dirección nueva
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Acciones de Footer */}
        <div className="flex gap-3 border-t border-border/40 p-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 cursor-pointer rounded-full border border-border bg-card text-xs sm:text-sm font-bold text-ink transition-colors hover:bg-surface active:scale-[0.98]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!selectedId}
            className="h-12 flex-1 cursor-pointer rounded-full bg-brand text-xs sm:text-sm font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

/** Centinela de "dirección nueva" en el estado de selección. */
const NEW_ADDRESS = '__new__'
