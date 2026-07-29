'use client'

import type { TrackingStep } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
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

  return (
    <>
      <div className="mt-5 border-t border-[rgba(26,22,20,0.06)] pt-4">
        {cancellable ? (
          <>
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.06)] py-3.5 text-[14px] font-semibold text-danger"
            >
              <Icon name="error" size={16} />
              Cancelar pedido
            </button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-subtle">
              Puedes cancelar mientras el restaurante aún no confirma.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-2.5 rounded-[14px] border border-[rgba(26,22,20,0.06)] bg-white px-3.5 py-3">
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[rgba(26,150,80,0.1)] text-success">
              <Icon name="check" size={14} />
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
              <button
                type="button"
                onClick={doCancel}
                disabled={cancelling}
                className="t-btn t-btn-block bg-danger font-semibold text-white hover:bg-red-700"
              >
                {cancelling ? 'Cancelando…' : 'Sí, cancelar pedido'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="t-btn t-btn-ghost t-btn-block"
              >
                No, mantener pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
