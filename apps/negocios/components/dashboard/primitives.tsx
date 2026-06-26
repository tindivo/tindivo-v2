'use client'

import type { CSSProperties } from 'react'
import type { UiPayment, UiSource } from '@/lib/orders/view-model'

export const FONT_DISPLAY = "var(--font-bricolage), 'Manrope', system-ui, sans-serif"
export const FONT_MONO = "var(--font-jetbrains), 'JetBrains Mono', ui-monospace, monospace"

// ── Material Symbol ───────────────────────────────────────────────────────────
export function MS({
  name,
  size = 20,
  filled = false,
  className = '',
  style = {},
}: {
  name: string
  size?: number
  filled?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`material-symbols-rounded ${className}`}
      aria-hidden
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500`,
        ...style,
      }}
    >
      {name}
    </span>
  )
}

// ── Money / time helpers ──────────────────────────────────────────────────────
export const soles = (n: number) => `S/ ${Number(n).toFixed(2).replace(/\.00$/, '')}`
export const solesPlain = (n: number) => `S/ ${Number(n).toFixed(2)}`
export function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// ── Display maps ──────────────────────────────────────────────────────────────
export const SOURCE_DISPLAY: Record<
  UiSource,
  { label: string; icon: string; bg: string; color: string }
> = {
  web: { label: 'Online', icon: 'language', bg: '#DBEAFE', color: '#1E40AF' },
  manual: { label: 'Directo', icon: 'call', bg: '#FFEDD5', color: '#9A3412' },
}

export const PAY_DISPLAY: Record<UiPayment, { label: string; bg: string; color: string }> = {
  pending_cash: { label: 'Efectivo', bg: '#D1FAE5', color: '#065F46' },
  pending_wallet: { label: 'Billetera', bg: '#EDE9FE', color: '#5B21B6' },
  prepaid: { label: 'Prepago', bg: '#E0F2FE', color: '#0C4A6E' },
  pending_mixed: { label: 'Mixto', bg: '#FEF3C7', color: '#78350F' },
}

export const PAYMENT_META: Record<
  UiPayment,
  { label: string; short: string; icon: string; tone: string }
> = {
  prepaid: { label: 'Ya pagó', short: 'Prepago', icon: 'verified', tone: '#0369A1' },
  pending_wallet: {
    label: 'Cobrar con billetera',
    short: 'Billetera',
    icon: 'qr_code_2',
    tone: '#7C3AED',
  },
  pending_cash: {
    label: 'Cobrar en efectivo',
    short: 'Efectivo',
    icon: 'payments',
    tone: '#15803D',
  },
  pending_mixed: {
    label: 'Billetera + Efectivo',
    short: 'Mixto',
    icon: 'shuffle',
    tone: '#92400E',
  },
}

// Border/status por sub-estado de cocina (de pedidos-data.jsx).
export const COOKING_STATE_STYLE: Record<string, { border: string; borderW: string; bg: string }> =
  {
    cooking: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff' },
    buffer_p1: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff' },
    buffer_p2: { border: '#FDBA74', borderW: '1px', bg: '#fff' },
    buffer_p3: { border: '#FCA5A5', borderW: '1px', bg: '#fff' },
    heading: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff' },
    waiting: { border: '#4ADE80', borderW: '2px', bg: 'rgba(22,163,74,0.025)' },
  }

// ── Badges ────────────────────────────────────────────────────────────────────
export function SourceBadgeMini({ source }: { source: UiSource }) {
  const d = SOURCE_DISPLAY[source] ?? SOURCE_DISPLAY.web
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: 999,
        background: d.bg,
        color: d.color,
        letterSpacing: '0.02em',
      }}
    >
      <MS name={d.icon} size={10} />
      {d.label}
    </span>
  )
}

export function PayBadgeMini({ payment }: { payment: UiPayment }) {
  const d = PAY_DISPLAY[payment] ?? PAY_DISPLAY.pending_cash
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 999,
        background: d.bg,
        color: d.color,
      }}
    >
      {d.label}
    </span>
  )
}

// ── Papelito stripe (franja de color por negocio) ────────────────────────────
export function PapelitoStripe({ color }: { color: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 5,
        background: color,
        borderRadius: '16px 0 0 16px',
      }}
    />
  )
}

// ── Address / reference line ──────────────────────────────────────────────────
export function AddressRefLine({
  method,
  addressRef,
  color = 'var(--tv-ink-muted)',
}: {
  method: string
  addressRef: string | null
  color?: string
}) {
  if (method === 'pickup') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, fontSize: 13 }}>
        <MS name="storefront" size={14} />
        <span style={{ fontWeight: 600 }}>Recojo en local</span>
      </div>
    )
  }
  if (!addressRef) return null
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        color,
        fontSize: 13,
        lineHeight: 1.4,
      }}
    >
      <MS name="location_on" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
      <span style={{ color: 'var(--tv-ink)' }}>{addressRef}</span>
    </div>
  )
}
