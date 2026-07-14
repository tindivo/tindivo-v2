'use client'

import { ADDRESS_REFERENCE_MAX, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
import { type LatLng, MapPicker } from '@/components/map-picker'

/** Etiquetas de dirección (fuente única para onboarding, perfil y checkout). */
export const ADDRESS_LABELS = ['Casa', 'Trabajo', 'Otro'] as const
export const labelEmoji = (l: string) => (l === 'Casa' ? '🏠' : l === 'Trabajo' ? '💼' : '📍')

export interface AddressValue {
  label: string
  line: string
  reference: string
  coords: LatLng | null
  /** Precisión (m) de la última lectura GPS, si se usó "Usar mi ubicación". */
  accuracyM: number | null
}

export const EMPTY_ADDRESS: AddressValue = {
  label: 'Casa',
  line: '',
  reference: '',
  coords: null,
  accuracyM: null,
}

export function getReferenceError(reference: string): string | null {
  const cleaned = reference.trim()
  if (cleaned.length < ADDRESS_REFERENCE_MIN) {
    return `Mínimo ${ADDRESS_REFERENCE_MIN} caracteres`
  }
  if (/(.)\1{3,}/i.test(cleaned)) {
    return 'Escribe una referencia real (evita repetir letras)'
  }
  if (/^\d+$/.test(cleaned)) {
    return 'Agrega una descripción, no solo números'
  }
  return null
}

export function isReferenceOk(reference: string): boolean {
  return getReferenceError(reference) === null
}

export function isLineOk(line: string | null): boolean {
  if (!line) return true
  const cleaned = line.trim()
  if (cleaned.length === 0) return true
  if (/(.)\1{3,}/i.test(cleaned)) return false
  return true
}

/**
 * Bloque de captura de dirección reutilizable: etiqueta (Casa/Trabajo/Otro) + mapa con
 * "Usar mi ubicación" + Calle/Jirón + Referencia con contador y mínimo visible.
 * Controlado: el padre posee el estado y maneja su propia persistencia.
 */
export function AddressFields({
  value,
  onChange,
  onValidityChange,
  showLabelPicker = true,
  mapHeightPx = 170,
}: {
  value: AddressValue
  onChange: (patch: Partial<AddressValue>) => void
  onValidityChange?: (inside: boolean) => void
  showLabelPicker?: boolean
  mapHeightPx?: number
}) {
  const refLen = value.reference.trim().length
  const refError = getReferenceError(value.reference)
  const refOk = refError === null

  return (
    <div>
      {showLabelPicker && (
        <div className="mb-3.5">
          <span className="t-field-label">Etiqueta</span>
          <div className="flex gap-1.5">
            {ADDRESS_LABELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onChange({ label: l })}
                className={`t-chip flex-1 justify-center${value.label === l ? ' active' : ''}`}
              >
                {labelEmoji(l)} {l}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3.5">
        <span className="t-field-label">Tu ubicación en el mapa</span>
        <MapPicker
          value={value.coords}
          onChange={(c) => onChange({ coords: c })}
          onValidityChange={onValidityChange}
          onLocate={(fix) =>
            onChange({ coords: { lat: fix.lat, lng: fix.lng }, accuracyM: fix.accuracyM })
          }
          heightPx={mapHeightPx}
        />
      </div>

      <label className="mb-3.5 block">
        <span className="t-field-label">Calle / Jirón (opcional)</span>
        <input
          className="t-field"
          placeholder="Ej. Jr. Sucre 412"
          value={value.line}
          onChange={(e) => onChange({ line: e.target.value })}
        />
        {!isLineOk(value.line) && (
          <p className="mt-1 text-[12px]" style={{ color: '#C2410C' }}>
            Escribe una dirección real (evita repetir letras)
          </p>
        )}
      </label>

      <label className="mb-1.5 block">
        <span className="t-field-label">
          Referencia <span style={{ color: '#F97316' }}>*</span>
          <span style={{ color: 'rgba(26,22,20,0.45)' }}>
            {' '}
            · mín. {ADDRESS_REFERENCE_MIN} caracteres
          </span>
        </span>
        <textarea
          className="t-field"
          placeholder="Frente a la bodega de don Carlos, casa de reja negra, tocar timbre 2 veces…"
          value={value.reference}
          maxLength={ADDRESS_REFERENCE_MAX}
          onChange={(e) => onChange({ reference: e.target.value })}
        />
      </label>
      <div
        className="flex justify-between gap-3 text-[12px]"
        style={{ color: refOk ? 'rgba(26,22,20,0.5)' : '#C2410C' }}
      >
        <span>
          {refOk
            ? 'Referencia suficiente'
            : refError}
        </span>
        <span className="tabular-nums" style={{ color: 'rgba(26,22,20,0.5)' }}>
          {value.reference.length}/{ADDRESS_REFERENCE_MAX}
        </span>
      </div>
    </div>
  )
}
