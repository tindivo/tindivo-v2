'use client'

import { BUSINESS_ACCENT_PALETTE, isPaletteAccentColor } from '@tindivo/contracts'
import { useState } from 'react'
import { Ico } from './icons'

const normalizeHexInput = (v: string) =>
  v
    .replace(/^#/, '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '')
    .slice(0, 6)

/**
 * Selector del color de papelito: paleta establecida (Docs/06 §2) + hex libre.
 * `usedColors` marca los colores de negocios activos — advisory, no bloquea
 * (el color ya no es único desde 0053; ver DECISIONS §21).
 */
export function AccentColorPicker({
  value,
  onChange,
  usedColors,
}: {
  value: string
  onChange: (hex: string) => void
  usedColors?: string[]
}) {
  // Derivado con override manual: si el valor llega/cambia a un hex fuera de
  // paleta (negocio legacy), la sección custom se auto-expande sin efectos.
  const [customToggled, setCustomToggled] = useState<boolean | null>(null)
  const customOpen = customToggled ?? !isPaletteAccentColor(value)

  return (
    <div>
      <div className="grid grid-cols-6 gap-2 pt-1">
        {BUSINESS_ACCENT_PALETTE.map(({ name, hex }) => {
          const selected = value === hex
          const used = usedColors?.includes(hex)
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-shadow ${
                selected
                  ? 'ring-2 ring-ink ring-offset-2'
                  : 'hover:ring-2 hover:ring-border hover:ring-offset-2'
              }`}
              style={{ background: `#${hex}` }}
              title={used ? `${name} · en uso` : name}
              aria-label={used ? `${name} (en uso por otro negocio activo)` : name}
              aria-pressed={selected}
            >
              {selected && <Ico.check className="text-white" />}
              {used && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-ink" />
              )}
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => setCustomToggled(!customOpen)}
        className="mt-3 flex items-center gap-1 text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <Ico.chevronRight
          width={16}
          height={16}
          className={`transition-transform ${customOpen ? 'rotate-90' : ''}`}
        />
        Color personalizado
      </button>
      {customOpen && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className="h-9 w-9 shrink-0 rounded-full border border-border"
            style={{ background: `#${value}` }}
          />
          <input
            className="t-field"
            value={value}
            onChange={(e) => onChange(normalizeHexInput(e.target.value))}
            maxLength={7}
            pattern="[0-9a-f]{6}"
            placeholder="f97316"
            aria-label="Hex personalizado (6 dígitos, sin #)"
          />
        </div>
      )}
    </div>
  )
}
