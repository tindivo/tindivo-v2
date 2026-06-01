'use client'

import type { ReactNode, SVGProps } from 'react'

/** Set de iconos SVG inline (portado 1:1 del prototipo). */
export const Icon = {
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  Bag: (p: SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M5 8h14l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 8V6a3 3 0 016 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  Back: (p: SVGProps<SVGSVGElement>) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Close: (p: SVGProps<SVGSVGElement>) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  Star: (p: SVGProps<SVGSVGElement>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...p}>
      <path
        d="M12 2l3 6.9L22 10l-5.5 4.7L18 22l-6-3.6L6 22l1.5-7.3L2 10l7-1.1L12 2z"
        fill="currentColor"
      />
    </svg>
  ),
  Clock: (p: SVGProps<SVGSVGElement>) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  Pin: (p: SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M12 22s7-7 7-12a7 7 0 10-14 0c0 5 7 12 7 12z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  Plus: (p: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  Minus: (p: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Upload: (p: SVGProps<SVGSVGElement>) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M12 16V4M7 9l5-5 5 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  Phone: (p: SVGProps<SVGSVGElement>) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Truck: (p: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M3 7h11v9H3V7zM14 11h4l3 3v2h-7v-5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  Store: (p: SVGProps<SVGSVGElement>) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path
        d="M4 8h16l-1.5-4h-13L4 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M5 8v12h14V8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 20v-5h6v5" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  Person: (p: SVGProps<SVGSVGElement>) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 20c2-4 6-5 8-5s6 1 8 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
}

const SUPPORT_WHATSAPP = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '+51987654321').replace(
  /\D/g,
  '',
)

/** Enlace de soporte por WhatsApp con contexto opcional del pedido (portado del prototipo). */
export function SupportLink({ orderShortId }: { orderShortId?: string }) {
  const text = orderShortId
    ? `Hola, necesito ayuda con mi pedido #${orderShortId}`
    : 'Hola, necesito ayuda con la app de Tindivo'
  const href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted"
    >
      <span aria-hidden="true">💬</span>
      ¿Algún problema? <span className="font-semibold text-[#1A8050] underline">Escríbenos</span>
    </a>
  )
}

/** Placeholder rayado para imágenes de producto (hue oklch como en el proto). */
export function ProductImage({
  label,
  hue = 14,
  size = 88,
  compact = false,
}: {
  label?: string
  hue?: number
  size?: number
  compact?: boolean
}) {
  return (
    <div
      className="t-ph-image"
      style={{ width: size, height: size, background: `oklch(0.92 0.03 ${hue})` }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-jetbrains), monospace',
          fontSize: compact ? 9 : 10,
          color: `oklch(0.35 0.1 ${hue})`,
          letterSpacing: '0.05em',
          textAlign: 'center',
          padding: 6,
        }}
      >
        {compact ? '◷' : label}
      </div>
    </div>
  )
}

/** Toggle pill (Delivery/Recojo, etc.). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-[14px] bg-ink/[0.06] p-1">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[14px] transition-colors ${
              active ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'font-medium'
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** Header con back circular + título display (todas las pantallas salvo menú). */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-border border-b bg-surface px-4 pt-3.5 pb-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink"
          aria-label="Volver"
        >
          <Icon.Back />
        </button>
      )}
      <div className="t-display flex-1 text-[22px]">{title}</div>
      {right}
    </div>
  )
}

/** Bottom-sheet modal (slideUp). */
export function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop de modal que cierra al click fuera
    <div
      className="t-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="t-modal-sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
