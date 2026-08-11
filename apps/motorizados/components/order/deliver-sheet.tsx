'use client'

import { BottomSheet, Button, cn, Icon } from '@tindivo/ui'
import { useMemo, useState } from 'react'
import { soles } from '@/lib/format'
import { moneyLine } from '@/lib/orders/presentation'
import { changeDue } from '@/lib/payment'
import type { OrderDetailResponse } from '@/lib/types'
import { YapeQr } from './yape-qr'

export type PaymentReal = 'paid_prepaid' | 'paid_cash' | 'paid_yape' | 'paid_mixed'

/** Lo que se manda al confirmar. Los importes solo viajan si cambió el cobro. */
export interface DeliverPayment {
  paymentReal: PaymentReal
  cashAmount?: number
  yapeAmount?: number
  clientPaysWith?: number
}

/**
 * Confirmación de entrega (HU-D-029).
 *
 * TRES CAMINOS, COMO EN EL LEGACY (`tindivo-delivery/mark-delivered-sheet`).
 * v2 los había reducido a "efectivo o Yape", y con eso un pedido mixto pagado
 * tal cual el plan no se podía contar con verdad: había que elegir una de las
 * dos mentiras, y el corte de caja salía mal por la otra parte.
 *
 *   · Tal cual lo planeado — el 95% de las veces, un toque y fuera.
 *   · Pagó exacto — no hizo falta el vuelto que llevabas.
 *   · Cambió el método — efectivo, Yape o mixto, con la división editable.
 *
 * EL ORDEN NO ES CASUAL. La opción por defecto es la que casi siempre ocurre,
 * y las otras dos aparecen debajo sin desplegar nada. La división editable solo
 * se abre al elegirla: pedirle a alguien que teclee importes con el cliente
 * delante hay que ganárselo, no imponerlo.
 *
 * LO QUE SE TECLEA AQUÍ NO ES LA VERDAD FINAL. `advance_order` revalida en la
 * misma transacción que entrega (0140): que las partes sumen el pedido, que
 * ninguna sea cero, que el billete cubra el efectivo. Esta pantalla evita el
 * viaje de ida y vuelta, no sustituye la comprobación — es el número del que
 * sale el corte de caja.
 */
export function DeliverSheet({
  detail,
  busy,
  onConfirm,
  onNoShow,
  onClose,
}: {
  detail: OrderDetailResponse
  busy: boolean
  onConfirm: (payment: DeliverPayment) => void
  onNoShow: () => void
  onClose: () => void
}) {
  const { order, business } = detail
  const prepaid = order.paymentIntent === 'prepaid'
  const total = order.orderAmount + order.deliveryFee

  const planned = useMemo(
    () =>
      changeDue({
        paymentIntent: order.paymentIntent,
        total,
        cashAmount: order.cashAmount,
        clientPaysWith: order.clientPaysWith,
        changeToGive: order.changeToGive,
      }),
    [order, total],
  )
  const hadChange = planned != null && planned > 0

  const money = moneyLine({
    paymentIntent: order.paymentIntent,
    total,
    cashAmount: order.cashAmount,
    yapeAmount: order.yapeAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  type Kind = 'unchanged' | 'cash_exact' | 'changed'
  const [kind, setKind] = useState<Kind>('unchanged')
  const [method, setMethod] = useState<Exclude<PaymentReal, 'paid_prepaid'>>(
    order.paymentIntent === 'pending_yape'
      ? 'paid_yape'
      : order.paymentIntent === 'pending_mixed'
        ? 'paid_mixed'
        : 'paid_cash',
  )
  const [cashPart, setCashPart] = useState(order.cashAmount?.toFixed(2) ?? '')
  const [yapePart, setYapePart] = useState(order.yapeAmount?.toFixed(2) ?? '')
  const [paysWith, setPaysWith] = useState('')
  const [noShowArmed, setNoShowArmed] = useState(false)

  const num = (raw: string) => {
    const n = Number.parseFloat(raw.replace(',', '.').replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
  }
  const cashN = num(cashPart)
  const yapeN = num(yapePart)
  const paysN = num(paysWith)

  const splitOk =
    method !== 'paid_mixed' ||
    (cashN > 0 && yapeN > 0 && Math.round((cashN + yapeN) * 100) === Math.round(total * 100))
  const cashOwed = method === 'paid_mixed' ? cashN : method === 'paid_cash' ? total : 0
  const billOk = cashOwed === 0 || paysN === 0 || paysN >= cashOwed
  const liveChange =
    cashOwed > 0 && paysN > cashOwed ? Math.round((paysN - cashOwed) * 100) / 100 : 0

  const canConfirm = !busy && (kind !== 'changed' || (splitOk && billOk))

  function submit() {
    if (!canConfirm) return
    if (prepaid) return onConfirm({ paymentReal: 'paid_prepaid' })

    if (kind === 'changed') {
      return onConfirm({
        paymentReal: method,
        ...(method === 'paid_mixed' ? { cashAmount: cashN, yapeAmount: yapeN } : {}),
        ...(cashOwed > 0 && paysN > 0 ? { clientPaysWith: paysN } : {}),
      })
    }

    // "Pagó exacto": el cliente no necesitó el vuelto que llevabas, así que el
    // billete pasa a ser el importe justo. El método no cambia.
    const asPlanned: PaymentReal =
      order.paymentIntent === 'pending_yape'
        ? 'paid_yape'
        : order.paymentIntent === 'pending_mixed'
          ? 'paid_mixed'
          : 'paid_cash'
    return onConfirm({
      paymentReal: asPlanned,
      ...(kind === 'cash_exact'
        ? { clientPaysWith: asPlanned === 'paid_mixed' ? (order.cashAmount ?? total) : total }
        : {}),
    })
  }

  return (
    <BottomSheet open onClose={onClose}>
      <div className="max-h-[85vh] overflow-y-auto p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight">
          {prepaid ? 'Confirmar entrega' : '¿Cómo pagó el cliente?'}
        </h2>

        {prepaid ? (
          <p className="mt-1 text-body text-ink-muted">
            Este pedido ya estaba pagado. No cobres nada.
          </p>
        ) : (
          <>
            {/* El plan, para comparar contra lo que de verdad pasó. */}
            <div className="mt-3 rounded-[16px] border border-ink/[0.07] bg-surface px-4 py-3">
              <p className="font-mono text-title font-bold leading-none tabular-nums text-ink">
                {money.headline}
              </p>
              {money.detail && (
                <p className="mt-1 text-caption font-medium text-ink-muted">{money.detail}</p>
              )}
            </div>

            <div className="mt-4 space-y-2">
              <Option
                active={kind === 'unchanged'}
                onClick={() => setKind('unchanged')}
                icon="check_circle"
                tone="success"
                label="Tal cual lo planeado"
                desc={money.detail ?? 'Sin cambios'}
              />
              {hadChange && (
                <Option
                  active={kind === 'cash_exact'}
                  onClick={() => setKind('cash_exact')}
                  icon="payments"
                  tone="neutral"
                  label="Pagó exacto"
                  desc={`No necesitó los ${soles(planned)} de vuelto`}
                />
              )}
              <Option
                active={kind === 'changed'}
                onClick={() => setKind('changed')}
                icon="swap_horiz"
                tone="brand"
                label="Cambió el método"
                desc="Pagó de otra forma"
              />
            </div>

            {kind === 'changed' && (
              <div className="mt-3 rounded-[18px] border border-brand/20 bg-brand-soft/60 p-3.5">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { v: 'paid_cash', label: 'Efectivo', icon: 'payments' },
                      { v: 'paid_yape', label: 'Yape', icon: 'qr_code_2' },
                      { v: 'paid_mixed', label: 'Los dos', icon: 'call_split' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      aria-pressed={method === m.v}
                      onClick={() => setMethod(m.v)}
                      className={cn(
                        'rounded-[14px] px-2 py-2.5 text-center transition-colors',
                        method === m.v
                          ? 'border-2 border-brand bg-card text-brand-dark'
                          : 'border border-ink/10 bg-card/70 text-ink-muted',
                      )}
                    >
                      <Icon name={m.icon} size={20} filled />
                      <span className="mt-0.5 block text-caption font-semibold">{m.label}</span>
                    </button>
                  ))}
                </div>

                {method === 'paid_mixed' && (
                  <div className="mt-3">
                    <p className="text-caption font-medium text-ink-muted">
                      Las dos partes deben sumar {soles(total)}
                    </p>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      <MoneyField label="En efectivo" value={cashPart} onChange={setCashPart} />
                      <MoneyField label="Por Yape" value={yapePart} onChange={setYapePart} />
                    </div>
                    {cashN + yapeN > 0 && !splitOk && (
                      <p className="mt-1.5 text-caption font-semibold text-danger">
                        Suman {soles(cashN + yapeN)} y el pedido es {soles(total)}.
                      </p>
                    )}
                  </div>
                )}

                {cashOwed > 0 && (
                  <div className="mt-3">
                    <MoneyField
                      label="Con qué billete paga"
                      value={paysWith}
                      onChange={setPaysWith}
                      placeholder="Opcional"
                    />
                    {!billOk && (
                      <p className="mt-1.5 text-caption font-semibold text-danger">
                        No cubre los {soles(cashOwed)} en efectivo.
                      </p>
                    )}
                    {liveChange > 0 && billOk && (
                      <div className="mt-2 flex items-center justify-between rounded-[14px] bg-warning-soft px-3.5 py-2.5">
                        <span className="text-caption font-medium text-amber-900">
                          Vuelto a dar
                        </span>
                        <span className="font-mono text-lead font-bold tabular-nums text-amber-900">
                          {soles(liveChange)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* El QR, en cuanto Yape entra en juego: es el caso de "no me
                    alcanza el efectivo" resuelto sin cerrar la hoja. */}
                {(method === 'paid_yape' || method === 'paid_mixed') && (
                  <div className="mt-3">
                    <YapeQr
                      qrUrl={business?.qrUrl}
                      yapeNumber={business?.yapeNumber}
                      businessName={business?.name}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Button className="mt-5 w-full" disabled={!canConfirm} onClick={submit}>
          {busy ? 'Confirmando…' : 'Confirmar entrega'}
        </Button>

        <div className="mt-5 border-t border-ink/10 pt-4">
          {!noShowArmed ? (
            // En gris: es una salida de emergencia, no un error. En rojo era una
            // alarma permanente en una pantalla que casi siempre acaba bien.
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-ink-muted"
              onClick={() => setNoShowArmed(true)}
            >
              <Icon name="person_off" size={20} />
              El cliente no apareció
            </Button>
          ) : (
            <div>
              <p className="text-caption text-ink-muted">
                Espera 5 min e intenta contactar. Reportar genera un strike al cliente.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="danger" className="flex-1" disabled={busy} onClick={onNoShow}>
                  Sí, reportar no-show
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setNoShowArmed(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

function Option({
  active,
  onClick,
  icon,
  tone,
  label,
  desc,
}: {
  active: boolean
  onClick: () => void
  icon: string
  tone: 'success' | 'neutral' | 'brand'
  label: string
  desc: string
}) {
  const iconTone =
    tone === 'success'
      ? 'bg-success-soft text-success'
      : tone === 'brand'
        ? 'bg-brand-soft text-brand-dark'
        : 'bg-ink/[0.06] text-ink-muted'

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-[18px] p-3.5 text-left transition-colors',
        active ? 'border-2 border-brand bg-brand-soft/50' : 'border border-ink/10 bg-card',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]',
          iconTone,
        )}
      >
        <Icon name={icon} size={20} filled />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-body-lg text-ink">{label}</span>
        <span className="mt-0.5 block truncate text-caption text-ink-muted">{desc}</span>
      </span>
      {active && <Icon name="check_circle" size={20} filled className="shrink-0 text-brand" />}
    </button>
  )
}

/** Campo de importe. `inputMode="decimal"` abre el teclado numérico con coma. */
function MoneyField({
  label,
  value,
  onChange,
  placeholder = '0.00',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-micro font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className="flex items-center gap-1 rounded-[12px] border border-ink/12 bg-card px-3 focus-within:border-brand">
        <span className="font-mono text-caption text-ink-muted">S/</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          className="h-11 w-full bg-transparent font-mono text-body-lg tabular-nums text-ink outline-none"
        />
      </span>
    </label>
  )
}
