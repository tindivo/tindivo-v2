'use client'

import type { CourierPayer } from '@tindivo/contracts'
import { BottomSheet, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { formatCourierPrice } from '../lib/format'

/**
 * ¿Quién paga? — pastilla de dos opciones (Pedir-4b/4c) + hoja de info que
 * explica la regla UNA VEZ con un dibujo, en vez de repetirla en cada pedido
 * (nota `s4c` del canvas de diseño).
 */
export function PayerField({
  payer,
  onChange,
  price,
}: {
  payer: CourierPayer
  onChange: (payer: CourierPayer) => void
  price: number
}) {
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
          ¿Quién paga?
        </div>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="¿Quién paga la entrega?"
          className="flex h-11 w-11 items-center justify-center"
        >
          <Icon name="info" size={22} className="text-[#5C6368]" />
        </button>
      </div>

      <div
        role="radiogroup"
        aria-label="Quién paga"
        className="flex rounded-full bg-[#2E3236]/[0.06] p-1"
      >
        {(
          [
            { value: 'origin', title: 'Quien entrega', subtitle: 'Al recoger' },
            { value: 'destination', title: 'Quien recibe', subtitle: 'Al entregar' },
          ] as const
        ).map((opt) => {
          const active = payer === opt.value
          return (
            <label
              key={opt.value}
              className={`relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full ${
                active ? 'bg-white shadow-[0_1px_3px_rgba(46,50,54,.18)]' : ''
              }`}
            >
              <input
                type="radio"
                name="courier-payer"
                className="absolute inset-0 m-0 h-full w-full opacity-0"
                checked={active}
                onChange={() => onChange(opt.value)}
              />
              <span
                className={`text-[15px] leading-tight ${active ? 'font-extrabold text-[#2E3236]' : 'font-bold text-[#5C6368]'}`}
              >
                {opt.title}
              </span>
              <span className="text-[12px] font-semibold text-[#5C6368]">{opt.subtitle}</span>
            </label>
          )
        })}
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-[#F4F4F2] px-3.5 py-2">
        <div className="flex-grow">
          <div className="text-[16px] font-bold text-[#2E3236]">Al motorizado</div>
          <div className="text-[13px] font-medium text-[#5C6368]">Efectivo exacto o Yape</div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-semibold text-[#5C6368]">Transporte</div>
          <div className="text-[17px] font-extrabold text-[#2E3236]">
            Desde {formatCourierPrice(price)}
          </div>
        </div>
      </div>

      <BottomSheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        label="¿Quién paga la entrega?"
      >
        <div className="flex flex-col gap-3 px-4 pb-6">
          <div className="text-[22px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
            ¿Quién paga la entrega?
          </div>
          <p className="text-[15px] leading-relaxed text-[#5C6368]">
            Tú eliges. Se le paga al motorizado: efectivo exacto o Yape. El artículo no cambia de
            manos hasta que se cobra el transporte.
          </p>
          <button
            type="button"
            onClick={() => setInfoOpen(false)}
            className="mt-2 h-14 w-full rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[18px] font-extrabold text-white"
          >
            Entendido
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
