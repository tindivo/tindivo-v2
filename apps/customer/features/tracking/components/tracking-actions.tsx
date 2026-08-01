import type { TrackingStep } from '@tindivo/contracts'
import { Button, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { SupportLink } from '@/components/ui'
import { getStatusMessage } from '@/features/tracking/lib/format'
import type { CancelState, Tracking } from '@/features/tracking/types'

interface TrackingActionsProps {
  data: Tracking
  current: TrackingStep | null
  cancellable: boolean
  cancel: CancelState
}

export function TrackingActions({ data, current, cancellable, cancel }: TrackingActionsProps) {
  const { confirmCancel, setConfirmCancel, cancelling, doCancel } = cancel

  const driverWhatsappUrl = data.driverPhone
    ? `https://wa.me/${data.driverPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hola, te escribo por mi pedido de ${data.businessName} (#${data.shortId}). Estás en mi domicilio.`,
      )}`
    : null

  return (
    <>
      <div className="mt-5 border-t border-ink/[0.06] pt-4">
        {driverWhatsappUrl && (
          <div className="mb-4 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-left">
            <div className="flex items-center gap-2 font-semibold text-[14px] text-amber-900">
              <Icon name="person_pin_circle" size={20} className="text-amber-600" />
              ¡El motorizado llegó a tu domicilio!
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
              {data.driverName ?? 'El motorizado'} se encuentra en la puerta y no logra ubicarte.
              Escríbele por WhatsApp:
            </p>
            <Button
              size="sm"
              as="a"
              href={driverWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 w-full border border-amber-300 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Icon name="chat" size={18} />
              Escribir al motorizado por WhatsApp
            </Button>
          </div>
        )}
        {cancellable ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-danger/20 bg-danger/5 py-3.5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/10"
            >
              <Icon name="error" size={16} />
              Cancelar pedido
            </button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-subtle">
              Puedes cancelar mientras el restaurante aún no confirma.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-ink/[0.04] bg-white px-3.5 py-3 shadow-elev-1">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
              <Icon name="check" size={14} filled />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold leading-snug">
                {getStatusMessage(data, current)}
              </div>
              <div className="mt-1.5">
                <SupportLink orderShortId={data.shortId} />
              </div>
            </div>
          </div>
        )}
        {cancellable && (
          <div className="mt-3 flex justify-center">
            <SupportLink orderShortId={data.shortId} />
          </div>
        )}
      </div>

      <Link href="/" className="mt-6 inline-block text-[14px] text-brand">
        ← Volver al inicio
      </Link>

      {/* Confirmación de cancelación */}
      {confirmCancel && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
        <div
          className="t-modal-backdrop items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmCancel(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmCancel(false)
          }}
        >
          <div
            className="mx-6 max-w-[360px] rounded-[22px] bg-surface p-6 text-center"
            role="dialog"
            aria-modal="true"
          >
            <h2 className="t-display text-[20px]">¿Cancelar tu pedido?</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              Esta acción no se puede deshacer. Si ya pagaste por Yape, te lo devolveremos.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <Button variant="danger" className="w-full" onClick={doCancel} disabled={cancelling}>
                {cancelling ? 'Cancelando…' : 'Sí, cancelar pedido'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setConfirmCancel(false)}>
                No, mantener pedido
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
