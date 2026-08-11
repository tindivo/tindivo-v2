'use client'

import { BottomSheet, Button, cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { moneyLine } from '@/lib/orders/presentation'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * Cómo pagó el cliente REALMENTE. `paid_prepaid` no se elige: se deduce de que
 * el pedido ya venía pagado. Registrarlo importa — si un prepago entregado se
 * guardara como `paid_yape`, sería indistinguible de un Yape cobrado en la
 * puerta, y ese es justo el número que hace falta para saber si la regla de
 * "primer pedido obligatoriamente prepago" está costando clientes.
 */
type PaymentReal = 'paid_prepaid' | 'paid_cash' | 'paid_yape'

/**
 * Confirmación de entrega: cómo pagó el cliente + no-show en 2 pasos (HU-D-029).
 *
 * EL QR VIVE AQUÍ, y no solo en la tarjeta de cobro. El caso que lo pide es
 * exacto: el cliente dijo efectivo, no le alcanza, y saca el teléfono. En ese
 * momento el motorizado ya tiene esta hoja abierta — mandarlo a cerrarla,
 * buscar el QR en otra tarjeta y volver es pedirle que navegue con el cliente
 * esperando. Marcar "Yape" ahora enseña el QR sin salir.
 *
 * NO HAY OPCIÓN "MIXTO", Y NO ES UN OLVIDO.
 * El legacy (`tindivo-delivery`, `mark-delivered-sheet.tsx`) sí la tenía, con
 * división editable y recálculo del vuelto. Portarla hoy dejaría un agujero de
 * dinero: la liquidación de efectivo filtra por `payment_real = 'paid_cash'` a
 * secas (`0111:88,124` y `0018:39`), así que un pedido marcado `paid_mixed`
 * DESAPARECERÍA del corte de caja con el motorizado teniendo la parte en
 * efectivo encima. Y `advance_order('deliver')` solo escribe `payment_real`
 * (`0128:367-371`): no acepta `cash_amount` ni `client_pays_with`, así que
 * tampoco podría registrar la división real.
 *
 * Recuperarlo necesita, en este orden: que el RPC acepte los importes
 * corregidos, y que la liquidación cuente la parte en efectivo de un mixto.
 * Mientras tanto, ofrecerlo sería peor que no tenerlo.
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
  onConfirm: (paymentReal: PaymentReal) => void
  onNoShow: () => void
  onClose: () => void
}) {
  const { order, business } = detail
  const prepaid = order.paymentIntent === 'prepaid'
  const [payment, setPayment] = useState<PaymentReal | null>(
    prepaid
      ? 'paid_prepaid'
      : order.paymentIntent === 'pending_cash'
        ? 'paid_cash'
        : order.paymentIntent === 'pending_yape'
          ? 'paid_yape'
          : null, // mixto: obliga a elegir cómo terminó pagando
  )
  const [noShowArmed, setNoShowArmed] = useState(false)

  const money = moneyLine({
    paymentIntent: order.paymentIntent,
    total: order.orderAmount + order.deliveryFee,
    cashAmount: order.cashAmount,
    yapeAmount: order.yapeAmount,
    clientPaysWith: order.clientPaysWith,
    changeToGive: order.changeToGive,
  })

  const options = [
    {
      value: 'paid_cash' as const,
      label: 'Efectivo',
      desc: 'Billetes o monedas',
      icon: 'payments',
    },
    {
      value: 'paid_yape' as const,
      label: 'Yape',
      desc: 'Al Yape del local',
      icon: 'qr_code_2',
    },
  ]

  return (
    <BottomSheet open onClose={onClose}>
      <div className="p-5 pb-7">
        <h2 className="font-display text-title font-bold tracking-tight">
          {prepaid ? 'Confirmar entrega' : '¿Cómo pagó el cliente?'}
        </h2>
        {prepaid && <p className="mt-1 text-body text-ink-muted">Este pedido ya estaba pagado.</p>}

        {/* LA CIFRA, AQUÍ TAMBIÉN. Esta hoja preguntaba cómo pagó sin decir
            cuánto, y se abre con el cliente delante: para comprobar el importe
            había que cerrarla. */}
        {!prepaid && (
          <div className="mt-3 rounded-[16px] border border-ink/[0.07] bg-surface px-4 py-3">
            <p className="font-mono text-title font-bold leading-none tabular-nums text-ink">
              {money.headline}
            </p>
            {money.detail && (
              <p className="mt-1 text-caption font-medium text-ink-muted">{money.detail}</p>
            )}
          </div>
        )}

        {!prepaid && (
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {options.map((p) => {
              const active = payment === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPayment(p.value)}
                  className={cn(
                    'rounded-[18px] p-4 text-left transition-colors',
                    active
                      ? 'border-2 border-brand bg-brand-soft'
                      : 'border border-ink/10 bg-card hover:bg-surface',
                  )}
                >
                  {/* El icono va arriba y no en línea: con dos columnas
                      estrechas, un icono al lado del texto obliga a truncar la
                      descripción justo en el momento de menos paciencia. */}
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-[12px]',
                      active ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink-muted',
                    )}
                  >
                    <Icon name={p.icon} size={20} filled />
                  </span>
                  <p
                    className={cn(
                      'mt-2 font-semibold text-body-lg',
                      active ? 'text-brand-dark' : 'text-ink',
                    )}
                  >
                    {p.label}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-muted">{p.desc}</p>
                </button>
              )
            })}
          </div>
        )}

        {/* El QR, en cuanto se elige Yape. Es el caso de "no me alcanza el
            efectivo" resuelto sin cerrar la hoja. */}
        {payment === 'paid_yape' && (business?.qrUrl || business?.yapeNumber) && (
          <div className="mt-3 rounded-[18px] border border-ink/[0.07] bg-surface p-4 text-center">
            <p className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Que escanee este QR
            </p>
            {business.qrUrl && (
              <img
                src={business.qrUrl}
                alt={`QR de Yape de ${business.name}`}
                className="mx-auto mt-2.5 h-[168px] w-[168px] rounded-2xl border border-ink/[0.08] bg-card object-contain"
              />
            )}
            {business.yapeNumber && (
              <p className="mt-2 font-mono text-lead font-bold tabular-nums text-ink">
                {business.yapeNumber}
              </p>
            )}
          </div>
        )}

        <Button
          className="mt-5 w-full"
          disabled={!payment || busy}
          onClick={() => payment && onConfirm(payment)}
        >
          {busy ? 'Confirmando…' : 'Confirmar entrega'}
        </Button>

        <div className="mt-5 border-t border-ink/10 pt-4">
          {!noShowArmed ? (
            // EN GRIS HASTA QUE SE ARMA. Es una salida de emergencia, no un
            // error: pintarla de rojo de entrada la convierte en una alarma
            // permanente en una pantalla que casi siempre acaba bien.
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
