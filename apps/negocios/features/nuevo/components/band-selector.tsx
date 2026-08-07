'use client'

import { Icon } from '@tindivo/ui'
import type { DistanceBand } from '../hooks/use-create-order'

/**
 * Selector de zona de entrega. Decide el ENVÍO QUE PAGA EL CLIENTE.
 *
 * OJO CON EL COPY: el precedente del v1 (`confirm-pickup-modal.tsx`) decía
 * "sirve para calcular la comisión del restaurante". Aquí sería falso — eso lo
 * elegía el motorizado y afectaba a la comisión de Tindivo. Lo que elige la
 * cajera en esta pantalla es cuánto le cobra al cliente por el envío.
 *
 * SIN PRESELECCIÓN, a propósito. Ninguno de los dos arranca activo, y el
 * formulario no deja enviar hasta que haya uno. Un default a "Cerca" cobraría
 * de menos cada entrega lejana sin que nadie se entere, que es exactamente el
 * problema que venía arrastrando el pedido manual antes de la 0126.
 *
 * Azul (`--color-info`) y no naranja de marca: el selector de tiempo de
 * preparación, dos tarjetas más arriba, usa `bg-ink` para su activo y la marca
 * para el CTA. Un acento distinto evita que la cajera confunda las dos
 * decisiones cuando va rápido.
 */
export function BandSelector({
  value,
  onChange,
  nearFee,
  farFee,
}: {
  value: DistanceBand | null
  onChange: (band: DistanceBand) => void
  /** `null` mientras carga o si falló: el botón se muestra sin monto. */
  nearFee: number | null
  farFee: number | null
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        ¿A qué zona es la entrega?
      </div>

      <div className="grid grid-cols-2 gap-2">
        <BandButton
          band="near"
          label="Cerca"
          zones="San Jacinto (zona regular)"
          icon="near_me"
          ariaLabel="Entrega cerca"
          fee={nearFee}
          selected={value === 'near'}
          onSelect={onChange}
        />
        <BandButton
          band="far"
          label="Lejos"
          zones="San Francisco de la Losa (arriba), San Cristóbal, Cocharcas"
          icon="route"
          ariaLabel="Entrega lejos"
          fee={farFee}
          selected={value === 'far'}
          onSelect={onChange}
        />
      </div>

      <p className="mt-2.5 text-xs text-ink-muted">
        {value === null
          ? 'Elige la zona para calcular el envío'
          : 'Esto define cuánto paga el cliente por el envío'}
      </p>
    </div>
  )
}

function BandButton({
  band,
  label,
  zones,
  icon,
  ariaLabel,
  fee,
  selected,
  onSelect,
}: {
  band: DistanceBand
  label: string
  zones: string
  icon: string
  ariaLabel: string
  fee: number | null
  selected: boolean
  onSelect: (band: DistanceBand) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(band)}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`flex flex-col items-center justify-start gap-1 rounded-xl border p-3 text-center transition-all active:scale-[0.97] ${
        selected
          ? 'border-info bg-info text-white shadow-elev-2'
          : 'border-border bg-card text-ink hover:bg-surface'
      }`}
    >
      <Icon name={icon} size={20} filled={selected} />
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
      {/* `tabular-nums` mantiene el ancho estable entre 2.00 y 2.50: sin esto,
          los botones bailan al alternar la selección. */}
      {fee !== null && (
        <span className="font-mono text-sm font-black tabular-nums">S/ {fee.toFixed(2)}</span>
      )}
      <span
        className={`text-[11px] leading-tight ${selected ? 'text-white/85' : 'text-ink-muted'}`}
      >
        {zones}
      </span>
    </button>
  )
}
