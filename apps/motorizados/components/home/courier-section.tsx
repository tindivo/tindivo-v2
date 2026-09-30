'use client'

import { ApiError } from '@tindivo/api-client'
import type {
  CourierPaymentMethod,
  DriverCourierFailReason,
  DriverCourierOrderView,
  DriverCourierStepRequest,
} from '@tindivo/contracts'
import { BottomSheet, Button, cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { api } from '@/lib/api'

/**
 * Tindivo Entregas en el tablero del motorizado (MVP, Docs/Entregas/mvp-entregas-v1.md §4).
 *
 * Tarjetas AZULES para que no se confundan con la comida. Tres botones de
 * avance —Aceptar, Recogido, Entregado— más «No se pudo» y «Soltar». Cada
 * botón es UNA transacción en la base (`driver_courier_step`, 0235), y es
 * idempotente: si la conexión se corta, volver a tocar es seguro.
 *
 * La comida manda por REGLA DE OPERACIÓN, no por software: si hay comida
 * lista para recoger, va primero; una entrega ya recogida se termina antes.
 */

const FAIL_REASONS: { value: DriverCourierFailReason; label: string }[] = [
  { value: 'not_ready', label: 'No estaba listo' },
  { value: 'unreachable', label: 'No contestan / no está' },
  { value: 'other', label: 'Otro motivo' },
]

async function sendStep(id: string, body: DriverCourierStepRequest): Promise<void> {
  await api.post(`/driver/courier-orders/${id}/step`, body)
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.message) : fallback
}

function payerLabel(o: DriverCourierOrderView): string {
  const fee = `S/ ${o.feeAmount.toFixed(2)}`
  if (o.transportCollected) return `Cobrado ${fee}`
  return o.payer === 'origin' ? `Cobrar ${fee} al recoger` : `Cobrar ${fee} al entregar`
}

function Point({ label, point }: { label: string; point: DriverCourierOrderView['origin'] }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name="location_on" size={18} className="mt-0.5 shrink-0 text-blue-600" filled />
      <div className="min-w-0 flex-1">
        <p className="text-caption font-semibold uppercase tracking-wide text-blue-700">{label}</p>
        <p className="text-body font-semibold text-ink">{point.referenceText}</p>
        <p className="text-caption text-ink-muted">{point.name}</p>
      </div>
      {point.phone && (
        <a
          href={`tel:${point.phone}`}
          aria-label={`Llamar a ${point.name}`}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-blue-600 px-4 text-caption font-bold text-white"
        >
          <Icon name="call" size={16} filled />
          Llamar
        </a>
      )}
    </div>
  )
}

function CardShell({
  order,
  children,
}: {
  order: DriverCourierOrderView
  children: React.ReactNode
}) {
  return (
    <article className="rounded-3xl border-2 border-blue-200 bg-blue-50 p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          <Icon name="local_shipping" size={14} filled />
          Entrega
        </span>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-caption font-bold',
            order.transportCollected ? 'bg-success-soft text-success' : 'bg-white text-blue-800',
          )}
        >
          {payerLabel(order)}
        </span>
      </header>
      {/* «Pidió», no «a nombre de»: en los pedidos de WhatsApp quien pide es la
          cuenta de Jesús. A nombre de quién está la bolsa lo dice el cliente
          en sus indicaciones (abajo), y si no, se llama. */}
      <p className="mb-3 flex items-center gap-2 text-caption text-ink-muted">
        <Icon name="person" size={14} className="text-blue-600" filled />
        <span>
          Pidió <strong className="text-ink">{order.requesterName}</strong>
        </span>
      </p>
      <div className="flex flex-col gap-3">
        <Point label="Recoger" point={order.origin} />
        <Point label="Llevar" point={order.destination} />
      </div>
      <p className="mt-3 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-body text-ink">
        <Icon name="inventory_2" size={16} className="text-blue-600" filled />
        {order.itemDescription}
        {order.isFragile && <span className="font-bold text-danger">· Frágil</span>}
      </p>
      {order.driverNote && (
        <p className="mt-2 flex items-start gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-body font-semibold text-ink">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-warning" filled />
          {order.driverNote}
        </p>
      )}
      {children}
    </article>
  )
}

// ── Disponibles ─────────────────────────────────────────────────────────────

export function CourierAvailableList({
  orders,
  mineCount,
  maxActive,
  onChanged,
}: {
  orders: DriverCourierOrderView[]
  mineCount: number
  maxActive: number
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  if (orders.length === 0) return null
  const full = mineCount >= maxActive

  async function accept(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await sendStep(id, { step: 'accept' })
    } catch (err) {
      setError({ id, text: errorText(err, 'No se pudo aceptar. Intenta de nuevo.') })
    } finally {
      setBusyId(null)
      onChanged()
    }
  }

  return (
    <section className="mt-5 mb-5 flex flex-col gap-3" aria-label="Entregas disponibles">
      <h2 className="px-1 font-display text-body font-bold text-blue-800">
        Entregas por aceptar · {orders.length}
      </h2>
      {full && (
        <p className="rounded-2xl bg-blue-100 px-3 py-2 text-caption font-semibold text-blue-900">
          Ya tienes {mineCount} entregas. Termina una para aceptar otra.
        </p>
      )}
      {orders.map((o) => (
        <CardShell key={o.id} order={o}>
          <p className="mt-3 text-caption text-ink-muted">
            Antes de salir, llama a quien entrega para confirmar que está listo.
          </p>
          {error?.id === o.id && <p className="mt-2 text-caption text-danger">{error.text}</p>}
          <Button
            className="mt-3 w-full"
            disabled={full || busyId !== null}
            onClick={() => accept(o.id)}
          >
            {busyId === o.id ? 'Aceptando…' : 'Aceptar entrega'}
          </Button>
        </CardShell>
      ))}
    </section>
  )
}

// ── Mías ────────────────────────────────────────────────────────────────────

type Sheet =
  | { kind: 'payment'; order: DriverCourierOrderView; step: 'pick_up' | 'deliver' }
  | { kind: 'fail'; order: DriverCourierOrderView }
  | null

const PICKED = new Set(['picked_up', 'heading_to_dropoff'])

function needsPayment(o: DriverCourierOrderView, step: 'pick_up' | 'deliver'): boolean {
  if (o.transportCollected) return false
  return step === 'pick_up' ? o.payer === 'origin' : o.payer === 'destination'
}

export function CourierMineList({
  orders,
  onChanged,
}: {
  orders: DriverCourierOrderView[]
  onChanged: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<{ id: string; text: string } | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  if (orders.length === 0) return null

  async function run(id: string, body: DriverCourierStepRequest): Promise<boolean> {
    setBusyId(id)
    setError(null)
    try {
      await sendStep(id, body)
      return true
    } catch (err) {
      setError({ id, text: errorText(err, 'No se pudo guardar. Intenta de nuevo.') })
      return false
    } finally {
      setBusyId(null)
      onChanged()
    }
  }

  function advance(o: DriverCourierOrderView, step: 'pick_up' | 'deliver') {
    if (needsPayment(o, step)) setSheet({ kind: 'payment', order: o, step })
    else void run(o.id, { step })
  }

  return (
    <section className="mt-5 mb-5 flex flex-col gap-3" aria-label="Mis entregas">
      <h2 className="px-1 font-display text-body font-bold text-blue-800">
        Mis entregas · {orders.length}
      </h2>
      {orders.map((o) => {
        const picked = PICKED.has(o.status)
        const busy = busyId === o.id
        return (
          <CardShell key={o.id} order={o}>
            {error?.id === o.id && <p className="mt-2 text-caption text-danger">{error.text}</p>}
            <Button
              className="mt-3 w-full"
              disabled={busyId !== null}
              onClick={() => advance(o, picked ? 'deliver' : 'pick_up')}
            >
              {busy ? 'Guardando…' : picked ? 'Entregado' : 'Recogido'}
            </Button>
            <div className="mt-2 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={busyId !== null}
                onClick={() => setSheet({ kind: 'fail', order: o })}
              >
                No se pudo
              </Button>
              {!picked && !o.transportCollected && (
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={busyId !== null}
                  onClick={() => void run(o.id, { step: 'release' })}
                >
                  Soltar
                </Button>
              )}
            </div>
          </CardShell>
        )
      })}

      {sheet?.kind === 'payment' && (
        <PaymentSheet
          fee={sheet.order.feeAmount}
          onClose={() => setSheet(null)}
          onPick={async (method) => {
            const ok = await run(sheet.order.id, { step: sheet.step, paymentMethod: method })
            if (ok) setSheet(null)
          }}
          busy={busyId !== null}
        />
      )}
      {sheet?.kind === 'fail' && (
        <FailSheet
          picked={PICKED.has(sheet.order.status)}
          onClose={() => setSheet(null)}
          onPick={async (reason) => {
            const ok = await run(sheet.order.id, { step: 'fail', failReason: reason })
            if (ok) setSheet(null)
          }}
          busy={busyId !== null}
        />
      )}
    </section>
  )
}

function PaymentSheet({
  fee,
  onPick,
  onClose,
  busy,
}: {
  fee: number
  onPick: (m: CourierPaymentMethod) => Promise<void>
  onClose: () => void
  busy: boolean
}) {
  const title = `¿Cómo te pagaron los S/ ${fee.toFixed(2)}?`
  return (
    <BottomSheet open label={title} onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1.5 text-body text-ink-muted">Primero Yape a tu QR. Si no, efectivo.</p>
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

function FailSheet({
  picked,
  onPick,
  onClose,
  busy,
}: {
  picked: boolean
  onPick: (r: DriverCourierFailReason) => Promise<void>
  onClose: () => void
  busy: boolean
}) {
  const title = picked ? 'No se pudo entregar' : 'No se pudo recoger'
  return (
    <BottomSheet open label={title} onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight text-danger">{title}</h2>
        {picked && (
          <p className="mt-2 flex items-start gap-2 rounded-2xl bg-warning/15 px-3 py-2 text-body font-semibold text-ink">
            <Icon name="warning" size={18} className="mt-0.5 shrink-0" filled />
            Devuélvelo a quien te lo entregó y llama a Jesús.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {FAIL_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={busy}
              onClick={() => onPick(r.value)}
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
