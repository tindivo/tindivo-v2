'use client'

import type { CourierStatus } from '@tindivo/contracts'
import { BottomSheet, Icon, Spinner } from '@tindivo/ui'
import { useCourierTracking } from '../hooks/use-courier-tracking'
import { formatCourierPrice } from '../lib/format'
import { useCourierStore } from '../lib/store'

const STEPS: { key: string; label: string; statuses: CourierStatus[] }[] = [
  { key: 'requested', label: 'Pedido', statuses: ['requested'] },
  {
    key: 'confirmed',
    label: 'Confirmado',
    statuses: ['accepted', 'heading_to_pickup', 'at_pickup'],
  },
  { key: 'picked_up', label: 'Recogido', statuses: ['picked_up'] },
  { key: 'on_the_way', label: 'En camino', statuses: ['heading_to_dropoff'] },
  { key: 'delivered', label: 'Entregado', statuses: ['delivered'] },
]

function stepIndexFor(status: CourierStatus): number {
  const idx = STEPS.findIndex((s) => s.statuses.includes(status))
  return idx === -1 ? 0 : idx
}

const CANCEL_REASON_LABEL: Record<string, string> = {
  no_driver: 'No hubo motorizado disponible.',
  driver_rejected: 'El motorizado no pudo tomar esta entrega.',
  not_ready: 'El pedido no estuvo listo a tiempo.',
  transport_unpaid: 'No se pudo cobrar el transporte.',
  customer_cancelled: 'Cancelaste esta entrega.',
  unreachable: 'No pudimos contactar a quien recibe.',
  other: 'Esta entrega se canceló.',
}

/** Seguir-1/2/3 · Buscando / Confirmado / Entregado, unificados por estado. */
export function TrackingSheet() {
  const open = useCourierStore((s) => s.open && s.step === 'tracking')
  const closeSheet = useCourierStore((s) => s.closeSheet)
  const shortId = useCourierStore((s) => s.trackingShortId)
  const { data, cancelling, cancel } = useCourierTracking(shortId ?? '', open)

  if (!open || !shortId) return null

  const status = data?.status
  const stepIdx = status ? stepIndexFor(status) : 0

  return (
    <BottomSheet open={open} onClose={closeSheet} label="Seguimiento de tu entrega" scrim={false}>
      <div className="flex max-h-[85dvh] flex-col overflow-y-auto px-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[24px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
            {status === 'delivered'
              ? 'Entregado'
              : status === 'cancelled'
                ? 'Cancelado'
                : status === 'requested'
                  ? 'Buscando motorizado'
                  : 'Confirmado'}
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

        {!data ? (
          <div className="flex justify-center py-10">
            <Spinner size="md" variant="brand" />
          </div>
        ) : status === 'cancelled' ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDECEC]">
              <Icon name="block" size={28} filled className="text-[#DC2626]" />
            </div>
            <p className="text-[16px] font-semibold text-[#2E3236]">
              {CANCEL_REASON_LABEL[data.cancelReason ?? 'other']}
            </p>
            <button
              type="button"
              onClick={closeSheet}
              className="mt-2 h-12 rounded-full bg-[#F4F4F2] px-6 text-[15px] font-bold text-[#2E3236]"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {status === 'requested' && (
              <p className="mb-4 text-[14px] font-medium text-[#5C6368]">
                Avisamos a los motorizados disponibles. Si nadie la toma en 15 minutos, se cancela
                sola y no se cobra nada.
              </p>
            )}

            {data.driverName && status !== 'requested' && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[#F4F4F2] p-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
                  <Icon name="two_wheeler" size={22} filled className="text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-bold text-[#2E3236]">{data.driverName}</div>
                  <div className="text-[13px] font-medium text-[#5C6368]">
                    Motorizado de Tindivo
                  </div>
                </div>
              </div>
            )}

            <div className="mb-5 flex">
              {STEPS.map((step, i) => (
                <div key={step.key} className="relative flex flex-1 flex-col items-center gap-1.5">
                  {i > 0 && (
                    <div
                      className={`absolute top-[11px] right-1/2 h-0.5 w-full ${
                        i <= stepIdx ? 'bg-brand' : 'bg-[#E8E9EB]'
                      }`}
                    />
                  )}
                  <div
                    className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${
                      i < stepIdx
                        ? 'bg-brand'
                        : i === stepIdx
                          ? 'border-[2.5px] border-brand bg-white'
                          : 'border-2 border-[#E8E9EB] bg-[#F4F4F2]'
                    }`}
                  >
                    {i < stepIdx && <Icon name="check" size={16} className="text-white" />}
                    {i === stepIdx && status !== 'delivered' && (
                      <span className="h-2 w-2 rounded-full bg-brand" />
                    )}
                  </div>
                  <span
                    className={`text-center text-[12px] ${
                      i === stepIdx ? 'font-bold text-[#2E3236]' : 'font-semibold text-[#5C6368]'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#F4F4F2] px-3.5 py-2.5 text-[13px] font-medium text-[#5C6368]">
              <span>{data.itemDescription}</span>
              <span className="font-extrabold text-[#2E3236]">
                {formatCourierPrice(data.feeAmount)}
              </span>
            </div>

            {status === 'requested' && (
              <button
                type="button"
                onClick={cancel}
                disabled={cancelling}
                className="h-12 w-full rounded-full bg-[#FDECEC] text-[15px] font-bold text-[#B91C1C]"
              >
                {cancelling ? 'Cancelando…' : 'Cancelar solicitud'}
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  )
}
