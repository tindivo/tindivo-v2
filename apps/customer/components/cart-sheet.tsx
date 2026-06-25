'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { BottomSheet, Icon, ScreenHeader } from '@/components/ui'
import { useCart, useCartHydrated } from '@/lib/cart'

const soles = (n: number) => `S/ ${n.toFixed(2)}`

/** Icono de bolsa con contador para la topbar; abre la hoja de previsualización. */
export function CartButton({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [open, setOpen] = useState(false)
  const hydrated = useCartHydrated()
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0))
  const badge = hydrated ? count : 0
  const dark = tone === 'dark'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-[42px] w-[42px] items-center justify-center rounded-full"
        style={
          dark
            ? {
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.45)',
                color: '#fff',
              }
            : { background: 'rgba(26,22,20,0.06)', color: '#1A1614' }
        }
        aria-label={badge > 0 ? `Mi bolsa, ${badge} ítems` : 'Mi bolsa'}
      >
        <Icon.Bag />
        {badge > 0 && (
          <span
            className="absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-bold text-[10px] text-white tabular-nums"
            style={{ top: -2, right: -2, background: '#F97316' }}
          >
            {badge}
          </span>
        )}
      </button>
      {open && <CartSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** Hoja de previsualización de la bolsa: ver/editar ítems y notas sin salir de la pantalla. */
export function CartSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const cart = useCart()
  const lines = cart.lines
  const count = cart.count()
  const subtotal = cart.subtotal()

  function goToCheckout() {
    onClose()
    router.push('/checkout')
  }

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title="Mi bolsa" onBack={onClose} />
      <div className="t-scroll flex-1 px-4 pt-1 pb-4">
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <span style={{ color: 'rgba(26,22,20,0.3)' }}>
              <Icon.Bag />
            </span>
            <p className="font-semibold text-[15px]">Tu bolsa está vacía</p>
            <p className="text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Agrega productos de un restaurante para empezar.
            </p>
          </div>
        ) : (
          <>
            {cart.businessName && (
              <div
                className="mb-1 flex items-center gap-2 pt-1 pb-2 font-semibold text-[13px]"
                style={{ color: 'rgba(26,22,20,0.6)' }}
              >
                <Icon.Store /> {cart.businessName}
              </div>
            )}
            <div className="flex flex-col">
              {lines.map((line, i) => (
                <div
                  key={line.key}
                  className="flex items-start gap-3 pt-3.5"
                  style={{
                    borderTop: i > 0 ? '1px solid rgba(26,22,20,0.05)' : 'none',
                    marginTop: i > 0 ? 14 : 0,
                  }}
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-[18px]"
                    style={{
                      background: `oklch(0.92 0.04 ${line.hue})`,
                      color: `oklch(0.42 0.12 ${line.hue})`,
                    }}
                  >
                    {line.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-[14px] leading-snug">
                        <span className="tabular-nums">{line.quantity}×</span> {line.name}
                      </div>
                      <div className="shrink-0 font-semibold text-[14px] tabular-nums">
                        {soles(line.unitPrice * line.quantity)}
                      </div>
                    </div>

                    {line.modifiers.length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {line.modifiers.map((m) => (
                          <div
                            key={`${line.key}-${m.optionId}`}
                            className="text-[12px]"
                            style={{ color: 'rgba(26,22,20,0.6)' }}
                          >
                            <span style={{ color: 'rgba(26,22,20,0.4)' }}>{m.groupName}: </span>
                            {m.optionName}
                          </div>
                        ))}
                      </div>
                    )}

                    {line.note && (
                      <div
                        className="mt-1.5 rounded-lg px-2.5 py-1.5 text-[12px]"
                        style={{ background: 'rgba(249,115,22,0.07)', color: '#9A3412' }}
                      >
                        <span className="font-semibold">Nota: </span>
                        {line.note}
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between">
                      <div
                        className="t-qty"
                        style={{ transform: 'scale(0.9)', transformOrigin: 'left' }}
                      >
                        <button
                          type="button"
                          onClick={() => cart.setQty(line.key, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label="Menos"
                        >
                          <Icon.Minus />
                        </button>
                        <span className="val">{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => cart.setQty(line.key, line.quantity + 1)}
                          aria-label="Más"
                        >
                          <Icon.Plus />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => cart.remove(line.key)}
                        className="rounded-lg px-2.5 py-1.5 font-medium text-[12px]"
                        style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626' }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {count > 0 && (
        <div className="flex items-center gap-3 border-border border-t bg-surface px-4 pt-3.5 pb-6">
          <div>
            <div className="text-[11px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Subtotal
            </div>
            <div className="font-bold text-[18px] tabular-nums">{soles(subtotal)}</div>
          </div>
          <button type="button" className="t-btn t-btn-primary flex-1" onClick={goToCheckout}>
            Ir a pagar
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
