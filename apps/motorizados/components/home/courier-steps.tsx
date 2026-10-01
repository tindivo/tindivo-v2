'use client'

import { ApiError } from '@tindivo/api-client'
import type {
  CourierPaymentMethod,
  DriverCourierFailReason,
  DriverCourierOrderView,
  DriverCourierStepRequest,
} from '@tindivo/contracts'
import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { api } from '@/lib/api'
import { isPicked } from './courier-card'

/**
 * Los pasos de una entrega y las dos hojas que piden algo antes de darlos
 * (cómo te pagaron, por qué no se pudo). Los usan por igual la tarjeta del
 * tablero —al arrastrar— y la ficha `/entrega/[id]` —con sus botones—, para
 * que las dos digan y hagan exactamente lo mismo.
 */

const FAIL_REASONS: { value: DriverCourierFailReason; label: string }[] = [
  { value: 'not_ready', label: 'No estaba listo' },
  { value: 'unreachable', label: 'No contestan / no está' },
  { value: 'other', label: 'Otro motivo' },
]

export async function sendStep(id: string, body: DriverCourierStepRequest): Promise<void> {
  await api.post(`/driver/courier-orders/${id}/step`, body)
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.message) : fallback
}

export function needsPayment(o: DriverCourierOrderView, step: 'pick_up' | 'deliver'): boolean {
  if (o.transportCollected) return false
  return step === 'pick_up' ? o.payer === 'origin' : o.payer === 'destination'
}

/** Antes de recoger y sin haber cobrado, se puede devolver a la bandeja. */
export function canRelease(o: DriverCourierOrderView): boolean {
  return !isPicked(o) && !o.transportCollected
}

export function PaymentSheet({
  fee,
  error,
  busy,
  onPick,
  onClose,
}: {
  fee: number
  error: string | null
  busy: boolean
  onPick: (m: CourierPaymentMethod) => Promise<void>
  onClose: () => void
}) {
  const title = `¿Cómo te pagaron los S/ ${fee.toFixed(2)}?`
  return (
    <BottomSheet open label={title} onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1.5 text-body text-ink-muted">Primero Yape a tu QR. Si no, efectivo.</p>
        {error && <p className="mt-2 text-caption text-danger">{error}</p>}
        <div className="mt-4 flex flex-col gap-2.5">
          <Button disabled={busy} onClick={() => onPick('yape')}>
            <Icon name="qr_code_2" size={18} filled /> Yape
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => onPick('cash')}>
            <Icon name="payments" size={18} filled /> Efectivo
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

/**
 * «No se pudo», y antes de recoger también «Soltar»: las dos salidas de una
 * entrega que no sigue, juntas en el gesto a la izquierda y en la ficha. Soltar va primero
 * y separado porque no es un fallo: la entrega vuelve a la bandeja.
 */
export function ProblemSheet({
  order,
  error,
  busy,
  onRelease,
  onFail,
  onClose,
}: {
  order: DriverCourierOrderView
  error: string | null
  busy: boolean
  onRelease: () => Promise<void>
  onFail: (r: DriverCourierFailReason) => Promise<void>
  onClose: () => void
}) {
  const picked = isPicked(order)
  const releasable = canRelease(order)
  const title = picked ? 'No se pudo entregar' : 'No se pudo recoger'
  return (
    <BottomSheet open label={title} onClose={onClose}>
      <div className="p-5 pb-7">
        {releasable && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRelease()}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink/[0.08] bg-card p-3.5 text-left disabled:opacity-50"
            >
              <Icon name="swap_horiz" size={20} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">Soltar entrega</span>
                <span className="block text-caption text-ink-muted">
                  Vuelve a la bandeja para que la tome otro.
                </span>
              </span>
            </button>
            <div className="my-4 h-px bg-ink/[0.08]" />
          </>
        )}
        <h2 className="font-display text-title font-bold tracking-tight text-danger">{title}</h2>
        {picked && (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-warning/15 px-3 py-2 text-body font-semibold text-ink">
            <Icon name="warning" size={18} className="mt-0.5 shrink-0" filled />
            Devuélvelo a quien te lo entregó y llama a Jesús.
          </p>
        )}
        {error && <p className="mt-2 text-caption text-danger">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          {FAIL_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={busy}
              onClick={() => onFail(r.value)}
              className="rounded-2xl border border-ink/[0.08] bg-ink/[0.04] p-3.5 text-left text-body font-semibold text-ink hover:bg-ink/[0.08] disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
