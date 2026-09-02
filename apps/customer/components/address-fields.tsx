'use client'

import { ADDRESS_LINE_MIN, ADDRESS_REFERENCE_MAX, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
import { MapPicker } from '@/components/map-picker'
import {
  ADDRESS_LABELS,
  type AddressValue,
  canSaveAddress,
  EMPTY_ADDRESS,
  getLineError,
  getMissingLabel,
  getReferenceError,
  isLineOk,
  isReferenceOk,
  labelEmoji,
} from '@/lib/address-validation'

export {
  ADDRESS_LABELS,
  type AddressValue,
  canSaveAddress,
  EMPTY_ADDRESS,
  getLineError,
  getMissingLabel,
  getReferenceError,
  isLineOk,
  isReferenceOk,
  labelEmoji,
}

/**
 * Bloque de captura de dirección reutilizable: etiqueta (Casa/Trabajo/Otro) +
 * vista previa de la ubicación + Calle/Jirón + Referencia con contador y mínimo
 * visible. Controlado: el padre posee el estado y maneja su propia persistencia.
 *
 * El mapa que se ve aquí NO es interactivo: es una postal que abre la pantalla
 * completa de `MapPicker`. Un Leaflet vivo dentro de este formulario se quedaba
 * con cualquier arrastre que empezara encima y la hoja parecía trabada.
 *
 * La ubicación es un campo OBLIGATORIO como los otros dos, y por eso lleva el
 * mismo asterisco. Quien decide si se puede guardar es `canSaveAddress`.
 */
export function AddressFields({
  value,
  onChange,
  onValidityChange,
  showLabelPicker = true,
  mapHeightPx = 180,
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
          Tu ubicación en el mapa <span className="text-brand">*</span>
        </span>
        <MapPicker
          value={value.coords}
          onChange={(coords, accuracyM) => onChange({ coords, accuracyM })}
          onValidityChange={onValidityChange}
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
