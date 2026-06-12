'use client'

import { type FormEvent, useState } from 'react'
import { type LatLng, MapPicker } from '@/components/map-picker'
import { saveAddress } from '../persistence'

/** Paso final: ubicación con pin + referencia. Se guarda como "Casa" predeterminada. */
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
  const [coords, setCoords] = useState<LatLng | null>(null)
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = reference.trim().length >= 20

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy || !userId) return
    setBusy(true)
    setError(null)
    try {
      await saveAddress({
        userId,
        reference,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
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
          Mueve el pin a tu casa en San Jacinto.
        </p>

        <div className="mt-4">
          {/* El mapa solo se monta con el panel activo (Leaflet mide el contenedor). */}
          {active && <MapPicker value={coords} onChange={setCoords} heightPx={170} />}
        </div>

        <label className="mt-4 block">
          <span className="t-field-label">
            Referencia <span style={{ color: '#F97316' }}>*</span>
          </span>
          <textarea
            className="t-field"
            placeholder="Ej: Frente a la bodega de don Carlos, puerta azul"
            value={reference}
            maxLength={140}
            onChange={(e) => setReference(e.target.value)}
            tabIndex={active ? 0 : -1}
          />
        </label>
        <div
          className="mt-1.5 flex justify-between text-[12px]"
          style={{ color: 'rgba(26,22,20,0.5)' }}
        >
          <span>Mientras más detalle, menos llamadas del motorizado.</span>
          <span className="tabular-nums">{reference.length}/140</span>
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
