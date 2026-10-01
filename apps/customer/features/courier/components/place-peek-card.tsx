'use client'

import { LANDMARK_CATEGORY_LABEL, type Landmark } from '@tindivo/map'
import { Icon } from '@tindivo/ui'
import { placeAsOrigin } from '../lib/places'
import { useCourierStore } from '../lib/store'
import { PlaceBadge } from './place-badge'

/**
 * La ficha que sube al tocar un lugar en el mapa de `/entregas`. Anclada abajo
 * y sin velo: el mapa sigue a la vista detrás, para poder tocar otro lugar.
 */
export function PlacePeekCard({ place, onClose }: { place: Landmark; onClose: () => void }) {
  const openForBusiness = useCourierStore((s) => s.openForBusiness)

  return (
    <div
      role="dialog"
      aria-label={place.name}
      className="fixed inset-x-4 bottom-4 z-30 flex flex-col gap-3.5 rounded-[24px] bg-white p-4 shadow-[0_12px_40px_-10px_rgba(46,50,54,.35)] animate-[t-slide-up_280ms_cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="flex items-center gap-3">
        <PlaceBadge category={place.category} size={52} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
            {place.name}
          </div>
          <div className="truncate text-[14px] font-medium text-[#5C6368]">
            {LANDMARK_CATEGORY_LABEL[place.category]}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4F4F2] text-[#2E3236]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => openForBusiness(placeAsOrigin(place))}
        className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(150deg,#4F8BFF,#1D4ED8)] text-[16px] font-extrabold text-white"
      >
        <Icon name="two_wheeler" size={20} filled />
        Recoger aquí
      </button>
    </div>
  )
}
