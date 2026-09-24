'use client'

import { BottomSheet, Icon, useDialogFocus } from '@tindivo/ui'
import { useRef, useState } from 'react'
import { useCourierRequest } from '../hooks/use-courier-request'
import { isValidPePhone, missingPhoneDigits, stripPeCountryCode } from '../lib/phone'
import { useCourierStore } from '../lib/store'
import type { CourierEditingPoint, CourierPoint } from '../types'

/**
 * Dónde recogemos / Dónde entregamos (imagen 6): resumen de los dos puntos ya
 * fijados en `trip`, más el contacto de cada uno. Cambiar la UBICACIÓN pasa
 * por un popup de confirmación (invalida la referencia escrita); cambiar solo
 * el TEXTO o el contacto no, porque no invalida nada.
 */
export function TripDetailsSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'trip-details')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const goTo = useCourierStore((s) => s.goTo)
  const beginChangePoint = useCourierStore((s) => s.beginChangePoint)
  const { draft, updatePoint, identity } = useCourierRequest()

  const [confirmChange, setConfirmChange] = useState<CourierEditingPoint | null>(null)

  const originReady =
    draft.origin.contactName.trim().length > 0 && isValidPePhone(draft.origin.contactPhone)
  const destinationReady =
    draft.destination.contactName.trim().length > 0 &&
    isValidPePhone(draft.destination.contactPhone)
  const ready = originReady && destinationReady

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Confirma tu pedido" scrim={false}>
      <div className="flex max-h-[85dvh] flex-col overflow-y-auto px-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[24px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            Confirma tu pedido
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

        <PointCard
          which="origin"
          title="Dónde recogemos"
          point={draft.origin}
          contactLabel="Quien entrega"
          onChangeLocation={() => setConfirmChange('origin')}
          onChangeContact={(patch) => updatePoint('origin', patch)}
          myPhoneChip={
            identity?.phone
              ? {
                  active: draft.origin.contactPhone === stripPeCountryCode(identity.phone),
                  onClick: () =>
                    updatePoint('origin', { contactPhone: stripPeCountryCode(identity.phone) }),
                }
              : undefined
          }
        />

        <div className="mt-3">
          <PointCard
            which="destination"
            title="Dónde entregamos"
            point={draft.destination}
            contactLabel="Recibe"
            onChangeLocation={() => setConfirmChange('destination')}
            onChangeContact={(patch) => updatePoint('destination', patch)}
            onUseMyIdentity={
              identity?.userId
                ? () =>
                    updatePoint('destination', {
                      contactName: identity.name || 'Yo',
                      contactPhone: stripPeCountryCode(identity.phone),
                    })
                : undefined
            }
          />
        </div>

        <button
          type="button"
          disabled={!ready}
          onClick={() => goTo('trip-payer')}
          className={`mt-4 flex h-14 w-full items-center justify-center rounded-full font-extrabold text-[16px] ${
            ready
              ? 'bg-[linear-gradient(135deg,#F97316,#FB923C)] text-white shadow-[0_10px_24px_-10px_rgba(234,88,12,.55)]'
              : 'bg-[#E8E9EB] text-[#5C6368]'
          }`}
        >
          Continuar
        </button>
      </div>

      {confirmChange && (
        <ChangeLocationConfirm
          onCancel={() => setConfirmChange(null)}
          onConfirm={() => {
            beginChangePoint(confirmChange)
            setConfirmChange(null)
          }}
        />
      )}
    </BottomSheet>
  )
}

function PointCard({
  which,
  title,
  point,
  contactLabel,
  onChangeLocation,
  onChangeContact,
  onUseMyIdentity,
  myPhoneChip,
}: {
  which: CourierEditingPoint
  title: string
  point: CourierPoint
  contactLabel: string
  onChangeLocation: () => void
  onChangeContact: (patch: Partial<CourierPoint>) => void
  onUseMyIdentity?: () => void
  myPhoneChip?: { active: boolean; onClick: () => void }
}) {
  const missing = missingPhoneDigits(point.contactPhone)
  const dotColor = which === 'origin' ? 'bg-brand' : 'bg-[#2E3236]'

  return (
    <div className="flex flex-col gap-2.5 rounded-[22px] bg-[#F4F4F2] p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
          <span className="text-[17px] font-extrabold tracking-[-0.01em] text-[#2E3236]">
            {title}
          </span>
        </div>
        {myPhoneChip && (
          <button
            type="button"
            onClick={myPhoneChip.onClick}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${
              myPhoneChip.active ? 'bg-white text-brand-dark' : 'bg-white/60 text-[#5C6368]'
            }`}
          >
            <Icon name="person" size={14} filled={myPhoneChip.active} />
            Es mío
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="location_on" size={18} filled className="text-[#6B7075]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">Ubicación</div>
          <div className="text-[15px] font-bold text-[#2E3236]">Punto en el mapa</div>
        </div>
        <button
          type="button"
          onClick={onChangeLocation}
          className="text-[13px] font-bold text-brand-dark"
        >
          Cambiar
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="edit_location_alt" size={18} className="mt-0.5 text-[#6B7075]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">Dirección y referencia</div>
          <input
            type="text"
            value={point.referenceText}
            onChange={(e) => onChangeContact({ referenceText: e.target.value })}
            className="w-full border-0 bg-transparent text-[14px] font-semibold text-[#2E3236] outline-none"
          />
        </div>
        {point.referenceText.trim().length > 0 && (
          <Icon name="check_circle" size={18} filled className="mt-0.5 text-success" />
        )}
      </div>

      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5">
        <Icon name="badge" size={18} className="text-[#6B7075]" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#5C6368]">{contactLabel}</div>
          <input
            type="text"
            value={point.contactName}
            onChange={(e) => onChangeContact({ contactName: e.target.value })}
            placeholder={contactLabel}
            className="w-full border-0 bg-transparent text-[14px] font-semibold text-[#2E3236] outline-none"
          />
        </div>
        {point.contactName.trim().length > 0 && (
          <Icon name="check_circle" size={18} filled className="text-success" />
        )}
        {onUseMyIdentity && (
          <button
            type="button"
            onClick={onUseMyIdentity}
            className="shrink-0 text-[13px] font-bold text-brand-dark"
          >
            Yo
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-2xl bg-white px-3 py-2.5">
        <div className="flex items-center gap-3">
          <Icon name="call" size={18} className="text-[#6B7075]" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-[#5C6368]">Celular</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-semibold text-[#9AA0A6]">+51</span>
              <input
                type="tel"
                inputMode="tel"
                value={point.contactPhone}
                onChange={(e) =>
                  onChangeContact({ contactPhone: stripPeCountryCode(e.target.value) })
                }
                placeholder="987 654 321"
                className="w-full border-0 bg-transparent text-[14px] font-semibold text-[#2E3236] outline-none"
              />
            </div>
          </div>
        </div>
        {point.contactPhone.trim().length > 0 && missing > 0 && (
          <p className="pl-8 text-[12px] font-bold text-[#DC2626]">
            Faltan {missing} dígito{missing === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </div>
  )
}

function ChangeLocationConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  useDialogFocus(caja, { open: true, onClose: onCancel })

  return (
    <div
      ref={caja}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="true"
      aria-label="¿Cambiar la ubicación?"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/40 backdrop-blur-sm focus:outline-none sm:items-center"
    >
      <div className="w-full max-w-sm rounded-t-[28px] bg-white p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-elev-3 sm:rounded-[28px]">
        <div className="text-[19px] font-extrabold tracking-[-0.02em] text-[#2E3236]">
          ¿Estás seguro?
        </div>
        <p className="mt-1.5 text-[14px] leading-snug text-[#5C6368]">
          Tendrás que volver a escribir la referencia o dirección.
        </p>
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-13 flex-1 rounded-full bg-[#F4F4F2] text-[15px] font-extrabold text-[#2E3236]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-13 flex-1 rounded-full bg-[linear-gradient(135deg,#F97316,#FB923C)] text-[15px] font-extrabold text-white"
          >
            Sí, cambiar
          </button>
        </div>
      </div>
    </div>
  )
}
