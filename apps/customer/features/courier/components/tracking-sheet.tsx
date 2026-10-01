'use client'

import type { CourierStatus } from '@tindivo/contracts'
import { BottomSheet, Icon, Spinner } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { PushPermissionSheet } from '@/components/push-permission-sheet'
import { useActiveCourierOrdersStore } from '@/lib/active-courier-orders'
import { usePushOffer } from '@/lib/use-push-offer'
import { useCourierTracking } from '../hooks/use-courier-tracking'
import { formatCourierPrice } from '../lib/format'
import { useCourierStore } from '../lib/store'
import { AcceptCountdown } from './accept-countdown'

/**
 * Cuatro pasos y no cinco: «Recogido» y «En camino» eran dos bolitas para un
 * solo toque del motorizado (`pick_up` deja la entrega en `picked_up`, y
 * `deliver` pasa por `heading_to_dropoff` y `delivered` en la misma
 * transacción), así que la barra saltaba de «Recogido» a «Entregado» y «En
 * camino» no se encendía nunca.
 */
const STEPS: { key: string; label: string; statuses: CourierStatus[] }[] = [
  { key: 'requested', label: 'Pedido', statuses: ['requested'] },
  {
    key: 'confirmed',
    label: 'Confirmado',
    statuses: ['accepted', 'heading_to_pickup', 'at_pickup'],
  },
  { key: 'on_the_way', label: 'En camino', statuses: ['picked_up', 'heading_to_dropoff'] },
  { key: 'delivered', label: 'Entregado', statuses: ['delivered'] },
]

/** El título dice en qué va AHORA; antes se quedaba en «Confirmado» hasta entregar. */
const TITLE: Record<CourierStatus, string> = {
  requested: 'Buscando motorizado',
  accepted: 'Va a recoger',
  heading_to_pickup: 'Va a recoger',
  at_pickup: 'Recogiendo',
  picked_up: 'En camino',
  heading_to_dropoff: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

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
  const openSheet = useCourierStore((s) => s.openSheet)
  const shortId = useCourierStore((s) => s.trackingShortId)
  const { data, ownedId, cancelling, cancel, cancelError } = useCourierTracking(shortId ?? '', open)
  const pushOffer = usePushOffer(open ? data : null, ownedId)
  // Cancelar pide un segundo toque: con un solo botón rojo bajo el pulgar, un
  // roce anulaba la solicitud y había que volver a llenar los dos puntos.
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const status = data?.status

  useEffect(() => {
    setConfirmingCancel(false)
  }, [status])

  // Al terminar (entregada, cancelada o vencida) el banner del home y el
  // badge se apagan ya, sin esperar a otro evento.
  const terminal = status === 'delivered' || status === 'cancelled'
  useEffect(() => {
    if (terminal) void useActiveCourierOrdersStore.getState().recargar()
  }, [terminal])

  if (!open || !shortId) return null

  const stepIdx = status ? stepIndexFor(status) : 0
  // Entregada, el último paso también está HECHO (check), no «en curso».
  const doneUpTo = status === 'delivered' ? STEPS.length : stepIdx
  // «Volver a pedir» solo al dueño: el enlace compartido lo abre quien recibe.
  const canReorder = Boolean(ownedId) && (status === 'delivered' || status === 'cancelled')

  return (
    <>
      <BottomSheet open={open} onClose={closeSheet} label="Seguimiento de tu entrega" scrim={false}>
        <div className="flex max-h-[85dvh] flex-col overflow-y-auto px-4 pb-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[24px] font-extrabold tracking-[-0.03em] text-[#2E3236]">
              {status ? TITLE[status] : 'Tu entrega'}
            </div>
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
              {data.cancelReason === 'no_driver' && (
                <p className="text-[14px] font-medium text-[#5C6368]">No se cobró nada.</p>
              )}
              <div className="mt-2 flex w-full flex-col gap-2">
                {canReorder && (
                  <button
                    type="button"
                    onClick={() => openSheet()}
                    className="h-12 w-full rounded-full bg-brand text-[15px] font-bold text-white"
                  >
                    Volver a pedir
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeSheet}
                  className="h-12 w-full rounded-full bg-[#F4F4F2] px-6 text-[15px] font-bold text-[#2E3236]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          ) : (
            <>
              {status === 'requested' &&
                (data.acceptDeadline ? (
                  <AcceptCountdown deadline={data.acceptDeadline} minutes={data.acceptMinutes} />
                ) : (
                  // Una API vieja (sin 0236) no trae el plazo: el texto de siempre.
                  <p className="mb-4 text-[14px] font-medium text-[#5C6368]">
                    Avisamos a los motorizados disponibles. Si nadie la toma en 15 minutos, se
                    cancela sola y no se cobra nada.
                  </p>
                ))}

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
                  <div
                    key={step.key}
                    className="relative flex flex-1 flex-col items-center gap-1.5"
                  >
                    {i > 0 && (
                      <div
                        className={`absolute top-[11px] right-1/2 h-0.5 w-full ${
                          i <= stepIdx ? 'bg-brand' : 'bg-[#E8E9EB]'
                        }`}
                      />
                    )}
                    <div
                      className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full ${
                        i < doneUpTo
                          ? 'bg-brand'
                          : i === stepIdx
                            ? 'border-[2.5px] border-brand bg-white'
                            : 'border-2 border-[#E8E9EB] bg-[#F4F4F2]'
                      }`}
                    >
                      {i < doneUpTo && <Icon name="check" size={16} className="text-white" />}
                      {i === doneUpTo && <span className="h-2 w-2 rounded-full bg-brand" />}
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

              {cancelError && (
                <p
                  role="alert"
                  className="mb-3 text-center text-[14px] font-semibold text-[#B91C1C]"
                >
                  {cancelError}
                </p>
              )}

              {status === 'requested' &&
                (confirmingCancel ? (
                  <div className="rounded-2xl bg-[#FDECEC] p-3">
                    <p className="mb-3 text-center text-[14px] font-semibold text-[#7F1D1D]">
                      ¿Cancelar esta solicitud? Los motorizados dejarán de verla.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(false)}
                        disabled={cancelling}
                        className="h-12 flex-1 rounded-full bg-white text-[15px] font-bold text-[#2E3236]"
                      >
                        No, esperar
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancel()}
                        disabled={cancelling}
                        className="h-12 flex-1 rounded-full bg-[#DC2626] text-[15px] font-bold text-white disabled:opacity-60"
                      >
                        {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(true)}
                    className="h-12 w-full rounded-full bg-[#FDECEC] text-[15px] font-bold text-[#B91C1C]"
                  >
                    Cancelar solicitud
                  </button>
                ))}

              {status === 'delivered' && canReorder && (
                <button
                  type="button"
                  onClick={() => openSheet()}
                  className="h-12 w-full rounded-full bg-brand text-[15px] font-bold text-white"
                >
                  Pedir otra entrega
                </button>
              )}
            </>
          )}
        </div>
      </BottomSheet>
      {data && (
        <PushPermissionSheet
          open={pushOffer.abierta}
          shortId={data.shortId}
          onClose={pushOffer.cerrar}
          kind="courier"
        />
      )}
    </>
  )
}
