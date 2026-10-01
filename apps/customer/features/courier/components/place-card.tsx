'use client'

import { LANDMARK_CATEGORY_LABEL, type Landmark } from '@tindivo/map'
import { Icon } from '@tindivo/ui'
import { placeAsOrigin } from '../lib/places'
import { useCourierStore } from '../lib/store'
import { PlaceBadge } from './place-badge'

/**
 * Un lugar del pueblo en la lista de `/entregas`: la chapa de su categoría, su
 * nombre y «Recoger aquí», que abre el pedido con ese punto ya puesto como
 * recojo (el destino lo elige la persona después, como desde un negocio).
 */
export function PlaceCard({ place }: { place: Landmark }) {
  const openForBusiness = useCourierStore((s) => s.openForBusiness)

  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-white p-3 shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)]">
      <PlaceBadge category={place.category} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-bold tracking-[-0.01em] text-[#2E3236]">
          {place.name}
        </div>
        <div className="truncate text-[13px] font-medium text-[#5C6368]">
          {LANDMARK_CATEGORY_LABEL[place.category]}
        </div>
      </div>
      <button
        type="button"
        onClick={() => openForBusiness(placeAsOrigin(place))}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[#EEF3FF] px-3.5 text-[14px] font-extrabold text-[#1D4ED8] transition-transform active:scale-95"
      >
        <Icon name="two_wheeler" size={18} filled />
        Recoger aquí
      </button>
    </div>
  )
}
