'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import {
  FONT_MONO,
  MS,
  PAYMENT_META,
  SourceBadgeMini,
  soles,
} from '@/components/dashboard/primitives'
import { DashboardShell, useDashboard } from '@/components/dashboard/shell'
import { api } from '@/lib/api'
import { mapPayment } from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// ── Reclamo de cobertura por fraude (sobre un pedido cancelado) ────────────────
function ClaimModal({ orders, onClose }: { orders: HistDisplay[]; onClose: () => void }) {
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '')
  const [amount, setAmount] = useState(String(orders[0]?.total ?? ''))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function pick(id: string) {
    setOrderId(id)
    const o = orders.find((x) => x.id === id)
    if (o) setAmount(String(o.total))
  }

  async function submit() {
    if (!orderId || reason.trim().length < 4) return
    setBusy(true)
    setErr(null)
    try {
      await api.post(
        '/business/fraud-claims',
        { orderId, amount: Number(amount) || 0, reason: reason.trim() },
        crypto.randomUUID(),
      )
      setDone(true)
    } catch (e) {
      setErr(
        e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo enviar el reclamo',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', border: 'none' }}
      />
      <div
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: 460,
          padding: '18px 16px 24px',
        }}
      >
        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <MS name="verified" size={36} filled style={{ color: 'var(--tv-success)' }} />
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>Reclamo enviado</div>
            <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
              Tindivo lo revisará. Si se aprueba, se descuenta de tu próxima liquidación.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="tv-btn tv-btn-block"
              style={{ marginTop: 16, background: 'var(--tv-ink)', color: '#fff' }}
            >
              Listo
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>
              Reclamar cobertura por fraude
            </div>
            <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginBottom: 14 }}>
              Si perdiste dinero por un pedido cancelado, solicita cobertura del fondo.
            </div>

            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>
              PEDIDO CANCELADO
            </div>
            <select
              value={orderId}
              onChange={(e) => pick(e.target.value)}
              className="tv-input"
              style={{ width: '100%', marginBottom: 12 }}
            >
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  #{o.shortId} · {o.customer} · {soles(o.total)}
                </option>
              ))}
            </select>

            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>
              MONTO A RECLAMAR (S/)
            </div>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tv-input"
              style={{ width: '100%', marginBottom: 12 }}
            />

            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>
              MOTIVO
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Describe qué pasó (preparaste el pedido, el cliente no recibió, etc.)"
              className="tv-input"
              style={{ width: '100%', resize: 'vertical' }}
            />

            {err && (
              <div style={{ color: 'var(--tv-danger)', fontSize: 13, marginTop: 8 }}>{err}</div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy || !orderId || reason.trim().length < 4}
              className="tv-btn tv-btn-block"
              style={{
                marginTop: 16,
                background: 'var(--tv-brand)',
                color: '#fff',
                opacity: busy || reason.trim().length < 4 ? 0.5 : 1,
              }}
            >
              {busy ? 'Enviando…' : 'Enviar reclamo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
type HistFilter = 'all' | 'delivered' | 'cancelled' | 'web' | 'manual'

interface HistRow {
  id: string
  short_id: string
  status: string
  source: string
  customer_name: string | null
  order_amount: number
  delivery_fee: number
  payment_intent: string
  delivered_at: string | null
  cancelled_at: string | null
  cancel_note: string | null
  created_at: string
}

// Derived display values
interface HistDisplay {
  id: string
  shortId: string
  status: string
  source: 'web' | 'manual'
  customer: string
  total: number
  payment: ReturnType<typeof mapPayment>
  closedAt: string | null
  cancelReason: string | null
  isCancel: boolean
}

const limaFmt = new Intl.DateTimeFormat('es-PE', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Lima',
})

function fmtTime(iso: string | null): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? limaFmt.format(t) : null
}

function toDisplay(r: HistRow): HistDisplay {
  const src = r.source === 'business_manual' ? 'manual' : ('web' as const)
  return {
    id: r.id,
    shortId: r.short_id,
    status: r.status,
    source: src,
    customer: r.customer_name ?? 'Cliente',
    total: Number(r.order_amount ?? 0) + Number(r.delivery_fee ?? 0),
    payment: mapPayment(r.payment_intent),
    closedAt: fmtTime(r.delivered_at ?? r.cancelled_at),
    cancelReason: r.status === 'cancelled' ? (r.cancel_note ?? null) : null,
    isCancel: r.status === 'cancelled',
  }
}

// ── Summary strip ─────────────────────────────────────────────────────────────
function SummaryStrip({ rows }: { rows: HistDisplay[] }) {
  const delivered = rows.filter((r) => !r.isCancel)
  const cancelled = rows.filter((r) => r.isCancel)
  const revenue = delivered.reduce((s, r) => s + r.total, 0)
  const webCount = rows.filter((r) => r.source === 'web').length
  const manCount = rows.filter((r) => r.source === 'manual').length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '10px 12px',
          border: '1px solid var(--tv-border)',
        }}
      >
        <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>
          VENTAS HOY
        </div>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>
          {soles(revenue)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
          {delivered.length} entregados
        </div>
      </div>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '10px 12px',
          border: '1px solid var(--tv-border)',
        }}
      >
        <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>
          WEB / MANUAL
        </div>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700 }}>
          {webCount}/{manCount}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
          {rows.length} total
        </div>
      </div>
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '10px 12px',
          border: '1px solid var(--tv-border)',
        }}
      >
        <div className="tv-label" style={{ fontSize: 9, marginBottom: 4 }}>
          CANCELADOS
        </div>
        <div
          className="tv-mono"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: cancelled.length > 0 ? 'var(--tv-danger)' : 'var(--tv-ink)',
          }}
        >
          {cancelled.length}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
          {rows.length > 0 ? Math.round((cancelled.length / rows.length) * 100) : 0}% del total
        </div>
      </div>
    </div>
  )
}

// ── Filter chip row ───────────────────────────────────────────────────────────
function FilterChips({
  active,
  counts,
  onChange,
}: {
  active: HistFilter
  counts: Record<HistFilter, number>
  onChange: (f: HistFilter) => void
}) {
  const filters: { id: HistFilter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'delivered', label: 'Entregados' },
    { id: 'cancelled', label: 'Cancelados' },
    { id: 'web', label: 'Web' },
    { id: 'manual', label: 'Manual' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        padding: '2px 0',
      }}
    >
      {filters.map((f) => {
        const on = active === f.id
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            style={{
              flexShrink: 0,
              border: on ? 'none' : '1px solid var(--tv-border)',
              background: on ? 'var(--tv-ink)' : '#fff',
              color: on ? '#fff' : 'var(--tv-ink)',
              padding: '7px 12px',
              borderRadius: 999,
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {f.label}
            <span
              style={{
                minWidth: 16,
                height: 16,
                borderRadius: 999,
                padding: '0 4px',
                background: on ? 'rgba(255,255,255,0.2)' : 'rgba(26,22,20,0.07)',
                color: 'inherit',
                fontSize: 10,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {counts[f.id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Mobile order row ──────────────────────────────────────────────────────────
function MobileOrderRow({ row }: { row: HistDisplay }) {
  const payMeta = PAYMENT_META[row.payment] ?? PAYMENT_META.pending_cash

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--tv-border)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          flexShrink: 0,
          background: row.isCancel ? 'var(--tv-surface)' : 'var(--tv-success-soft)',
          color: row.isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MS name={row.isCancel ? 'cancel' : 'check_circle'} size={20} filled />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 2,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>{row.customer}</span>
          <SourceBadgeMini source={row.source} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'var(--tv-ink-muted)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontFamily: FONT_MONO }}>#{row.shortId}</span>
          {row.closedAt && (
            <>
              <span>·</span>
              <span>{row.closedAt}</span>
            </>
          )}
          <span>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <MS name={payMeta.icon} size={11} /> {payMeta.short}
          </span>
          {row.isCancel && row.cancelReason && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--tv-danger)' }}>{row.cancelReason}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          className="tv-mono"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: row.isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-ink)',
            textDecoration: row.isCancel ? 'line-through' : 'none',
          }}
        >
          {soles(row.total)}
        </div>
        <div
          style={{
            fontSize: 10,
            color: row.isCancel ? 'var(--tv-danger)' : 'var(--tv-success)',
            fontWeight: 600,
            marginTop: 2,
          }}
        >
          {row.isCancel ? 'Cancelado' : 'Entregado'}
        </div>
      </div>
    </div>
  )
}

// ── Desktop table ─────────────────────────────────────────────────────────────
function DesktopTable({ rows }: { rows: HistDisplay[] }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid var(--tv-border)',
          padding: '48px 20px',
          textAlign: 'center',
          color: 'var(--tv-ink-subtle)',
        }}
      >
        <MS name="history" size={32} />
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>
          Sin pedidos registrados hoy
        </div>
        <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
          Los pedidos entregados y cancelados de la jornada aparecerán aquí.
        </div>
      </div>
    )
  }

  const COLS = '36px 1fr 120px 100px 120px 80px'

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid var(--tv-border)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: COLS,
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid var(--tv-border)',
          background: 'var(--tv-surface)',
        }}
      >
        {(['', 'CLIENTE', 'ORIGEN', 'PAGO', 'HORA', 'TOTAL'] as const).map((h) => (
          <div key={h} className="tv-label" style={{ fontSize: 10 }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, i) => {
        const payMeta = PAYMENT_META[row.payment] ?? PAYMENT_META.pending_cash
        return (
          <div
            key={row.id}
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              gap: 12,
              padding: '12px 16px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--tv-border)' : 'none',
              alignItems: 'center',
              background: row.isCancel ? '#FAFAFA' : '#fff',
            }}
          >
            {/* Icon */}
            <div>
              <MS
                name={row.isCancel ? 'cancel' : 'check_circle'}
                size={18}
                filled
                style={{
                  color: row.isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-success)',
                }}
              />
            </div>
            {/* Customer */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{row.customer}</div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--tv-ink-muted)',
                  fontFamily: FONT_MONO,
                }}
              >
                #{row.shortId}
              </div>
            </div>
            {/* Source */}
            <div>
              <SourceBadgeMini source={row.source} />
            </div>
            {/* Payment */}
            <div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  color: 'var(--tv-ink-muted)',
                }}
              >
                <MS name={payMeta.icon} size={13} /> {payMeta.short}
              </span>
            </div>
            {/* Time */}
            <div>
              {row.closedAt && (
                <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 600 }}>
                  {row.closedAt}
                </div>
              )}
              {row.isCancel && row.cancelReason && (
                <div style={{ fontSize: 11, color: 'var(--tv-danger)', marginTop: 1 }}>
                  {row.cancelReason}
                </div>
              )}
            </div>
            {/* Total */}
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 14,
                fontWeight: 700,
                textAlign: 'right',
                color: row.isCancel ? 'var(--tv-ink-subtle)' : 'var(--tv-ink)',
                textDecoration: row.isCancel ? 'line-through' : 'none',
              }}
            >
              {soles(row.total)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Inner view ────────────────────────────────────────────────────────────────
function HistorialView() {
  const { bizId } = useDashboard()
  const [rawRows, setRawRows] = useState<HistRow[]>([])
  const [filter, setFilter] = useState<HistFilter>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [claimOpen, setClaimOpen] = useState(false)

  const load = useCallback(async () => {
    // Build today's date range in Lima time (UTC-5)
    const now = new Date()
    const limaOffset = -5 * 60 // minutes
    const limaMs = now.getTime() + (now.getTimezoneOffset() + limaOffset) * 60 * 1000
    const lima = new Date(limaMs)
    const y = lima.getFullYear()
    const m = String(lima.getMonth() + 1).padStart(2, '0')
    const d = String(lima.getDate()).padStart(2, '0')
    const todayStart = `${y}-${m}-${d}T00:00:00-05:00`
    const todayEnd = `${y}-${m}-${d}T23:59:59-05:00`

    const { data, error: e } = await getSupabaseBrowser()
      .from('orders')
      .select(
        'id,short_id,status,source,customer_name,order_amount,delivery_fee,payment_intent,delivered_at,cancelled_at,cancel_note,created_at',
      )
      .eq('business_id', bizId)
      .in('status', ['delivered', 'cancelled'])
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: false })
      .limit(200)

    if (e) setError(e.message)
    else setRawRows((data ?? []) as HistRow[])
  }, [bizId])

  useEffect(() => {
    load()
  }, [load])

  // Map to display rows
  const allDisplayRows = rawRows.map(toDisplay)

  // Apply status/source filter
  const filterFn = (r: HistDisplay): boolean => {
    if (filter === 'delivered') return !r.isCancel
    if (filter === 'cancelled') return r.isCancel
    if (filter === 'web') return r.source === 'web'
    if (filter === 'manual') return r.source === 'manual'
    return true
  }

  // Apply search
  const searchFn = (r: HistDisplay): boolean => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.customer.toLowerCase().includes(q) || r.shortId.toLowerCase().includes(q)
  }

  const visibleRows = allDisplayRows.filter(filterFn).filter(searchFn)

  const counts: Record<HistFilter, number> = {
    all: allDisplayRows.length,
    delivered: allDisplayRows.filter((r) => !r.isCancel).length,
    cancelled: allDisplayRows.filter((r) => r.isCancel).length,
    web: allDisplayRows.filter((r) => r.source === 'web').length,
    manual: allDisplayRows.filter((r) => r.source === 'manual').length,
  }

  const cancelledRows = allDisplayRows.filter((r) => r.isCancel)

  return (
    <>
      {error && (
        <div
          style={{
            background: 'var(--tv-danger-soft)',
            color: 'var(--tv-danger)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div style={{ marginBottom: 16 }}>
        <SummaryStrip rows={allDisplayRows} />
      </div>

      {cancelledRows.length > 0 && (
        <button
          type="button"
          onClick={() => setClaimOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#fff',
            border: '1px solid var(--tv-border)',
            borderRadius: 12,
            padding: '8px 12px',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--tv-ink)',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          <MS name="gavel" size={16} style={{ color: 'var(--tv-brand)' }} /> Reclamar cobertura por
          fraude
        </button>
      )}
      {claimOpen && <ClaimModal orders={cancelledRows} onClose={() => setClaimOpen(false)} />}

      {/* Desktop toolbar */}
      <div
        className="hidden lg:flex"
        style={{
          background: '#fff',
          borderRadius: 14,
          padding: '10px 14px',
          border: '1px solid var(--tv-border)',
          marginBottom: 14,
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* Search */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MS name="search" size={18} style={{ color: 'var(--tv-ink-muted)', flexShrink: 0 }} />
          <input
            style={{
              border: 'none',
              outline: 'none',
              fontSize: 14,
              fontFamily: 'inherit',
              color: 'var(--tv-ink)',
              background: 'transparent',
              width: '100%',
            }}
            placeholder="Buscar por nombre o #ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Filter chips */}
        <FilterChips active={filter} counts={counts} onChange={setFilter} />
      </div>

      {/* Mobile filters + search */}
      <div className="lg:hidden" style={{ marginBottom: 10 }}>
        <FilterChips active={filter} counts={counts} onChange={setFilter} />
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            borderRadius: 12,
            border: '1px solid var(--tv-border)',
            padding: '10px 12px',
          }}
        >
          <MS name="search" size={18} style={{ color: 'var(--tv-ink-muted)', flexShrink: 0 }} />
          <input
            style={{
              border: 'none',
              outline: 'none',
              fontSize: 14,
              fontFamily: 'inherit',
              color: 'var(--tv-ink)',
              background: 'transparent',
              width: '100%',
            }}
            placeholder="Buscar por nombre o #ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Mobile list */}
      <div className="lg:hidden flex flex-col" style={{ gap: 6 }}>
        {visibleRows.length === 0 ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid var(--tv-border)',
              padding: '48px 20px',
              textAlign: 'center',
              color: 'var(--tv-ink-subtle)',
            }}
          >
            <MS name="history" size={32} />
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>
              Sin pedidos registrados hoy
            </div>
          </div>
        ) : (
          visibleRows.map((r) => <MobileOrderRow key={r.id} row={r} />)
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <DesktopTable rows={visibleRows} />
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NegocioHistorialPage() {
  return (
    <DashboardShell
      active="historial"
      title="Historial del día"
      subtitle="Pedidos completados y cancelados de la jornada — solo lectura"
    >
      <HistorialView />
    </DashboardShell>
  )
}
