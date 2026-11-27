'use client'

import {
  DELIVERY_PAYMENT_REJECT_REASONS,
  type DeliveryPaymentRejectReason,
} from '@tindivo/contracts'
import { Button, cn, Icon } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import type { OrderVM, PagoUnicoView, UiPayment } from '@/lib/orders/view-model'
import { getProofUrl } from '../lib/proof-url'

const REJECT_LABELS: Record<DeliveryPaymentRejectReason, string> = {
  invalid_proof: 'Comprobante no válido',
  wrong_amount: 'Monto distinto',
  unreadable: 'No se lee',
  other: 'Otro',
}

const COBRO_EN_PUERTA: Record<UiPayment, string> = {
  pending_wallet: 'Yape o Plin',
  pending_cash: 'efectivo',
  pending_mixed: 'pago mixto',
  prepaid: 'Yape o Plin',
}

/**
 * Pago único de un pedido con entrega: el cliente paga con Yape o Plin directo
 * al negocio y puede mandar una captura. SOLO el negocio confirma que el dinero
 * entró (con o sin captura); el motorizado ve la captura y no la aprueba.
 *
 * Las acciones llegan opcionales: sin ellas la tarjeta solo informa. Los
 * errores de la llamada los pinta el `run` de `useOrderActions` en el tablero;
 * aquí no se duplican.
 */
export function PagoUnicoCard({
  order,
  view,
  onConfirm,
  onReject,
  busy,
}: {
  order: OrderVM
  view: PagoUnicoView
  onConfirm?: () => void | Promise<void>
  onReject?: (attempt: number, reasonCode: DeliveryPaymentRejectReason) => void | Promise<void>
  busy: boolean
}) {
  const [asking, setAsking] = useState(false)
  const [choosingReason, setChoosingReason] = useState(false)

  // Si cambia el momento del pago (confirmó, rechazó, otro intento), los pasos
  // a medias ya no valen.
  useEffect(() => {
    setAsking(false)
    setChoosingReason(false)
  }, [view.stage, view.attempt])

  const stage = view.stage
  const confirmed = stage === 'confirmado'

  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-xl border-[1.5px] shadow-elev-2',
        confirmed ? 'border-success/60' : 'border-info/60',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-3.5 py-2.5',
          confirmed ? 'bg-success/10' : 'bg-info/10',
        )}
      >
        <Icon
          weight={500}
          name={confirmed ? 'verified' : 'payments'}
          size={18}
          filled
          className={confirmed ? 'text-success' : 'text-info'}
        />
        <div className={cn('text-[13px] font-bold', confirmed ? 'text-success' : 'text-info')}>
          Pago con Yape o Plin
        </div>
      </div>

      <div className="bg-white p-3 px-3.5">
        {stage === 'antes_de_aceptar' && (
          <p className="text-[13px] text-ink-muted">
            Si el cliente envía captura, la verás aquí después de aceptar.
          </p>
        )}

        {stage === 'sin_captura' && (
          <p className="text-[13px] text-ink-muted">
            El cliente aún no envía captura. Puede pagar al motorizado en la puerta.
          </p>
        )}

        {stage === 'captura_por_revisar' && (
          <>
            <p className="mb-2 text-[13px] font-semibold">El cliente envió su captura</p>
            <ProofThumb order={order} />
            <div className="mt-2.5 rounded-[10px] border border-border bg-surface p-2.5 text-xs">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
                DATOS PARA VERIFICAR
              </div>
              <div className="flex flex-col">
                <span className="mb-0.5 text-[10px] text-ink-muted">Monto</span>
                <span className="font-mono text-[13px] font-bold text-success">
                  {soles(order.total)}
                </span>
              </div>
            </div>
          </>
        )}

        {stage === 'captura_rechazada' && (
          <p className="text-[13px] text-ink-muted">
            {view.attempt >= 2
              ? 'Rechazaste la captura. El cliente ya no puede enviar otra: paga en la puerta.'
              : 'Rechazaste la captura. El cliente puede enviar otra o pagar en la puerta.'}
          </p>
        )}

        {confirmed && (
          <div className="flex items-center gap-2 rounded-[10px] border border-success/30 bg-success/10 px-3 py-2 text-[13px] font-semibold text-success">
            <Icon weight={500} name="verified" size={18} filled />
            Ingreso confirmado · el motorizado no cobra
          </div>
        )}

        {stage === 'cobrado_en_puerta' && (
          <p className="text-[13px] text-ink-muted">
            Cobrado en la puerta: {COBRO_EN_PUERTA[order.paymentReal ?? 'pending_wallet']}
          </p>
        )}

        {stage === 'cerrado' && (
          <p className="text-[13px] text-ink-muted">No se confirmó el ingreso de este pedido.</p>
        )}

        {view.canConfirm && onConfirm && !asking && !choosingReason && (
          <div className="mt-3 flex flex-col gap-2">
            {stage === 'captura_por_revisar' ? (
              <>
                <Button variant="success" disabled={busy} onClick={() => setAsking(true)}>
                  Confirmar ingreso
                </Button>
                {view.canReject && onReject && (
                  <Button variant="outline" disabled={busy} onClick={() => setChoosingReason(true)}>
                    Rechazar captura
                  </Button>
                )}
              </>
            ) : (
              <Button variant="outline" disabled={busy} onClick={() => setAsking(true)}>
                Ya me llegó el pago
              </Button>
            )}
          </div>
        )}

        {asking && onConfirm && (
          <div className="mt-3 rounded-[10px] border border-success/40 bg-success/5 p-3">
            <p className="mb-2 text-[13px] font-semibold">
              ¿Ya ves {soles(order.total)} en tu Yape o Plin?
            </p>
            <div className="flex gap-2">
              <Button
                variant="success"
                className="flex-1"
                disabled={busy}
                onClick={() => void onConfirm()}
              >
                Sí, me llegó
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => setAsking(false)}
              >
                Volver
              </Button>
            </div>
          </div>
        )}

        {choosingReason && onReject && (
          <div className="mt-3 rounded-[10px] border border-danger/30 bg-danger-soft p-3">
            <p className="mb-2 text-[13px] font-semibold">¿Por qué rechazas la captura?</p>
            <div className="flex flex-col gap-2">
              {DELIVERY_PAYMENT_REJECT_REASONS.map((code) => (
                <Button
                  key={code}
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onReject(view.attempt, code)}
                >
                  {REJECT_LABELS[code]}
                </Button>
              ))}
              <Button variant="ghost" disabled={busy} onClick={() => setChoosingReason(false)}>
                Volver
              </Button>
            </div>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-tight text-ink-muted">
          Solo tú confirmas el pago. El motorizado ve la captura pero no la aprueba.
        </p>
      </div>
    </div>
  )
}

/** Miniatura de la captura; se amplía a pantalla completa al tocarla. */
function ProofThumb({ order }: { order: OrderVM }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(false)
  const path = order.proofUrl

  const load = useCallback(() => {
    if (!path) return
    setFailed(false)
    setUrl(null)
    getProofUrl(order.rowId, path)
      .then((u) => (u ? setUrl(u) : setFailed(true)))
      .catch(() => setFailed(true))
  }, [order.rowId, path])

  useEffect(() => {
    load()
  }, [load])

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[10px] bg-surface-low px-3 py-5 text-center">
        <span className="text-xs text-ink-muted">No pudimos cargar la captura</span>
        <Button variant="outline" size="sm" onClick={load}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (!url) {
    return <div className="h-[130px] w-full animate-pulse rounded-[10px] bg-ink/[0.06]" />
  }

  return (
    <>
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Captura ampliada"
          onClick={() => setZoom(false)}
          onKeyDown={(e) => e.key === 'Escape' && setZoom(false)}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/85 p-5 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setZoom(false)}
            className="absolute right-5 top-5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-transparent bg-white shadow-elev-3"
          >
            <Icon weight={500} name="close" size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Captura ampliada"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-elev-4"
          />
          <div className="mt-3 text-[13px] font-semibold text-white">
            Captura del pago — {order.customer ?? 'Cliente'} ({soles(order.total)})
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label="Ampliar la captura del cliente"
        className="relative block w-full cursor-pointer overflow-hidden rounded-[10px] border border-border bg-surface-low text-left"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Captura del cliente"
          className="block max-h-64 w-full bg-surface object-contain"
          onError={() => setFailed(true)}
        />
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-ink/95 px-3 py-1.5 text-[11px] font-semibold text-white shadow-elev-2">
          <Icon weight={500} name="zoom_in" size={15} /> Ampliar
        </div>
      </button>
    </>
  )
}
