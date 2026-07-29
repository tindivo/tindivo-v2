'use client'

import type { PaymentIntent } from '@tindivo/contracts'
import { cn, Icon } from '@tindivo/ui'
import { useState } from 'react'
import { OtpVerificationSheet } from '@/components/otp-verification-sheet'
import { CashSelector } from '@/features/checkout/components/cash-selector'
import { OrderDetail } from '@/features/checkout/components/order-detail'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'
import type { UseCheckoutValidationReturn } from '@/features/checkout/hooks/use-checkout-validation'
import { soles } from '@/features/checkout/lib/format'
import { PAYMENT_OPTIONS, PICKUP_ENABLED } from '@/features/checkout/types'
import { AddressSelectorSheet } from './address-selector-sheet'
import { NameEditSheet } from './name-edit-sheet'

interface UnifiedCheckoutProps {
  checkout: CheckoutViewModel
  validation: UseCheckoutValidationReturn
}

export function UnifiedCheckout({ checkout, validation }: UnifiedCheckoutProps) {
  const {
    name,
    setName,
    phone,
    setVerifiedPhone,
    addresses,
    addressId,
    setAddressId,
    deliveryMethod,
    setDeliveryMethod,
    payment,
    setPayment,
    mustPrepay,
    prepayReason,
    cashChoice,
    setCashChoice,
    cashCustom,
    setCashCustom,
    total,
    subtotal,
    deliveryFee,
    cart,
    loading,
    locating,
    error,
    setError,
    showOtpSheet,
    setShowOtpSheet,
    placeOrder,
    selectedAddress,
    cartHydrated,
    reloadAddresses,
  } = checkout

  const { cashAmount, cashChange, validate } = validation

  const [showNameEdit, setShowNameEdit] = useState(false)
  const [showAddressSelector, setShowAddressSelector] = useState(false)
  const [showOrderDetail, setShowOrderDetail] = useState(false)

  const ctaDisabled = loading || locating || !cartHydrated || cart.count() === 0
  const ctaLabel = locating
    ? 'Verificando ubicación…'
    : loading
      ? 'Enviando…'
      : `Confirmar pedido · ${soles(total)}`

  function handlePaymentSelect(value: PaymentIntent) {
    setPayment(value)
    if (value !== 'pending_cash') {
      setCashChoice('exact')
      setCashCustom('')
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-36 lg:max-w-6xl">
      <div className="border-b border-border bg-surface px-4 pt-3.5 pb-3">
        <div className="t-display text-[22px]">Confirmar pedido</div>
      </div>

      <div className="px-4 pt-3">
        {/* Método de entrega */}
        <Section title="Entrega">
          {PICKUP_ENABLED && (
            <div className="flex gap-2">
              <DeliveryMethodButton
                active={deliveryMethod === 'delivery'}
                onClick={() => setDeliveryMethod('delivery')}
                icon="local_shipping"
                label="Delivery"
              />
              <DeliveryMethodButton
                active={deliveryMethod === 'pickup'}
                onClick={() => setDeliveryMethod('pickup')}
                icon="store"
                label="Recojo"
              />
            </div>
          )}

          {deliveryMethod === 'delivery' ? (
            <button
              type="button"
              onClick={() => setShowAddressSelector(true)}
              className="mt-3 flex w-full items-start gap-3 rounded-[16px] border border-ink/[0.04] bg-card p-3.5 text-left transition-shadow hover:shadow-elev-1"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[18px]">
                {selectedAddress ? '🏠' : '📍'}
              </div>
              <div className="min-w-0 flex-1">
                {selectedAddress ? (
                  <>
                    <div className="font-semibold text-[14px] text-ink">
                      {selectedAddress.label}
                    </div>
                    {selectedAddress.line && (
                      <div className="text-[13px] font-medium text-ink">{selectedAddress.line}</div>
                    )}
                    <div className="mt-0.5 text-[12px] text-ink-muted">
                      {selectedAddress.reference}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-[14px] text-ink">Agregar dirección</div>
                    <div className="text-[12px] text-ink-muted">
                      Necesitamos saber dónde entregar tu pedido.
                    </div>
                  </>
                )}
              </div>
              <Icon name="chevron_right" size={20} className="mt-2 text-ink-subtle" />
            </button>
          ) : (
            <div className="mt-3 flex items-start gap-3 rounded-[16px] border border-ink/[0.04] bg-card p-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[18px]">
                <Icon name="store" size={20} className="text-brand" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14px] text-ink">
                  {cart.businessName || 'Restaurante'}
                </div>
                <div className="text-[12px] text-ink-muted">Recoges tu pedido en el local.</div>
              </div>
            </div>
          )}
        </Section>

        {/* Contacto */}
        <Section title="Datos de contacto">
          <div className="flex items-center justify-between rounded-[16px] border border-ink/[0.04] bg-card p-3.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[14px] text-ink">{name || 'Sin nombre'}</span>
                <button
                  type="button"
                  onClick={() => setShowNameEdit(true)}
                  className="inline-flex items-center text-ink-subtle hover:text-ink"
                  aria-label="Editar nombre"
                >
                  <Icon name="edit" size={16} />
                </button>
              </div>
              <div className="mt-0.5 text-[12px] text-ink-subtle">{phone || 'Sin teléfono'}</div>
            </div>
          </div>
        </Section>

        {/* Pago */}
        <Section title="Método de pago">
          {prepayReason && (
            <div className="mb-3 rounded-xl bg-brand-soft px-3 py-2.5 text-[13px] text-brand-dark">
              {prepayReason}
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            {PAYMENT_OPTIONS.filter((opt) => !mustPrepay || opt.value === 'prepaid').map((opt) => {
              const disabled = mustPrepay && opt.value !== 'prepaid'
              const sel = payment === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePaymentSelect(opt.value)}
                  className={cn(
                    'flex items-center gap-3 rounded-[18px] border bg-card p-4 text-left transition-shadow disabled:opacity-40',
                    sel ? 'border-brand shadow-focus-ring' : 'border-ink/[0.04]',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
                      sel ? 'border-brand' : 'border-ink-subtle',
                    )}
                  >
                    {sel && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {opt.logos.map((logo) => (
                      <img
                        key={logo}
                        src={`/pay/${logo}.svg`}
                        alt={logo === 'cash' ? 'Efectivo' : logo === 'yape' ? 'Yape' : 'Plin'}
                        width={34}
                        height={34}
                        className="rounded-[9px]"
                      />
                    ))}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold text-[15px] text-ink">{opt.label}</span>
                    <span className="block text-[12px] text-ink-muted">{opt.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {payment === 'pending_cash' && (
            <div className="mt-3">
              <CashSelector
                total={total}
                cashChoice={cashChoice}
                setCashChoice={setCashChoice}
                cashCustom={cashCustom}
                setCashCustom={setCashCustom}
                cashAmount={cashAmount}
                cashChange={cashChange}
              />
            </div>
          )}
        </Section>

        {/* Resumen */}
        <Section title="Tu pedido">
          <button
            type="button"
            onClick={() => setShowOrderDetail((s) => !s)}
            className="flex w-full items-center justify-between rounded-[16px] border border-ink/[0.04] bg-card p-3.5 text-left"
          >
            <div>
              <div className="font-semibold text-[14px] text-ink">
                {cart.count()} {cart.count() === 1 ? 'producto' : 'productos'}
              </div>
              <div className="text-[12px] text-ink-muted">{cart.businessName}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[16px] tabular-nums">{soles(subtotal)}</span>
              <Icon
                name="expand_more"
                size={20}
                className={cn(
                  'text-ink-subtle transition-transform',
                  showOrderDetail && 'rotate-180',
                )}
              />
            </div>
          </button>

          {showOrderDetail && (
            <div className="mt-2">
              <OrderDetail />
            </div>
          )}

          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-[14px] text-ink-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{soles(subtotal)}</span>
            </div>
            <div className="flex justify-between text-[14px] text-ink-muted">
              <span>Delivery</span>
              <span className="tabular-nums">
                {deliveryMethod === 'pickup' ? 'S/ 0.00' : soles(deliveryFee)}
              </span>
            </div>
            <div className="flex justify-between border-t border-ink/[0.08] pt-2 text-[17px] font-bold text-ink">
              <span>Total</span>
              <span className="tabular-nums">{soles(total)}</span>
            </div>
          </div>
        </Section>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>

      {/* CTA sticky */}
      <div className="t-sticky-cta mx-auto max-w-[768px]">
        <button
          type="button"
          className="t-btn t-btn-primary t-btn-block"
          disabled={ctaDisabled}
          onClick={() => {
            if (!validate()) return
            placeOrder({ paymentIntent: payment })
          }}
        >
          {ctaLabel}
        </button>
      </div>

      <NameEditSheet
        name={name}
        open={showNameEdit}
        onClose={() => setShowNameEdit(false)}
        onSave={setName}
      />

      <AddressSelectorSheet
        open={showAddressSelector}
        onClose={() => setShowAddressSelector(false)}
        addresses={addresses}
        addressId={addressId}
        onSelect={(id) => {
          setAddressId(id)
          setError(null)
        }}
        onSaved={reloadAddresses}
      />

      <OtpVerificationSheet
        open={showOtpSheet}
        phone={phone}
        onVerified={() => {
          setVerifiedPhone(phone)
          setShowOtpSheet(false)
          setTimeout(() => {
            placeOrder({ paymentIntent: payment })
          }, 300)
        }}
        onClose={() => setShowOtpSheet(false)}
      />
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2.5 t-display text-[17px] text-ink">{title}</h2>
      {children}
    </section>
  )
}

function DeliveryMethodButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-[14px] border py-3 text-[14px] font-semibold transition-all',
        active
          ? 'border-brand bg-brand text-white shadow-glow-brand'
          : 'border-ink/[0.04] bg-card text-ink hover:bg-surface-low',
      )}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  )
}
