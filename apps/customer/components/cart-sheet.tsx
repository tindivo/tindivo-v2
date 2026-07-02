'use client'

import { getOpenStatus } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BottomSheet, Icon, ScreenHeader } from '@/components/ui'
import { useBusinessOrdering } from '@/lib/business-ordering'
import { type CartLine, useCart, useCartHydrated } from '@/lib/cart'
import { buildCartWhatsAppMessage, telLink, waOrderLink } from '@/lib/whatsapp'

const soles = (n: number) => `S/ ${n.toFixed(2)}`

/**
 * CTA(s) de la bolsa según el modo del negocio: checkout web (delivery) o
 * pedido por WhatsApp + llamada (modo catálogo). El modo se resuelve con fetch
 * fresco por negocio — nunca desde el carrito persistido en localStorage.
 */
function CartCtas({ layout, onNavigate }: { layout: 'row' | 'block'; onNavigate?: () => void }) {
  const router = useRouter()
  const cart = useCart()
  const { loading, info } = useBusinessOrdering(cart.businessId)
  const block = layout === 'block'

  // Fuera de horario no hay checkout (los CTAs de WhatsApp nunca se bloquean).
  // Mini-tick para que no quede stale con la hoja abierta un rato.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const closed =
    info?.mode === 'delivery' &&
    info.schedule.length > 0 &&
    getOpenStatus(info.schedule, now).kind === 'closed'

  if (info?.mode === 'whatsapp') {
    if (!info.whatsappNumber) {
      return (
        <p
          className={block ? 'mt-3 text-[13px]' : 'flex-1 text-[13px]'}
          style={{ color: 'rgba(26,22,20,0.55)' }}
        >
          Este negocio aún no configuró su WhatsApp para pedidos.
        </p>
      )
    }
    const href = waOrderLink(
      info.whatsappNumber,
      buildCartWhatsAppMessage(cart.businessName ?? 'negocio', cart.lines, cart.subtotal()),
    )
    return (
      <div className={block ? 'mt-3 flex flex-col gap-2' : 'flex flex-1 items-center gap-2'}>
        <a
          className={`t-btn t-btn-primary ${block ? 't-btn-block' : 'flex-1'}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          Pedir por WhatsApp
        </a>
        <a
          className={`t-btn t-btn-secondary ${block ? 't-btn-block' : ''}`}
          href={telLink(info.whatsappNumber)}
          aria-label="Llamar al negocio"
        >
          <Icon.Phone />
          {block && <span>Llamar</span>}
        </a>
      </div>
    )
  }

  return (
    <div className={block ? 'mt-3' : 'flex flex-1 flex-col gap-1.5'}>
      <button
        type="button"
        className={`t-btn t-btn-primary ${block ? 't-btn-block' : 'w-full'}`}
        disabled={loading || closed}
        onClick={() => {
          onNavigate?.()
          router.push('/checkout')
        }}
      >
        Ir a pagar
      </button>
      {closed && (
        <p
          className={`text-[12px] ${block ? 'mt-1.5' : ''}`}
          style={{ color: 'rgba(26,22,20,0.55)' }}
        >
          El restaurante está cerrado ahora.
        </p>
      )}
    </div>
  )
}

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

/** Estado vacío de la bolsa, reutilizado por la hoja (móvil) y el sidebar (desktop). */
export function CartEmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center">
      <span style={{ color: 'rgba(26,22,20,0.3)' }}>
        <Icon.Bag />
      </span>
      <p className="font-semibold text-[15px]">Tu bolsa está vacía</p>
      <p className="text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
        Agrega productos de un restaurante para empezar.
      </p>
    </div>
  )
}

/**
 * Lista editable de líneas de la bolsa (cantidad, adicionales, nota, eliminar).
 * Reutilizada por la hoja inferior (móvil) y por el sidebar fijo (desktop).
 */
export function CartLineList({ lines }: { lines: CartLine[] }) {
  const cart = useCart()
  return (
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
          {line.imageUrl ? (
            <img
              src={line.imageUrl}
              alt={line.name}
              className="h-12 w-12 shrink-0 rounded-xl object-cover"
            />
          ) : (
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
          )}
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
              <div className="t-qty" style={{ transform: 'scale(0.9)', transformOrigin: 'left' }}>
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
  )
}

/** Hoja de previsualización de la bolsa: ver/editar ítems y notas sin salir de la pantalla. */
export function CartSheet({ onClose }: { onClose: () => void }) {
  const cart = useCart()
  const lines = cart.lines
  const count = cart.count()
  const subtotal = cart.subtotal()

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title="Mi bolsa" onBack={onClose} />
      <div className="t-scroll flex-1 px-4 pt-1 pb-4">
        {count === 0 ? (
          <CartEmptyState />
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
            <CartLineList lines={lines} />
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
          <CartCtas layout="row" onNavigate={onClose} />
        </div>
      )}
    </BottomSheet>
  )
}

/**
 * Bolsa fija en una columna lateral (solo desktop, `lg:`). Sustituye a la barra/​hoja
 * inferior en pantallas anchas: misma lógica de `useCart()` que la hoja, mismo CTA.
 * Vive aquí (no en packages/ui) porque depende del store del cliente.
 */
export function CartSidebar({
  businessId,
  businessName,
}: {
  businessId: string
  businessName: string
}) {
  const hydrated = useCartHydrated()
  const cart = useCart()
  const subtotal = cart.subtotal()
  const count = cart.count()
  // La bolsa es mono-negocio: solo refleja líneas de este restaurante.
  const ownLines = cart.businessId === businessId ? cart.lines : []
  const showCart = hydrated && ownLines.length > 0

  return (
    <div className="rounded-[28px] border border-border bg-white p-5 shadow-elev-2">
      <div className="flex items-center justify-between gap-2">
        <span className="t-display text-[18px]">Mi bolsa</span>
        {showCart && (
          <span
            className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 font-bold text-[12px] text-white tabular-nums"
            style={{ background: '#F97316' }}
          >
            {count}
          </span>
        )}
      </div>
      <div
        className="mt-1 flex items-center gap-2 font-semibold text-[13px]"
        style={{ color: 'rgba(26,22,20,0.6)' }}
      >
        <Icon.Store /> {businessName}
      </div>

      {showCart ? (
        <>
          <div className="mt-3">
            <CartLineList lines={ownLines} />
          </div>
          <div className="mt-4 flex items-center justify-between border-border border-t pt-4">
            <span className="text-[13px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Subtotal
            </span>
            <span className="font-bold text-[18px] tabular-nums">{soles(subtotal)}</span>
          </div>
          <CartCtas layout="block" />
        </>
      ) : (
        <CartEmptyState />
      )}
    </div>
  )
}
