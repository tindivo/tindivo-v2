'use client'

import { type FormEvent, useState } from 'react'
import {
  AddressFields,
  type AddressValue,
  EMPTY_ADDRESS,
  isReferenceOk,
} from '@/components/address-fields'
import { saveAddress } from '../persistence'

/** Paso final: etiqueta + ubicación con pin/GPS + calle + referencia. Se guarda como predeterminada. */
export function AddressStep({
  active,
  userId,
  onBack,
  onDone,
}: {
  active: boolean
  userId: string | null
  onBack: () => void
  onDone: () => void
}) {
  const [addr, setAddr] = useState<AddressValue>(EMPTY_ADDRESS)
  const [insideZone, setInsideZone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = isReferenceOk(addr.reference) && insideZone

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
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <h2 className="t-display text-[24px] leading-[1.15]">
          Tu dirección
          <br />
          de entrega
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          Elige una etiqueta y marca tu casa en el mapa, o toca "Usar mi ubicación".
        </p>

        <div className="mt-4">
          {/* AddressFields monta Leaflet (mide el contenedor): solo con el panel activo. */}
          {active && (
            <AddressFields value={addr} onChange={patch} onValidityChange={setInsideZone} />
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
      </div>

      <div
        className="flex gap-2.5 border-t px-4 pt-3.5 pb-6"
        style={{ borderColor: 'rgba(26,22,20,0.06)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="rounded-[14px] px-5 font-semibold text-[15px]"
          style={{ background: 'rgba(26,22,20,0.06)' }}
          tabIndex={active ? 0 : -1}
        >
          Atrás
        </button>
        <button
          type="submit"
          className="t-btn t-btn-primary flex-1"
          disabled={!valid || busy}
          tabIndex={active ? 0 : -1}
        >
          {busy ? 'Guardando…' : 'Guardar y empezar a pedir'}
        </button>
      </div>
    </form>
  )
}
