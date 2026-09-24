'use client'

import { Icon } from '@tindivo/ui'
import { useCourierStore } from '../lib/store'
import type { CourierEditingPoint, CourierPoint } from '../types'

/**
 * Un punto A o B: fila-resumen del punto ya fijado (o placeholder) + datos de
 * contacto. Fijar el punto en sí ya no pasa aquí — toca "Elegir en el mapa" y
 * abre `CourierMapHost`/`PinDropOverlay` a pantalla completa (Pedir-2), que es
 * quien de verdad resuelve el gesto de mapa+GPS.
 */
export function PointField({
  which,
  label,
  icon,
  point,
  onChange,
  showContact = true,
  contactLabel = 'Nombre',
}: {
  which: CourierEditingPoint
  label: string
  icon: string
  point: CourierPoint
  onChange: (patch: Partial<CourierPoint>) => void
  showContact?: boolean
  contactLabel?: string
}) {
  const beginEditPoint = useCourierStore((s) => s.beginEditPoint)
  const hasPoint = point.coordinates != null

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-[#F4F4F2] p-3">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-[#5C6368]">
        <Icon name={icon} size={16} />
        {label}
      </div>

      <button
        type="button"
        onClick={() => beginEditPoint(which)}
        className="flex w-full items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left"
      >
        <Icon
          name="location_on"
          size={18}
          filled={hasPoint}
          className={hasPoint ? 'text-success' : 'text-brand-dark'}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-[#2E3236]">
            {point.referenceText || (hasPoint ? 'Punto marcado en el mapa' : 'Sin marcar todavía')}
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-bold text-brand-dark">
          {hasPoint ? 'Cambiar' : 'Elegir en el mapa'}
        </span>
      </button>

      {showContact && (
        <div className="flex gap-2">
          <input
            type="text"
            value={point.contactName}
            onChange={(e) => onChange({ contactName: e.target.value })}
            placeholder={contactLabel}
            className="min-w-0 flex-1 rounded-xl border border-transparent bg-white px-3 py-2 font-sans text-[14px] text-[#2E3236] outline-none focus:border-brand/40"
          />
          <input
            type="tel"
            inputMode="tel"
            value={point.contactPhone}
            onChange={(e) => onChange({ contactPhone: e.target.value })}
            placeholder="Celular"
            className="w-[130px] rounded-xl border border-transparent bg-white px-3 py-2 font-sans text-[14px] text-[#2E3236] outline-none focus:border-brand/40"
          />
        </div>
      )}
    </div>
  )
}
