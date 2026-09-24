'use client'

import { Icon } from '@tindivo/ui'
import { telLink } from '@/lib/whatsapp'
import {
  DIRECTORY_CATEGORY_LABEL,
  type DirectoryBusiness,
  directoryCardStateOf,
} from '../lib/directory'
import { useCourierStore } from '../lib/store'

/**
 * La ficha que abre un pin de `Directorio-mapa`. A propósito NO es
 * `BottomSheet`: ese primitivo pinta un scrim oscuro de pantalla completa que
 * taparía justo el mapa que esta pantalla existe para mostrar. Es una tarjeta
 * "peek" docked al fondo — se ve el negocio, se sigue viendo el mapa detrás.
 *
 * Un solo consumidor por ahora (Directorio-mapa): no sube a `packages/ui`.
 */
export function DirectoryPeekCard({
  business,
  onClose,
}: {
  business: DirectoryBusiness
  onClose: () => void
}) {
  const openForBusiness = useCourierStore((s) => s.openForBusiness)
  const state = directoryCardStateOf(business)

  return (
    <div
      role="dialog"
      aria-label={business.name}
      className="fixed inset-x-4 bottom-4 z-30 flex flex-col gap-3.5 rounded-[24px] bg-white p-4 shadow-[0_12px_40px_-10px_rgba(46,50,54,.35)] animate-[t-slide-up_280ms_cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[24px] font-extrabold ${
            state === 'partner' ? 'bg-brand text-white' : 'bg-[#F4F4F2] text-[#2E3236]'
          }`}
        >
          {business.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
            {business.name}
          </div>
          <div className="truncate text-[14px] font-medium text-[#5C6368]">
            {DIRECTORY_CATEGORY_LABEL[business.category]}
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

      {state === 'courier_enabled' && business.courierEnabled ? (
        <button
          type="button"
          onClick={() =>
            openForBusiness({
              id: business.id,
              name: business.name,
              lat: business.lat,
              lng: business.lng,
              referenceText: business.referenceText,
              phone: business.phone,
            })
          }
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[16px] font-extrabold text-white"
        >
          <Icon name="two_wheeler" size={20} filled />
          Pedir entrega
        </button>
      ) : state === 'partner' ? (
        <button
          type="button"
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[16px] font-extrabold text-white"
        >
          <Icon name="restaurant_menu" size={20} filled />
          Pedir en Tindivo
        </button>
      ) : (
        business.phone && (
          <a
            href={telLink(business.phone)}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#F4F4F2] text-[15px] font-extrabold text-[#2E3236]"
          >
            <Icon name="call" size={18} />
            Llamar
          </a>
        )
      )}
    </div>
  )
}
