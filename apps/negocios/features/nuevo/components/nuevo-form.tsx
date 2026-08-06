'use client'

import { BLACKLISTED_PHONES } from '@tindivo/contracts'
import { Icon } from '@tindivo/ui'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { soles } from '@/components/dashboard/primitives'
import { type DistanceBand, useCreateOrder } from '../hooks/use-create-order'
import { isReferenceValid, num } from '../lib/format'
import type { Payment } from '../types'
import { AmountForm } from './amount-form'
import { CustomerForm } from './customer-form'
import { PaymentSelector } from './payment-selector'
import { PrepSelector } from './prep-selector'
import { ReferenceForm } from './reference-form'

export function NuevoForm() {
  const router = useRouter()
  const { submit, busy, error } = useCreateOrder()

  const [prep, setPrep] = useState(20)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [reference, setReference] = useState('')
  const [payment, setPayment] = useState<Payment>('pending_cash')
  const [amount, setAmount] = useState('')
  const [paysWith, setPaysWith] = useState('')
  const [walletPart, setWalletPart] = useState('')
  const [cashPart, setCashPart] = useState('')
  // Banda de distancia. Arranca en `null` — nadie ha elegido todavía — y el
  // selector de los dos botones llega en la Parte E. Hasta entonces `canSubmit`
  // la exige, así que el botón queda deshabilitado: es el estado honesto, no un
  // `'near'` silencioso que cobraría de menos una entrega lejana.
  // Solo el getter: el setter lo cablea el selector de dos botones de la Parte E.
  const [band] = useState<DistanceBand | null>(null)

  const deliveryMethod = 'delivery'
  const amountN = num(amount)
  const cleanPhone = phone.replace(/\D/g, '')
  const isPhoneBlacklisted =
    cleanPhone.length > 0 && BLACKLISTED_PHONES.includes(cleanPhone as unknown as never)
  const phoneFormatOk = cleanPhone === '' || /^9\d{8}$/.test(cleanPhone)
  const phoneOk = phoneFormatOk && !isPhoneBlacklisted
  const referenceOk = isReferenceValid(reference, deliveryMethod)

  const centsTotal = Math.round(amountN * 100)
  const centsWallet = Math.round(num(walletPart) * 100)
  const centsCash = Math.round(num(cashPart) * 100)
  const mixedOk = payment !== 'pending_mixed' || centsWallet + centsCash === centsTotal

  const isCashish = payment === 'pending_cash' || payment === 'pending_mixed'
  const cashTarget = payment === 'pending_mixed' ? num(cashPart) : amountN
  const change = useMemo(() => {
    if (!isCashish) return 0
    const c = num(paysWith) - cashTarget
    return c > 0 ? c : 0
  }, [isCashish, paysWith, cashTarget])

  // `band !== null` cierra el botón hasta que alguien elija cerca/lejos. Con el
  // selector todavía sin construir (Parte E), eso deja el alta de pedidos
  // manuales bloqueada en esta pantalla — a propósito: el endpoint ya exige la
  // banda, así que sin ella el POST devolvería 422 igual, y es preferible un
  // botón deshabilitado a un error tras rellenar todo el formulario.
  const canSubmit = amountN > 0 && mixedOk && phoneOk && referenceOk && band !== null && !busy

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => router.replace('/')}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-none bg-ink/[0.06] text-ink transition-colors hover:bg-ink/[0.1]"
        >
          <Icon name="arrow_back" size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-bold leading-tight text-ink">
            Solicitar motorizado
          </h1>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            Pedido por teléfono
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-3.5 py-4 pb-36">
        <div className="flex flex-col gap-3">
          <PrepSelector value={prep} onChange={setPrep} />
          <CustomerForm
            name={name}
            onNameChange={setName}
            phone={phone}
            onPhoneChange={setPhone}
            isBlacklisted={isPhoneBlacklisted}
            phoneFormatOk={phoneFormatOk}
          />
          <ReferenceForm reference={reference} onChange={setReference} isValid={referenceOk} />
          <PaymentSelector value={payment} onChange={setPayment} />
          <AmountForm
            payment={payment}
            amount={amount}
            onAmountChange={setAmount}
            walletPart={walletPart}
            onWalletChange={setWalletPart}
            cashPart={cashPart}
            onCashChange={setCashPart}
            paysWith={paysWith}
            onPaysWithChange={setPaysWith}
            mixedOk={mixedOk}
            change={change}
          />

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-danger-soft p-3 text-[13px] font-semibold text-danger">
              <Icon name="error" size={18} filled />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="sticky bottom-0 border-t border-border bg-card px-3.5 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-[560px]">
          {isCashish && change > 0 && (
            <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2">
              <Icon name="payments" size={16} filled className="text-success" />
              <span className="text-[13px] font-semibold text-success">
                Entrega {soles(change)} de vuelto al motorizado junto con el pedido
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              submit(
                {
                  prep,
                  name,
                  phone,
                  reference,
                  payment,
                  amount,
                  paysWith,
                  walletPart,
                  cashPart,
                  band,
                },
                canSubmit,
              )
            }
            disabled={!canSubmit}
            className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-bold text-white shadow-[0_6px_18px_rgba(249,115,22,0.16)] transition-all hover:shadow-[0_10px_30px_rgba(249,115,22,0.24)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name="two_wheeler" size={22} filled /> {busy ? 'Creando…' : 'Pedir moto'}
          </button>
        </div>
      </div>
    </div>
  )
}
