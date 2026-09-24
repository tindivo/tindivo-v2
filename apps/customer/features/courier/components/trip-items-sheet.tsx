'use client'

import { COURIER_ITEM_DESCRIPTION_MAX } from '@tindivo/contracts'
import { BottomSheet, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { useCourierRequest } from '../hooks/use-courier-request'
import { useCourierStatus } from '../hooks/use-courier-status'
import { formatCourierPrice, formatReadyIn, getUtmSource } from '../lib/format'
import { useCourierStore } from '../lib/store'

const READY_OPTIONS = [0, 10, 20, 30]

/**
 * Categorías: solo UI, rellenan `itemDescription` (no hay campo de categoría
 * en el contrato — `packages/contracts/src/courier.ts` no lo tiene, y no
 * hacía falta inventarlo para esto). Si la persona ya escribió algo, elegir
 * una categoría no lo pisa.
 */
const CATEGORIES = [
  { id: 'papeles', label: 'Papeles', icon: 'description', preset: 'Papeles' },
  { id: 'comida', label: 'Comida', icon: 'restaurant', preset: 'Comida' },
  { id: 'medicinas', label: 'Medicinas', icon: 'medication', preset: 'Medicinas' },
] as const

/** ¿Qué llevamos? (imágenes 8/9) — termina en el botón que dispara el pedido. */
export function TripItemsSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'trip-items')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const goTo = useCourierStore((s) => s.goTo)
  const { draft, updateDraft, submitting, error, submit } = useCourierRequest()
  const { status } = useCourierStatus()

  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['id'] | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)

  const ready = draft.itemDescription.trim().length > 0 && draft.weightConfirmed

  function pickCategory(c: (typeof CATEGORIES)[number]) {
    setCategory(c.id)
    if (!draft.itemDescription.trim()) updateDraft({ itemDescription: c.preset })
  }

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Qué llevamos" scrim={false}>
      <div className="flex max-h-[85dvh] flex-col overflow-y-auto px-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goTo('trip-payer')}
            aria-label="Volver"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="arrow_back" size={22} className="text-[#2E3236]" />
          </button>
          <div className="text-[22px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            ¿Qué llevamos?
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="Cerrar"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F4F2]"
          >
            <Icon name="close" size={22} className="text-[#2E3236]" />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          {CATEGORIES.map((c) => {
            const active = category === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c)}
                className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-bold ${
                  active
                    ? 'bg-[#FFEDD5] text-brand-dark shadow-[inset_0_0_0_2px_#F97316]'
                    : 'bg-[#F4F4F2] text-[#2E3236]'
                }`}
              >
                <Icon name={active ? 'check' : c.icon} size={16} filled={active} />
                {c.label}
              </button>
            )
          })}
        </div>

        <div className="mb-1 flex flex-col gap-1 rounded-2xl bg-[#F4F4F2] p-3.5">
          <span className="text-[12px] font-semibold text-[#5C6368]">Descripción</span>
          <input
            type="text"
            value={draft.itemDescription}
            maxLength={COURIER_ITEM_DESCRIPTION_MAX}
            onChange={(e) => updateDraft({ itemDescription: e.target.value })}
            placeholder="Ej.: Un sobre con papeles"
            className="w-full border-0 bg-transparent text-[16px] font-semibold text-[#2E3236] outline-none"
          />
        </div>
        <div className="mb-3 flex justify-between px-1 text-[12px] font-medium text-[#5C6368]">
          <span>Máx. 5 kg · sin foto</span>
          <span className="font-mono">
            {draft.itemDescription.length}/{COURIER_ITEM_DESCRIPTION_MAX}
          </span>
        </div>

        <label className="mb-3 flex items-center gap-3 rounded-2xl bg-[#F4F4F2] px-3.5 py-2">
          <Icon name="package_2" size={24} className="text-[#2E3236]" />
          <span className="flex-grow">
            <span className="block text-[16px] font-bold text-[#2E3236]">Es frágil</span>
            <span className="block text-[13px] font-medium text-[#5C6368]">
              El motorizado confirma si puede.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Es frágil"
            aria-checked={draft.isFragile}
            checked={draft.isFragile}
            onChange={(e) => updateDraft({ isFragile: e.target.checked })}
            className="h-6 w-11 shrink-0 accent-brand"
          />
        </label>

        <div className="mb-1 text-[18px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
          ¿Cuándo estará listo?
        </div>
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {READY_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => updateDraft({ readyInMin: min })}
              className={`h-11 shrink-0 rounded-full px-4 text-[14px] font-bold ${
                draft.readyInMin === min
                  ? 'bg-[#FFEDD5] text-brand-dark shadow-[inset_0_0_0_2px_#F97316]'
                  : 'bg-[#F4F4F2] text-[#2E3236]'
              }`}
            >
              {formatReadyIn(min)}
            </button>
          ))}
        </div>

        <label className="mb-1 flex items-start gap-3 rounded-[18px] border-[1.5px] border-[#E8E9EB] bg-white p-3.5">
          <input
            type="checkbox"
            checked={draft.weightConfirmed}
            onChange={(e) =>
              updateDraft({ weightConfirmed: e.target.checked, prepaidConfirmed: e.target.checked })
            }
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span className="text-[14px] font-semibold leading-snug text-[#2E3236]">
            Lo que envío está permitido. Máx. 5 kg.{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                setInfoOpen(true)
              }}
              className="font-bold text-brand-dark underline underline-offset-2"
            >
              Ver qué se puede llevar
            </button>
          </span>
        </label>

        {error && <p className="mb-3 mt-2 text-[13px] font-semibold text-[#DC2626]">{error}</p>}

        <button
          type="button"
          disabled={!ready || submitting}
          onClick={() => submit(getUtmSource())}
          className={`mt-3 flex h-16 w-full flex-col items-center justify-center rounded-full ${
            ready && !submitting
              ? 'bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]'
              : 'bg-[#E8E9EB] text-[#5C6368]'
          }`}
        >
          <span className="flex items-center gap-2 text-[18px] font-extrabold tracking-[-0.01em]">
            <Icon name="two_wheeler" size={22} filled={ready} />
            {submitting ? 'Enviando…' : `Pedir entrega · ${formatCourierPrice(status.price)}`}
          </span>
          {!ready && <span className="text-[13px] font-bold">Marca que es permitido</span>}
        </button>
      </div>

      <BottomSheet open={infoOpen} onClose={() => setInfoOpen(false)} label="Qué se puede llevar">
        <div className="flex flex-col gap-3 px-4 pb-6">
          <div className="text-[20px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
            Qué se puede llevar
          </div>
          <p className="text-[15px] leading-relaxed text-[#5C6368]">
            Hasta 5 kg, sin foto. Sin alcohol, sin nada que necesite receta especial ni
            refrigeración. El motorizado puede rechazar el encargo si al recoger no cumple esto.
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
    </BottomSheet>
  )
}
