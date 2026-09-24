'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { useCourierRequest } from '../hooks/use-courier-request'
import { useCourierStatus } from '../hooks/use-courier-status'
import { useCourierStore } from '../lib/store'
import { PayerField } from './payer-field'

/** Paso corto y dedicado para "¿Quién paga?" — entre `trip-details` y `trip-items`. */
export function TripPayerSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'trip-payer')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const goTo = useCourierStore((s) => s.goTo)
  const { draft, updateDraft } = useCourierRequest()
  const { status } = useCourierStatus()

  return (
    <BottomSheet open={open} onClose={closeSheet} label="¿Quién paga?" scrim={false}>
      <div className="flex flex-col px-4 pb-6">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goTo('trip-details')}
            aria-label="Volver"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
          </button>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="close" size={22} className="text-[#2E3236]" />
          </button>
        </div>

        <PayerField
          payer={draft.payer}
          onChange={(payer) => updateDraft({ payer })}
          price={status.price}
        />

        <button
          type="button"
          onClick={() => goTo('trip-items')}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[16px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]"
        >
          Continuar
        </button>
      </div>
    </BottomSheet>
  )
}
