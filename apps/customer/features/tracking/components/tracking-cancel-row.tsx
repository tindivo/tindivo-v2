'use client'

import { Button, Icon } from '@tindivo/ui'
import { CountdownPill } from '@/features/tracking/components/tracking-countdown'
import type { CountdownView } from '@/features/tracking/lib/deadline'
import type { CancelState, Tracking } from '@/features/tracking/types'

interface TrackingCancelRowProps {
  data: Tracking
  countdown: CountdownView | null
  cancel: CancelState
}

/**
 * Cancelar, justo debajo del hero y no al final de la pantalla.
 *
 * Va arriba porque la ventana para usarlo dura minutos: enterrarlo bajo el
 * detalle del pedido significa que quien se equivocó lo encuentra cuando ya no
 * sirve. Pero va como **enlace y no como botón rojo**, porque una acción
 * destructiva de tamaño completo en el segundo elemento de la pantalla se toca
 * sin querer y hace que un pedido normal parezca un problema.
 *
 * El contador y el botón comparten fila a propósito: son el mismo reloj. El
 * plazo que tiene el negocio para confirmar es exactamente el que tiene el
 * cliente para salirse, y así el número explica el botón sin un párrafo.
 */
export function TrackingCancelRow({ data, countdown, cancel }: TrackingCancelRowProps) {
  const { confirmCancel, setConfirmCancel, cancelling, doCancel } = cancel

  // En `validando` de contraentrega no hay contador (ver `activeDeadline`), pero
  // sí se puede cancelar. La fila se sostiene sola con el texto.
  const esperando = countdown?.kind === 'grace'
  const texto = countdown
    ? esperando
      ? 'Estamos confirmando tu pedido'
      : 'El restaurante confirma en'
    : 'Estamos confirmando tu pedido'

  return (
    <>
      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[16px] border border-ink/[0.06] bg-card px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            <span className="truncate">{texto}</span>
            {countdown && !esperando && <CountdownPill view={countdown} />}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-subtle">
            Hasta entonces puedes cancelar sin costo
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="shrink-0 rounded-[10px] px-2 py-1.5 text-[13px] font-semibold text-danger underline-offset-2 transition-colors hover:bg-danger/5 hover:underline"
        >
          Cancelar
        </button>
      </div>

      {confirmCancel && (
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 animate-[t-fade-in_200ms_ease] backdrop-blur-sm"
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
            aria-label="¿Cancelar el pedido?"
          >
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Icon name="error" size={22} />
            </div>
            <h2 className="mt-3 font-display text-[20px] font-bold tracking-tight">
              ¿Cancelar tu pedido?
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
              {data.paymentIntent === 'prepaid'
                ? 'Esta acción no se puede deshacer. Todavía no has pagado nada, así que no se te cobrará.'
                : 'Esta acción no se puede deshacer. No se te cobrará nada.'}
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
