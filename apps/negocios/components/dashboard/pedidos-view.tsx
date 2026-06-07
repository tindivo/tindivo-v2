'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { OrderVM } from '@/lib/orders/view-model'
import { sortCooking } from '@/lib/orders/view-model'
import { CocinaCard, NuevoCard, RepartoCard } from './cards'
import { type DetailActions, type DetailItem, DetailScreen, PausarModal } from './pedido-detail'
import { MS, SourceBadgeMini, soles } from './primitives'

export interface PedidosViewProps {
  bizName: string
  accent: string
  paused: boolean
  pauseMinLeft: number | null
  soundOn: boolean
  onToggleSound: () => void
  onOpenPause: () => void
  onResume: () => void
  counts: { new: number; cooking: number; route: number; today: number }
  newOrders: OrderVM[]
  cookingOrders: OrderVM[]
  routeOrders: OrderVM[]
  history: OrderVM[]
  onOpen: (o: OrderVM) => void
  onSignOut: () => void
  selected: OrderVM | null
  detailItems: DetailItem[] | null
  detailProofUrl: string | null
  qrUrl: string | null
  detailBusy: boolean
  actions: DetailActions
  showPauseModal: boolean
  onClosePause: () => void
  onConfirmPause: (min: number | null) => void
}

const ACCENT = '#F472B6'

// ── Bottom nav (mobile) ───────────────────────────────────────────────────────
function MobileBottomNav() {
  return (
    <div className="tv-bottom-nav">
      <Link href="/" className="active" style={navBtnStyle(true)}>
        <MS name="receipt_long" size={22} filled />
        <span>Pedidos</span>
      </Link>
      <Link href="/menu" style={navBtnStyle(false)}>
        <MS name="restaurant_menu" size={22} />
        <span>Menú</span>
      </Link>
      <Link href="/nuevo" className="fab">
        <MS name="add" size={28} filled />
      </Link>
      <Link href="/efectivo" style={navBtnStyle(false)}>
        <MS name="payments" size={22} />
        <span>Efectivo</span>
      </Link>
      <Link href="/configuracion" style={navBtnStyle(false)}>
        <MS name="more_horiz" size={22} />
        <span>Más</span>
      </Link>
    </div>
  )
}

function navBtnStyle(active: boolean) {
  return {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    padding: '6px 4px',
    fontFamily: 'inherit',
    fontSize: 10,
    color: active ? 'var(--tv-brand)' : 'var(--tv-ink-muted)',
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 10,
    textDecoration: 'none',
  }
}

// ── Sidebar (desktop) ─────────────────────────────────────────────────────────
function DesktopSidebar({
  bizName,
  accent,
  counts,
  paused,
  onSignOut,
}: {
  bizName: string
  accent: string
  counts: PedidosViewProps['counts']
  paused: boolean
  onSignOut: () => void
}) {
  const items = [
    { id: 'pedidos', label: 'Pedidos', icon: 'receipt_long', href: '/', badge: counts.new },
    { id: 'menu', label: 'Menú', icon: 'restaurant_menu', href: '/menu' },
    { id: 'add', label: 'Pedir moto', icon: 'two_wheeler', href: '/nuevo' },
    { id: 'efectivo', label: 'Efectivo', icon: 'payments', href: '/efectivo' },
    { id: 'deuda', label: 'Deuda', icon: 'account_balance_wallet', href: '/deuda' },
    { id: 'config', label: 'Config', icon: 'settings', href: '/configuracion' },
  ]
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid var(--tv-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 18px' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: accent,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 17,
            fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
          }}
        >
          {bizName[0] ?? 'T'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="tv-display" style={{ fontSize: 16, lineHeight: 1.1 }}>
            {bizName}
          </div>
          <div className="tv-label" style={{ marginTop: 2, fontSize: 9 }}>
            SAN JACINTO · ÁNCASH
          </div>
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it) => {
          const active = it.id === 'pedidos'
          return (
            <Link
              key={it.id}
              href={it.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: active ? 'var(--tv-ink)' : 'transparent',
                color: active ? '#fff' : 'var(--tv-ink)',
                textDecoration: 'none',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <MS name={it.icon} size={20} filled={active} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {it.badge != null && it.badge > 0 && (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: 999,
                    background: active ? 'var(--tv-brand)' : 'var(--tv-danger)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                  }}
                >
                  {it.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div style={{ flex: 1 }} />
      <div
        className="tv-card"
        style={{ padding: 12, marginBottom: 10, background: '#FFF4EC', boxShadow: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MS name="circle" size={10} filled style={{ color: paused ? '#B45309' : '#16A34A' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {paused ? 'Pausado' : 'Plataforma abierta'}
          </div>
        </div>
        <div className="tv-label" style={{ fontSize: 9, marginTop: 4 }}>
          {paused ? 'NO RECIBE PEDIDOS WEB' : 'RECIBIENDO PEDIDOS'}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 6px',
          borderTop: '1px solid var(--tv-border)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: 'var(--tv-brand-soft)',
            color: 'var(--tv-brand-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {bizName[0] ?? 'T'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Caja</div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Salir"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(26,22,20,0.06)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MS name="logout" size={18} />
        </button>
      </div>
    </aside>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────
function ColEmpty({ tab }: { tab: 'new' | 'cooking' | 'route' | 'today' }) {
  const msgs = {
    new: {
      icon: 'notifications',
      title: 'Sin pedidos nuevos',
      sub: 'Te avisaremos al instante cuando lleguen.',
    },
    cooking: {
      icon: 'soup_kitchen',
      title: 'Nada en preparación',
      sub: 'Los pedidos aceptados aparecerán aquí.',
    },
    route: {
      icon: 'delivery_dining',
      title: 'Sin pedidos en camino',
      sub: 'Aquí aparecen cuando el motorizado recoge.',
    },
    today: {
      icon: 'check_circle',
      title: 'Sin pedidos cerrados',
      sub: 'El historial del turno aparece aquí.',
    },
  }
  const m = msgs[tab]
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '32px 20px',
        textAlign: 'center',
        background: '#fff',
        borderRadius: 16,
        border: '1px solid var(--tv-border)',
      }}
    >
      <MS name={m.icon} size={32} style={{ color: 'var(--tv-ink-subtle)', marginBottom: 10 }} />
      <div style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</div>
      <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 4 }}>{m.sub}</div>
    </div>
  )
}

function HistoryList({ history }: { history: OrderVM[] }) {
  if (history.length === 0) return <ColEmpty tab="today" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {history.map((h) => {
        const cancelled = h.status === 'cancelled'
        return (
          <div
            key={h.rowId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid var(--tv-border)',
              opacity: cancelled ? 0.65 : 1,
            }}
          >
            <MS
              name={cancelled ? 'cancel' : 'check_circle'}
              size={18}
              filled
              style={{
                color: cancelled ? 'var(--tv-ink-subtle)' : 'var(--tv-success)',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 5, flexWrap: 'wrap' }}
              >
                {h.customer ?? 'Cliente'}
                <SourceBadgeMini source={h.source} />
              </div>
              <div className="tv-mono" style={{ fontSize: 11, color: 'var(--tv-ink-muted)' }}>
                #{h.id}
                {h.closedAt ? ` · ${h.closedAt}` : ''}
                {cancelled && h.cancelReason && (
                  <span style={{ color: 'var(--tv-danger)' }}> · {h.cancelReason}</span>
                )}
              </div>
            </div>
            <div
              className="tv-mono"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: cancelled ? 'var(--tv-ink-subtle)' : 'var(--tv-ink)',
                textDecoration: cancelled ? 'line-through' : 'none',
                flexShrink: 0,
              }}
            >
              {soles(h.total)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── MOBILE ────────────────────────────────────────────────────────────────────
export function PedidosMobile(p: PedidosViewProps) {
  const [tab, setTab] = useState<'new' | 'cooking' | 'route' | 'today'>('new')
  const cooking = [...p.cookingOrders].sort(sortCooking)
  const hasWaiting = p.cookingOrders.some((o) => o.state === 'waiting')

  const tabs = [
    { id: 'new' as const, label: 'Nuevos', count: p.counts.new, alert: p.counts.new > 0 },
    { id: 'cooking' as const, label: 'En cocina', count: p.counts.cooking, alert: false },
    { id: 'route' as const, label: 'Reparto', count: p.counts.route, alert: false },
    { id: 'today' as const, label: 'Entregados', count: p.counts.today, alert: false },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: 'var(--tv-surface)',
        position: 'relative',
      }}
    >
      {p.showPauseModal && (
        <PausarModal busy={p.detailBusy} onClose={p.onClosePause} onConfirm={p.onConfirmPause} />
      )}
      {p.selected && (
        <DetailScreen
          order={p.selected}
          items={p.detailItems}
          proofUrl={p.detailProofUrl}
          qrUrl={p.qrUrl}
          busy={p.detailBusy}
          mobile
          actions={p.actions}
        />
      )}

      {/* Banners */}
      {p.paused && (
        <div
          style={{
            background: '#FDE68A',
            color: '#78350F',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <MS name="pause_circle" size={18} filled />
          <span style={{ flex: 1 }}>PAUSADO{p.pauseMinLeft ? ` · ${p.pauseMinLeft}m` : ''}</span>
          <button
            type="button"
            onClick={p.onResume}
            style={{
              background: '#1A1614',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reanudar
          </button>
        </div>
      )}
      {hasWaiting && !p.paused && (
        <div
          style={{
            background: '#16A34A',
            color: '#fff',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <MS name="two_wheeler" size={18} filled />
          Motorizado en el local · entrégale el pedido
        </div>
      )}

      {/* Header */}
      <div className="tv-glass" style={{ padding: '10px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: p.accent || ACCENT,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
              flexShrink: 0,
            }}
          >
            {p.bizName[0] ?? 'T'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="tv-display"
              style={{
                fontSize: 16,
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p.bizName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 1 }}>
              {p.counts.new + p.counts.cooking + p.counts.route} activos · {p.counts.today}{' '}
              entregados hoy
            </div>
          </div>
          <button
            type="button"
            onClick={p.onToggleSound}
            className={`tv-btn tv-btn-sm ${p.soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} ${p.counts.new > 0 && p.soundOn ? 'tv-pulse-brand' : ''}`}
            style={{ padding: '7px 10px', flexShrink: 0 }}
          >
            <MS
              name={p.soundOn ? 'notifications_active' : 'notifications_off'}
              size={17}
              filled={p.soundOn}
            />
          </button>
          <button
            type="button"
            onClick={p.paused ? p.onResume : p.onOpenPause}
            style={{
              background: p.paused ? '#FDE68A' : 'rgba(26,22,20,0.08)',
              border: 'none',
              borderRadius: 10,
              padding: '7px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: p.paused ? '#78350F' : 'var(--tv-ink)',
              flexShrink: 0,
            }}
          >
            <MS name={p.paused ? 'play_circle' : 'pause_circle'} size={17} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, paddingBottom: 10 }}>
          <button
            type="button"
            onClick={() => setTab('today')}
            className="tv-btn tv-btn-ghost tv-btn-sm"
            style={{ flex: 1 }}
          >
            <MS name="history" size={14} /> Historial
          </button>
          <Link
            href="/nuevo"
            className="tv-btn tv-btn-dark tv-btn-sm"
            style={{ flex: 1, textDecoration: 'none' }}
          >
            <MS name="add" size={14} /> Pedido directo
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 5,
          padding: '8px 14px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          background: 'rgba(250,246,241,0.96)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--tv-border)',
        }}
      >
        {tabs.map(
          (t) =>
            (t.id !== 'new' || t.count > 0) && (
              <button
                type="button"
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flexShrink: 0,
                  background: tab === t.id ? 'var(--tv-ink)' : '#fff',
                  color: tab === t.id ? '#fff' : 'var(--tv-ink)',
                  border: tab === t.id ? 'none' : '1px solid var(--tv-border)',
                  padding: '8px 11px',
                  borderRadius: 999,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span
                    style={{
                      minWidth: 17,
                      height: 17,
                      padding: '0 4px',
                      borderRadius: 999,
                      background: t.alert
                        ? '#DC2626'
                        : tab === t.id
                          ? 'rgba(255,255,255,0.2)'
                          : 'rgba(26,22,20,0.08)',
                      color: t.alert ? '#fff' : tab === t.id ? '#fff' : 'var(--tv-ink)',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ),
        )}
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {tab === 'new' &&
          (p.newOrders.length > 0 ? (
            p.newOrders.map((o) => <NuevoCard key={o.rowId} order={o} onOpen={p.onOpen} />)
          ) : (
            <ColEmpty tab="new" />
          ))}
        {tab === 'cooking' &&
          (cooking.length > 0 ? (
            cooking.map((o) => <CocinaCard key={o.rowId} order={o} onOpen={p.onOpen} />)
          ) : (
            <ColEmpty tab="cooking" />
          ))}
        {tab === 'route' &&
          (p.routeOrders.length > 0 ? (
            p.routeOrders.map((o) => <RepartoCard key={o.rowId} order={o} onOpen={p.onOpen} />)
          ) : (
            <ColEmpty tab="route" />
          ))}
        {tab === 'today' && <HistoryList history={p.history} />}
      </div>

      <MobileBottomNav />
    </div>
  )
}

// ── DESKTOP ───────────────────────────────────────────────────────────────────
function KanbanCol({
  title,
  count,
  accentColor,
  alertColor,
  subtitle,
  children,
}: {
  title: string
  count: number
  accentColor: string
  alertColor?: string | null
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--tv-surface)',
        borderRadius: 16,
        border: '1px solid var(--tv-border)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--tv-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{ width: 8, height: 8, borderRadius: 999, background: accentColor, flexShrink: 0 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 10, color: 'var(--tv-ink-muted)', marginTop: 1 }}>{subtitle}</div>
        </div>
        <span
          style={{
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            borderRadius: 999,
            background: count > 0 && alertColor ? alertColor : 'rgba(26,22,20,0.08)',
            color: count > 0 && alertColor ? '#fff' : 'var(--tv-ink)',
            fontSize: 11,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {count}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflowY: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function PedidosDesktop(p: PedidosViewProps) {
  const cooking = [...p.cookingOrders].sort(sortCooking)
  const hasWaiting = p.cookingOrders.some((o) => o.state === 'waiting')

  return (
    <div style={{ display: 'flex', height: '100dvh', background: 'var(--tv-surface)' }}>
      <DesktopSidebar
        bizName={p.bizName}
        accent={p.accent || ACCENT}
        counts={p.counts}
        paused={p.paused}
        onSignOut={p.onSignOut}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          position: 'relative',
        }}
      >
        {p.showPauseModal && (
          <PausarModal busy={p.detailBusy} onClose={p.onClosePause} onConfirm={p.onConfirmPause} />
        )}

        {/* Banners */}
        {p.paused && (
          <div
            style={{
              background: '#FDE68A',
              color: '#78350F',
              padding: '9px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <MS name="pause_circle" size={20} filled />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
              PEDIDOS PAUSADOS{p.pauseMinLeft ? ` · Reactiva en ${p.pauseMinLeft}m` : ''}
            </div>
            <button type="button" onClick={p.onResume} className="tv-btn tv-btn-dark tv-btn-sm">
              <MS name="play_circle" size={16} filled /> Reanudar ahora
            </button>
          </div>
        )}
        {hasWaiting && (
          <div
            style={{
              background: '#16A34A',
              color: '#fff',
              padding: '9px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <MS name="two_wheeler" size={20} filled />
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>
              Motorizado en el local — entrégale el pedido
            </div>
          </div>
        )}

        {/* Header */}
        <div
          className="tv-glass"
          style={{ padding: '11px 24px', display: 'flex', alignItems: 'center', gap: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: p.accent || ACCENT,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
              }}
            >
              {p.bizName[0] ?? 'T'}
            </div>
            <div>
              <div className="tv-display" style={{ fontSize: 17, lineHeight: 1.1 }}>
                {p.bizName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
                <span style={{ color: p.paused ? '#B45309' : '#16A34A', fontWeight: 700 }}>
                  {p.paused ? '⏸ Pausado' : '● Abierto'}
                </span>
                {' · '}
                {p.counts.new} nuevos · {p.counts.cooking} cocina · {p.counts.route} reparto ·{' '}
                {p.counts.today} hoy
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link
              href="/nuevo"
              className="tv-btn tv-btn-dark tv-btn-sm"
              style={{ textDecoration: 'none' }}
            >
              <MS name="add" size={15} /> Pedido directo
            </Link>
            <button
              type="button"
              onClick={p.paused ? p.onResume : p.onOpenPause}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                border: 'none',
                background: p.paused ? '#FDE68A' : 'rgba(26,22,20,0.08)',
                color: p.paused ? '#78350F' : 'var(--tv-ink)',
              }}
            >
              <MS name={p.paused ? 'play_circle' : 'pause_circle'} size={16} filled />
              {p.paused ? 'Reanudar' : 'Pausar pedidos'}
            </button>
            <button
              type="button"
              onClick={p.onToggleSound}
              className={`tv-btn tv-btn-sm ${p.soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} ${p.counts.new > 0 && p.soundOn ? 'tv-pulse-brand' : ''}`}
            >
              <MS
                name={p.soundOn ? 'notifications_active' : 'notifications_off'}
                size={15}
                filled={p.soundOn}
              />
              Alertas {p.soundOn ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Urgent bar */}
        {p.counts.new > 0 && (
          <div
            style={{
              margin: '10px 20px 0',
              background: '#fff',
              borderRadius: 12,
              border: '1.5px solid #FCA5A5',
              padding: '9px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <MS
              name="notifications_active"
              size={20}
              filled
              style={{ color: 'var(--tv-danger)', flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {p.counts.new}{' '}
                {p.counts.new === 1 ? 'pedido nuevo requiere' : 'pedidos nuevos requieren'} revisión
              </div>
              <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                Toca cada card para ver el detalle y aceptar o rechazar. Se cancelan automáticamente
                en 5 min.
              </div>
            </div>
          </div>
        )}

        {/* Kanban 3 columnas */}
        <div
          style={{
            flex: 1,
            padding: '12px 20px 20px',
            display: 'grid',
            gridTemplateColumns: '1fr 1.4fr 0.9fr',
            gap: 12,
            alignItems: 'stretch',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <KanbanCol
            title="Nuevos"
            count={p.counts.new}
            accentColor="#DC2626"
            alertColor={p.counts.new > 0 ? '#DC2626' : null}
            subtitle="Revisar antes de aceptar"
          >
            {p.newOrders.length > 0 ? (
              p.newOrders.map((o) => (
                <NuevoCard key={o.rowId} order={o} compact onOpen={p.onOpen} />
              ))
            ) : (
              <div
                style={{
                  padding: '20px 10px',
                  textAlign: 'center',
                  color: 'var(--tv-ink-subtle)',
                  fontSize: 12,
                }}
              >
                Sin pedidos nuevos · te avisaremos cuando lleguen
              </div>
            )}
          </KanbanCol>

          <KanbanCol
            title="En cocina"
            count={p.counts.cooking}
            accentColor="#C2410C"
            subtitle="Cocinando + esperando moto"
          >
            {cooking.length > 0 ? (
              cooking.map((o) => <CocinaCard key={o.rowId} order={o} compact onOpen={p.onOpen} />)
            ) : (
              <div
                style={{
                  padding: '20px 10px',
                  textAlign: 'center',
                  color: 'var(--tv-ink-subtle)',
                  fontSize: 12,
                }}
              >
                Nada en preparación
              </div>
            )}
          </KanbanCol>

          <KanbanCol
            title="En reparto"
            count={p.counts.route}
            accentColor="#6D28D9"
            subtitle="Solo monitoreo · timer desde recogida"
          >
            {p.routeOrders.length > 0 ? (
              p.routeOrders.map((o) => (
                <RepartoCard key={o.rowId} order={o} compact onOpen={p.onOpen} />
              ))
            ) : (
              <div
                style={{
                  padding: '20px 10px',
                  textAlign: 'center',
                  color: 'var(--tv-ink-subtle)',
                  fontSize: 12,
                }}
              >
                Sin pedidos en camino
              </div>
            )}
          </KanbanCol>
        </div>

        {/* Detail side panel */}
        {p.selected && (
          <DetailScreen
            order={p.selected}
            items={p.detailItems}
            proofUrl={p.detailProofUrl}
            qrUrl={p.qrUrl}
            busy={p.detailBusy}
            actions={p.actions}
          />
        )}
      </div>
    </div>
  )
}
