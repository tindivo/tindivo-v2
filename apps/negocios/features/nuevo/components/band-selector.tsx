'use client'

import { Icon } from '@tindivo/ui'
import type { DistanceBand } from '../hooks/use-create-order'

/**
 * Selector de zona de entrega. Va AL FINAL del formulario y NO MUESTRA PRECIOS.
 *
 * Las dos cosas son la misma decisión, tomada en la 0129. Desde que la cajera
 * teclea el TOTAL con envío incluido, la zona ya no cambia lo que paga el
 * cliente: cambia cómo se reparte ese total entre comida y envío, que es un
 * asunto interno del ledger. Poner "S/ 2.00" y "S/ 2.50" en los botones
 * invitaría a sumarlos otra vez al monto —justo el hábito que la 0129 vino a
 * corregir— y a preguntarse por qué el total no se mueve al cambiar de zona.
 *
 * OJO CON EL COPY: el precedente del v1 (`confirm-pickup-modal.tsx`) decía
 * "sirve para calcular la comisión del restaurante". Aquí sería falso — eso lo
 * elegía el motorizado y afectaba a la comisión de Tindivo. Y "define cuánto
 * paga el cliente por el envío", que es lo que decía esta pantalla antes de la
 * 0129, también dejó de ser cierto. Lo que hoy define es a dónde va el pedido.
 *
 * SIN PRESELECCIÓN, a propósito. Ninguno de los dos arranca activo, y el
 * formulario no deja enviar hasta que haya uno. Un default a "Cerca" registraría
 * cada entrega lejana como cercana sin que nadie se entere, que es exactamente
 * el problema que venía arrastrando el pedido manual antes de la 0126.
 *
 * Azul (`--color-info`) y no naranja de marca: el selector de tiempo de
 * preparación, arriba del todo, usa `bg-ink` para su activo y la marca para el
 * CTA. Un acento distinto evita que la cajera confunda las dos decisiones
 * cuando va rápido.
 */
export function BandSelector({
  value,
  onChange,
}: {
  value: DistanceBand | null
  onChange: (band: DistanceBand) => void
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
          selected={value === 'near'}
          onSelect={onChange}
        />
        <BandButton
          band="far"
          label="Lejos"
          zones="San Francisco de la Losa (arriba), San Cristóbal, Cocharcas"
          icon="route"
          ariaLabel="Entrega lejos"
          selected={value === 'far'}
          onSelect={onChange}
        />
      </div>

      <p className="mt-2.5 text-xs text-ink-muted">
        {value === null
          ? 'Elige la zona para terminar'
          : 'El cliente paga el total de arriba, vayas donde vayas'}
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
  selected,
  onSelect,
}: {
  band: DistanceBand
  label: string
  zones: string
  icon: string
  ariaLabel: string
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
      <span
        className={`text-[11px] leading-tight ${selected ? 'text-white/85' : 'text-ink-muted'}`}
      >
        {zones}
      </span>
    </button>
  )
}
