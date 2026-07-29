import type { DeliveryMethod } from '@tindivo/contracts'
import { Badge, Icon, Segmented } from '@tindivo/ui'
import Link from 'next/link'
import { AddressFields, labelEmoji } from '@/components/address-fields'
import { OrderDetail } from '@/features/checkout/components/order-detail'
import type { CheckoutViewModel } from '@/features/checkout/hooks/use-checkout'
import { soles } from '@/features/checkout/lib/format'
import { PICKUP_ENABLED } from '@/features/checkout/types'

export function DeliveryStep({ checkout }: { checkout: CheckoutViewModel }) {
  const {
    deliveryMethod,
    setDeliveryMethod,
    addresses,
    addressId,
    setAddressId,
    manualAddr,
    setManualAddr,
    setManualInside,
    name,
    setName,
    phone,
    setPhone,
    subtotal,
    deliveryFee,
    total,
    cart,
    error,
  } = checkout

  return (
    <div className="px-4 pt-3 lg:px-0">
      {PICKUP_ENABLED && (
        <Segmented
          value={deliveryMethod}
          onChange={setDeliveryMethod}
          options={[
            {
              value: 'delivery' as DeliveryMethod,
              label: 'Delivery',
              icon: <Icon name="local_shipping" size={20} />,
            },
            {
              value: 'pickup' as DeliveryMethod,
              label: 'Recojo',
              icon: <Icon name="store" size={20} />,
            },
          ]}
        />
      )}

      {deliveryMethod === 'delivery' && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="t-field-label mb-0">Entregar en</span>
            <Link href="/cuenta" className="font-semibold text-[13px] text-brand">
              + Añadir nueva
            </Link>
          </div>
          <div className="mt-2 flex flex-col gap-2.5">
            {addresses.map((a) => {
              const sel = a.id === addressId
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAddressId(a.id)}
                  className={`flex items-start gap-3 rounded-[18px] bg-card p-3.5 text-left transition-all ${
                    sel
                      ? 'border border-brand shadow-focus-ring'
                      : 'border border-ink/[0.04] shadow-elev-1 hover:shadow-elev-2'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-[18px]">
                    {labelEmoji(a.label)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[14px]">{a.label}</span>
                      {a.is_default && (
                        <Badge variant="brand" size="sm" className="uppercase tracking-wide">
                          Por defecto
                        </Badge>
                      )}
                    </div>
                    {a.line && <div className="text-[13px] text-ink/70">{a.line}</div>}
                    <div className="mt-0.5 text-[12px] text-ink/55">{a.reference}</div>
                  </div>
                  {sel && (
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Icon name="check" size={16} filled />
                    </span>
                  )}
                </button>
              )
            })}
            {addresses.length === 0 && (
              <AddressFields
                value={manualAddr}
                onChange={(p) => setManualAddr((a) => ({ ...a, ...p }))}
                onValidityChange={setManualInside}
              />
            )}
          </div>
          <p className="mt-2.5 flex items-start gap-2 text-[12px] text-ink/55">
            <span className="mt-0.5 shrink-0 text-brand">
              <Icon name="location_on" size={18} />
            </span>
            Solo entregamos en la cobertura de San Jacinto. Las direcciones se validan al confirmar.
          </p>
        </div>
      )}

      {/* Datos del usuario: precargados del onboarding, editables aquí. */}
      <label className="mt-5 block">
        <span className="t-field-label">
          Nombre <span className="text-brand">*</span>
        </span>
        <input
          className="t-field"
          placeholder="Tu nombre"
          value={name}
          maxLength={120}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="mt-4 block">
        <span className="t-field-label">
          Teléfono de contacto <span className="text-brand">*</span>
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-2xl border border-border bg-white px-3 py-3.5 font-mono text-[15px] text-ink/60">
            +51
          </span>
          <input
            className="t-field"
            inputMode="numeric"
            placeholder="987654321"
            value={phone}
            maxLength={9}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          />
        </div>
      </label>

      {error && <p className="mt-3 text-danger text-sm">{error}</p>}

      <div className="lg:hidden">
        <OrderDetail />
        <Summary subtotal={subtotal} deliveryFee={deliveryFee} total={total} count={cart.count()} />
      </div>
    </div>
  )
}

function Summary({
  subtotal,
  deliveryFee,
  total,
  count,
}: {
  subtotal: number
  deliveryFee: number
  total: number
  count: number
}) {
  return (
    <div className="mt-5 rounded-[22px] border border-ink/[0.04] bg-white p-4 shadow-elev-1">
      <div className="t-eyebrow mb-2.5">Resumen</div>
      <div className="flex justify-between py-1 text-[14px] font-medium text-ink/70 tabular-nums">
        <span>Productos ({count})</span>
        <span>{soles(subtotal)}</span>
      </div>
      <div className="flex justify-between py-1 text-[14px] font-medium text-ink/70 tabular-nums">
        <span>Delivery</span>
        <span>{soles(deliveryFee)}</span>
      </div>
      <div className="my-2.5 h-px bg-ink/[0.08]" />
      <div className="flex justify-between py-1 text-[17px] font-bold text-ink tabular-nums">
        <span>Total a pagar</span>
        <span>{soles(total)}</span>
      </div>
    </div>
  )
}
