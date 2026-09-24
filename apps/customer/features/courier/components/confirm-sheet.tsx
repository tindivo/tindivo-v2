'use client'

import { BottomSheet, Icon } from '@tindivo/ui'
import { haversineKm } from '@/lib/coverage'
import { useCourierRequest } from '../hooks/use-courier-request'
import { useCourierStatus } from '../hooks/use-courier-status'
import { formatDistance, formatReadyIn, getUtmSource } from '../lib/format'
import { useCourierStore } from '../lib/store'
import { PayerField } from './payer-field'
import { PointField } from './point-field'

const READY_OPTIONS = [0, 10, 20, 30]

/** Main / Pedir-3b · Qué llevamos: resumen y envío cuando el origen es un negocio del directorio. */
export function ConfirmSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'confirm')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const goTo = useCourierStore((s) => s.goTo)
  const { draft, updateDraft, updatePoint, submitting, error, submit } = useCourierRequest()
  const { status } = useCourierStatus()

  const ready = draft.destination.coordinates != null && draft.weightConfirmed

  const distanceKm =
    draft.origin.coordinates && draft.destination.coordinates
      ? haversineKm(draft.origin.coordinates, draft.destination.coordinates)
      : null

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Qué llevamos" scrim={false}>
      <div className="flex max-h-[85dvh] flex-col overflow-y-auto px-4 pb-6">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[24px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            Qué llevamos
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

        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-brand shadow-[inset_0_1px_0_rgba(255,255,255,.22)]">
            <Icon name="two_wheeler" size={25} filled className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-[21px] font-extrabold tracking-[-0.025em] text-[#2E3236]">
              Tindivo Entregas
            </div>
            <div className="text-[13px] font-medium text-[#5C6368]">
              Recogemos lo que ya pagaste y lo llevamos
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-col gap-0 overflow-hidden rounded-[18px] bg-[#F4F4F2]">
          <div className="flex items-center gap-3 px-3.5 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
              <Icon name="storefront" size={20} filled className="text-[#6B7075]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-[#5C6368]">Recogemos en</div>
              <div className="truncate text-[16px] font-bold text-[#2E3236]">
                {draft.origin.contactName}
              </div>
            </div>
            {distanceKm != null && (
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-[#5C6368]">
                {formatDistance(distanceKm * 1000)}
              </span>
            )}
            <button
              type="button"
              onClick={() => goTo('route')}
              className="shrink-0 text-[14px] font-bold text-brand-dark"
            >
              Cambiar
            </button>
          </div>
        </div>

        <div className="mb-3">
          <PointField
            which="destination"
            label="Llevamos a"
            icon="home"
            point={draft.destination}
            onChange={(patch) => updatePoint('destination', patch)}
            contactLabel="A nombre de quién recibe"
          />
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-[18px] bg-[#F4F4F2] px-3.5 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
            <Icon name="schedule" size={20} filled className="text-[#2E3236]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-[#5C6368]">Recogida</div>
            <div className="text-[16px] font-bold text-[#2E3236]">
              Listo en {formatReadyIn(draft.readyInMin)}
            </div>
          </div>
          <div className="flex gap-1.5">
            {READY_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => updateDraft({ readyInMin: min })}
                className={`h-9 rounded-full px-3 text-[13px] font-bold ${
                  draft.readyInMin === min
                    ? 'bg-[#FFEDD5] text-brand-dark shadow-[inset_0_0_0_2px_#F97316]'
                    : 'bg-white text-[#2E3236]'
                }`}
              >
                {formatReadyIn(min)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <PayerField
            payer={draft.payer}
            onChange={(payer) => updateDraft({ payer })}
            price={status.price}
          />
        </div>

        <label className="mb-3 flex gap-3.5 rounded-[18px] border-[1.5px] border-[#D5D7DA] bg-white p-3.5">
          <input
            type="checkbox"
            checked={draft.weightConfirmed && draft.prepaidConfirmed}
            onChange={(e) =>
              updateDraft({ weightConfirmed: e.target.checked, prepaidConfirmed: e.target.checked })
            }
            className="mt-0.5 h-6 w-6 shrink-0 accent-brand"
          />
          <span>
            <span className="block text-[17px] font-extrabold tracking-[-0.01em] text-[#2E3236]">
              Ya pagué mi pedido
            </span>
            <span className="mt-0.5 block text-[13px] font-medium leading-snug text-[#5C6368]">
              Solo recogemos y llevamos: no compramos por ti. El producto es responsabilidad del
              negocio.
            </span>
          </span>
        </label>

        {error && <p className="mb-3 text-[13px] font-semibold text-[#DC2626]">{error}</p>}

        <button
          type="button"
          disabled={!ready || submitting}
          onClick={() => submit(getUtmSource())}
          className={`flex h-[60px] w-full flex-col items-center justify-center rounded-full ${
            ready && !submitting
              ? 'bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]'
              : 'bg-[#E8E9EB] text-[#5C6368]'
          }`}
        >
          <span className="flex items-center gap-2 text-[18px] font-extrabold tracking-[-0.01em]">
            <Icon name="two_wheeler" size={22} filled={ready} />
            {submitting ? 'Enviando…' : 'Pedir entrega'}
          </span>
          {!ready && <span className="text-[13px] font-bold">Confirma que ya pagaste</span>}
        </button>
      </div>
    </BottomSheet>
  )
}
