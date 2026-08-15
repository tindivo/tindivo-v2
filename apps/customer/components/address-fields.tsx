'use client'

import { ADDRESS_LINE_MIN, ADDRESS_REFERENCE_MAX, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
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
  if (/^\d+$/.test(cleaned)) {
    return 'Agrega una descripción, no solo números'
  }
  if (/(.)\1{3,}/i.test(cleaned)) {
    return 'Evita repetir letras'
  }
  const noSpaces = cleaned.toLowerCase().replace(/\s+/g, '')
  if (noSpaces.length >= 4 && /^(.{2,})\1+$/.test(noSpaces)) {
    return 'Evita repetir patrones o palabras'
  }
  return null
}

export function isReferenceOk(reference: string): boolean {
  return getReferenceError(reference) === null
}

export function getLineError(line: string | null): string | null {
  if (!line) return 'La dirección es obligatoria'
  const cleaned = line.trim()
  if (cleaned.length < ADDRESS_LINE_MIN) {
    return `Mínimo ${ADDRESS_LINE_MIN} caracteres`
  }
  if (/^\d+$/.test(cleaned)) {
    return 'Ingresa una dirección real, no solo números'
  }
  if (/(.)\1{3,}/i.test(cleaned)) {
    return 'Evita repetir letras'
  }
  const noSpaces = cleaned.toLowerCase().replace(/\s+/g, '')
  if (noSpaces.length >= 4 && /^(.{2,})\1+$/.test(noSpaces)) {
    return 'Evita repetir patrones o palabras'
  }
  return null
}

export function isLineOk(line: string | null): boolean {
  return getLineError(line) === null
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
  mapHeightPx = 250,
}: {
  value: AddressValue
  onChange: (patch: Partial<AddressValue>) => void
  onValidityChange?: (inside: boolean) => void
  showLabelPicker?: boolean
  mapHeightPx?: number
}) {
  const refError = getReferenceError(value.reference)
  const refOk = refError === null

  return (
    <div>
      {showLabelPicker && (
        <div className="mb-3.5">
          <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
            Etiqueta
          </span>
          <div className="flex gap-1.5">
            {ADDRESS_LABELS.map((l) => {
              const active = value.label === l
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => onChange({ label: l })}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-[14px] font-medium transition-colors ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-ink/[0.08] bg-card text-ink hover:bg-ink/[0.04]'
                  }`}
                >
                  {labelEmoji(l)} {l}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-3.5">
        <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
          Tu ubicación en el mapa
        </span>
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
        <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
          Dirección <span className="text-brand">*</span>
          <span className="text-ink/45"> · mín. {ADDRESS_LINE_MIN} caracteres</span>
        </span>
        <input
          className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
          placeholder="Ej. Jr. Sucre 412"
          value={value.line}
          onChange={(e) => onChange({ line: e.target.value })}
        />
        {value.line.trim().length > 0 && !isLineOk(value.line) && (
          <p className="mt-1 text-[12px] text-brand-dark">{getLineError(value.line)}</p>
        )}
      </label>

      <label className="mb-1.5 block">
        <span className="mb-2 block font-mono text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
          Referencia <span className="text-brand">*</span>
          <span className="text-ink/45"> · mín. {ADDRESS_REFERENCE_MIN} caracteres</span>
        </span>
        <textarea
          className="w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-ink focus:ring-4 focus:ring-ink/[0.08]"
          placeholder="Frente a la bodega de don Carlos, casa de reja negra, tocar timbre 2 veces…"
          value={value.reference}
          maxLength={ADDRESS_REFERENCE_MAX}
          onChange={(e) => onChange({ reference: e.target.value })}
        />
      </label>
      <div
        className={`flex justify-between gap-3 text-[12px] ${refOk ? 'text-ink/50' : 'text-brand-dark'}`}
      >
        <span>{refOk ? 'Referencia suficiente' : getReferenceError(value.reference)}</span>
        <span className="tabular-nums text-ink/50">
          {value.reference.length}/{ADDRESS_REFERENCE_MAX}
        </span>
      </div>
    </div>
  )
}
