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
 * La tarjeta de un negocio del directorio (spec v1 §3.1): tres estados
 * excluyentes (aliado / recojo habilitado / solo visible) + el badge "Con
 * carta" independiente. La usan `Directorio-lista` y la hoja que abre un pin
 * en `Directorio-mapa` — dos consumidores reales, de ahí la extracción.
 */
export function DirectoryBusinessCard({ business }: { business: DirectoryBusiness }) {
  const openForBusiness = useCourierStore((s) => s.openForBusiness)
  const state = directoryCardStateOf(business)
  const hours =
    business.opensAt && business.closesAt ? `${business.opensAt}–${business.closesAt}` : null

  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border border-[#2E3236]/[0.06] bg-white p-4 shadow-[0_1px_2px_rgba(46,50,54,.05),0_6px_20px_rgba(46,50,54,.06)]">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[24px] font-extrabold ${
            state === 'partner' ? 'bg-brand text-white' : 'bg-[#F4F4F2] text-[#2E3236]'
          }`}
        >
          {business.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
              {business.name}
            </span>
            {state === 'partner' && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[12px] font-bold text-brand-dark">
                <Icon name="star" size={13} filled className="text-brand" />
                Aliado
              </span>
            )}
            {business.hasMenuInTindivo && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[12px] font-bold text-brand-dark">
                Con carta
              </span>
            )}
          </div>
          <div className="truncate text-[14px] font-medium text-[#5C6368]">
            {DIRECTORY_CATEGORY_LABEL[business.category]}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#5C6368]">
          <Icon name="location_on" size={18} />
          <span className="truncate">
            {business.referenceText}
            {hours ? ` · ${hours}` : ''}
          </span>
        </div>
        {business.phone && (
          <div className="flex flex-wrap items-center gap-3 text-[15px] font-bold text-[#2E3236]">
            <span className="flex items-center gap-2">
              <Icon name="call" size={18} />
              <span className="font-mono">{business.phone}</span>
            </span>
            {business.whatsapp && (
              <span className="flex items-center gap-1 text-[12px] font-semibold text-[#5C6368]">
                <Icon name="chat" size={15} filled className="text-[#15803D]" />
                WhatsApp
              </span>
            )}
          </div>
        )}
      </div>

      {state === 'partner' ? (
        <button
          type="button"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[17px] font-extrabold text-white"
        >
          <Icon name="restaurant_menu" size={22} filled />
          Pedir en Tindivo
        </button>
      ) : (
        <div className="flex gap-2.5">
          {business.phone && (
            <a
              href={telLink(business.phone)}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#F4F4F2] text-[16px] font-extrabold text-[#2E3236]"
            >
              <Icon name="call" size={20} />
              Llamar
            </a>
          )}
          {business.courierEnabled && (
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
              className="flex h-14 flex-[1.7] flex-col items-center justify-center rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white"
            >
              <span className="flex items-center gap-1.5 text-[16px] font-extrabold">
                <Icon name="two_wheeler" size={20} filled />
                Pedir entrega
              </span>
              <span className="text-[12px] font-bold">Desde S/ 3</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
