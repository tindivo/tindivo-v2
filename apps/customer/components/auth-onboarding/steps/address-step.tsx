'use client'

import { Button } from '@tindivo/ui'
import { type FormEvent, useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  canSaveAddress,
  EMPTY_ADDRESS,
  getMissingLabel,
} from '@/components/address-fields'
import { saveAddress } from '../persistence'

/** Paso final: etiqueta + ubicación con pin/GPS + calle + referencia. Se guarda como predeterminada. */
export function AddressStep({
  active,
  userId,
  onBack,
  onDone,
  mode = 'onboarding',
}: {
  active: boolean
  userId: string | null
  onBack: () => void
  onDone: () => void
  mode?: 'onboarding' | 'gate'
}) {
  const [addr, setAddr] = useState<AddressValue>(EMPTY_ADDRESS)
  const [insideZone, setInsideZone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = canSaveAddress(addr, insideZone)
  const falta = getMissingLabel(addr, insideZone)

  function patch(p: Partial<AddressValue>) {
    setAddr((a) => ({ ...a, ...p }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy || !userId) return
    setBusy(true)
    setError(null)
    try {
      await saveAddress({
        userId,
        label: addr.label,
        line: addr.line,
        reference: addr.reference,
        lat: addr.coords?.lat ?? null,
        lng: addr.coords?.lng ?? null,
        accuracyM: addr.accuracyM,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar tu dirección')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4 scrollbar-hide">
        <h2 className="font-display text-[24px] font-bold leading-[1.15] tracking-tight text-ink">
          Tu dirección
          <br />
          de entrega
        </h2>
        <p className="mt-1.5 text-[14px] text-ink-muted">
          Marca en el mapa dónde queda tu puerta. Probamos con el GPS primero; si no acierta, lo
          mueves tú.
        </p>

        <div className="mt-4">
          {/* AddressFields monta Leaflet (mide el contenedor): solo con el panel activo. */}
          {active && (
            <AddressFields value={addr} onChange={patch} onValidityChange={setInsideZone} />
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>

      <div className="flex gap-2.5 border-t border-ink/[0.04] px-4 pt-3.5 pb-6">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="rounded-[14px]"
          tabIndex={active ? 0 : -1}
        >
          {mode === 'gate' ? 'Cancelar' : 'Atrás'}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy
            ? 'Guardando…'
            : (falta ?? (mode === 'gate' ? 'Confirmar dirección' : 'Guardar y empezar a pedir'))}
        </Button>
      </div>
    </form>
  )
}
