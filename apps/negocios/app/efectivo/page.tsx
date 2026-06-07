'use client'

import { ApiError } from '@tindivo/api-client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { FONT_MONO, MS, soles } from '@/components/dashboard/primitives'
import { DashboardShell, useDashboard } from '@/components/dashboard/shell'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────
interface CashRow {
  id: string
  settlement_date: string
  total_cash: number
  delivered_amount: number | null
  confirmed_amount: number | null
  reported_amount: number | null
  status: string
}

// ── KPI card ──────────────────────────────────────────────────────────────────
type KpiTone = 'brand' | 'warning' | 'danger' | 'neutral'

const KPI_TONE: Record<KpiTone, { bg: string; fg: string }> = {
  brand: { bg: 'var(--tv-brand-soft)', fg: 'var(--tv-brand-dark)' },
  warning: { bg: 'var(--tv-warning-soft)', fg: '#92400E' },
  danger: { bg: 'var(--tv-danger-soft)', fg: '#991B1B' },
  neutral: { bg: '#fff', fg: 'var(--tv-ink)' },
}

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string
  sub: string
  tone?: KpiTone
  icon?: string
}) {
  const t = KPI_TONE[tone]
  return (
    <div
      style={{
        background: t.bg,
        borderRadius: 14,
        padding: '12px 14px',
        border: '1px solid var(--tv-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="tv-label" style={{ fontSize: 10, flex: 1, color: t.fg, opacity: 0.7 }}>
          {label}
        </div>
        {icon && <MS name={icon} size={14} filled style={{ color: t.fg }} />}
      </div>
      <div
        className="tv-mono"
        style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05, marginTop: 4, color: t.fg }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// ── Settlement card ───────────────────────────────────────────────────────────
function SettlementCard({
  row,
  onDone,
  setError,
}: {
  row: CashRow
  onDone: () => void
  setError: (s: string | null) => void
}) {
  const isPending = row.status === 'pending_confirmation'
  const isDisputed = row.status === 'disputed'
  const isConfirmed = row.status === 'confirmed' || row.status === 'auto_assumed_confirmed'

  // System expected vs what driver reported
  const expectedCash = row.total_cash
  const reportedCash = row.delivered_amount ?? 0
  const diff = reportedCash - expectedCash
  const hasDiff = diff !== 0 && row.delivered_amount != null

  const [mode, setMode] = useState<'idle' | 'dispute'>('idle')
  const [counted, setCounted] = useState(String(reportedCash.toFixed(2)))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/business/cash-settlements/${row.id}/confirm`, {
        confirmedAmount: row.delivered_amount ?? 0,
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function dispute(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.post(`/business/cash-settlements/${row.id}/dispute`, {
        reportedAmount: Number(counted),
        note: note.trim(),
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: isPending
          ? '2px solid var(--tv-warning)'
          : isDisputed
            ? '1px solid var(--tv-danger)'
            : '1px solid var(--tv-border)',
        boxShadow: 'var(--tv-elev-1)',
        overflow: 'hidden',
      }}
    >
      {/* Status banner */}
      {isPending && (
        <div
          style={{
            background: 'var(--tv-warning)',
            color: '#1A1614',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <MS name="payments" size={14} filled />
          <span style={{ flex: 1 }}>Cuenta el efectivo físicamente antes de confirmar</span>
          <span style={{ fontSize: 10, opacity: 0.75 }}>24h máx</span>
        </div>
      )}
      {isDisputed && (
        <div
          style={{
            background: 'var(--tv-danger)',
            color: '#fff',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <MS name="gavel" size={14} filled />
          En disputa · esperando soporte
        </div>
      )}

      <div style={{ padding: 14 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'var(--tv-brand-soft)',
              color: 'var(--tv-brand-dark)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MS name="delivery_dining" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Motorizado</div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--tv-ink-muted)',
              }}
            >
              <span style={{ fontFamily: FONT_MONO }}>{row.settlement_date}</span>
            </div>
          </div>
          {isConfirmed && (
            <span className="tv-chip tv-chip-success" style={{ fontSize: 11 }}>
              <MS name="check_circle" size={13} filled /> Confirmado
            </span>
          )}
        </div>

        {/* Dual amount grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1,
            background: 'var(--tv-border)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <div style={{ background: 'var(--tv-surface)', padding: '10px 12px' }}>
            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>
              SISTEMA ESPERA
            </div>
            <div className="tv-mono" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
              {soles(expectedCash)}
            </div>
          </div>
          <div style={{ background: 'var(--tv-surface)', padding: '10px 12px' }}>
            <div className="tv-label" style={{ fontSize: 10, marginBottom: 4 }}>
              MOTO REPORTA
            </div>
            <div
              className="tv-mono"
              style={{
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1,
                color: hasDiff ? 'var(--tv-danger)' : 'var(--tv-ink)',
              }}
            >
              {row.delivered_amount != null ? soles(reportedCash) : '—'}
            </div>
          </div>
        </div>

        {/* Difference alert */}
        {hasDiff && isPending && (
          <div
            style={{
              background: 'var(--tv-warning-soft)',
              color: '#92400E',
              borderRadius: 10,
              padding: '8px 12px',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <MS name="info" size={14} filled />
            Diferencia de {soles(Math.abs(diff))} entre lo que el sistema espera y lo que reporta la
            moto.
          </div>
        )}

        {/* Dispute info */}
        {isDisputed && row.reported_amount != null && (
          <div
            style={{
              background: 'var(--tv-danger-soft)',
              color: '#7F1D1D',
              borderRadius: 10,
              padding: '8px 12px',
              marginBottom: 12,
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              Tú contaste: {soles(row.reported_amount)}
            </div>
          </div>
        )}

        {/* Actions */}
        {isPending && mode === 'idle' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="tv-btn tv-btn-ghost"
              disabled={busy}
              onClick={() => setMode('dispute')}
            >
              <MS name="report_problem" size={18} /> Reportar diferencia
            </button>
            <button type="button" className="tv-btn tv-btn-brand" disabled={busy} onClick={confirm}>
              <MS name="check" size={18} /> Confirmo {soles(reportedCash)}
            </button>
          </div>
        )}

        {isPending && mode === 'dispute' && (
          <form
            onSubmit={dispute}
            style={{
              marginTop: 4,
              borderTop: '1px solid var(--tv-border)',
              paddingTop: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: 'var(--tv-ink)',
              }}
            >
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: 'var(--tv-ink-muted)' }}>
                Conté S/
              </span>
              <input
                className="tv-input"
                style={{ width: 100, textAlign: 'center', fontFamily: FONT_MONO }}
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </label>
            <input
              className="tv-input"
              placeholder="Motivo de la diferencia (obligatorio)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                className="tv-btn tv-btn-danger tv-btn-sm"
                disabled={busy || !note.trim()}
              >
                Enviar diferencia
              </button>
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--tv-ink-subtle)',
                  padding: '4px 8px',
                }}
                onClick={() => setMode('idle')}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Summary hero (mobile) ─────────────────────────────────────────────────────
function SummaryHero({
  totalToday,
  pending,
  total,
}: {
  totalToday: number
  pending: number
  total: number
}) {
  return (
    <div
      style={{
        background: 'var(--tv-ink)',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <div className="tv-label" style={{ color: 'rgba(255,255,255,0.6)' }}>
        RECIBIDO HOY
      </div>
      <div
        className="tv-mono"
        style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, marginTop: 4 }}
      >
        {soles(totalToday)}
      </div>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          gap: 14,
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
        }}
      >
        <div>
          <strong style={{ color: '#fff' }}>{pending}</strong> por confirmar
        </div>
        <div>
          <strong style={{ color: '#fff' }}>{total - pending}</strong> cerrados
        </div>
      </div>
    </div>
  )
}

// ── Inner view ────────────────────────────────────────────────────────────────
function EfectivoView() {
  const { bizId } = useDashboard()
  const [rows, setRows] = useState<CashRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: e } = await getSupabaseBrowser()
      .from('cash_settlements')
      .select(
        'id,settlement_date,total_cash,delivered_amount,confirmed_amount,reported_amount,status',
      )
      .order('created_at', { ascending: false })
      .limit(50)
    if (e) setError(e.message)
    else setRows((data ?? []) as CashRow[])
  }, [])

  // Suppress unused warning — bizId required by contract, may be used for
  // future filtering but current endpoint is scoped by auth/RLS
  void bizId

  useEffect(() => {
    load()
    const channel = getSupabaseBrowser()
      .channel('biz-cash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
        load(),
      )
      .subscribe()
    return () => {
      getSupabaseBrowser().removeChannel(channel)
    }
  }, [load])

  const pending = rows.filter((r) => r.status === 'pending_confirmation')
  const disputed = rows.filter((r) => r.status === 'disputed')
  const settled = rows.filter((r) => r.status !== 'pending_confirmation' && r.status !== 'disputed')
  const todayRows = rows // all rows, since the query is already ordered/limited
  const totalToday = todayRows.reduce((sum, r) => sum + (r.delivered_amount ?? 0), 0)

  // desktop KPIs
  const kpiData = {
    today: totalToday,
    pending: pending.length,
    disputed: disputed.length,
  }

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

      {/* Mobile summary hero */}
      <div className="lg:hidden" style={{ marginBottom: 14 }}>
        <SummaryHero totalToday={kpiData.today} pending={kpiData.pending} total={rows.length} />
      </div>

      {/* Desktop KPI strip */}
      <div
        className="hidden lg:grid"
        style={{
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          marginBottom: 18,
        }}
      >
        <KpiCard
          label="RECIBIDO HOY"
          value={soles(kpiData.today)}
          sub={`${rows.length} cierres`}
          tone="brand"
        />
        <KpiCard
          label="POR CONFIRMAR"
          value={String(kpiData.pending)}
          sub="cierres pendientes"
          tone={kpiData.pending > 0 ? 'warning' : 'neutral'}
          icon={kpiData.pending > 0 ? 'warning' : undefined}
        />
        <KpiCard
          label="EN DISPUTA"
          value={String(kpiData.disputed)}
          sub="con soporte"
          tone={kpiData.disputed > 0 ? 'danger' : 'neutral'}
          icon={kpiData.disputed > 0 ? 'gavel' : undefined}
        />
        <KpiCard
          label="PENDIENTE CONFIRMAR"
          value={soles(pending.reduce((s, r) => s + (r.delivered_amount ?? 0), 0))}
          sub="efectivo en espera"
          tone="neutral"
        />
      </div>

      {/* Pending alert banner */}
      {pending.length > 0 && (
        <div
          style={{
            background: 'var(--tv-warning-soft)',
            color: '#92400E',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <MS name="warning" size={18} filled />
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
            Tienes <strong>{pending.length}</strong>{' '}
            {pending.length === 1 ? 'cierre pendiente' : 'cierres pendientes'} de confirmar
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            border: '1px solid var(--tv-border)',
            padding: '48px 20px',
            textAlign: 'center',
          }}
        >
          <MS
            name="payments"
            size={36}
            style={{ color: 'var(--tv-ink-subtle)', marginBottom: 10 }}
          />
          <div style={{ fontWeight: 700, fontSize: 15 }}>Sin cierres de efectivo</div>
          <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 4 }}>
            Aparecerán aquí cuando el motorizado entregue efectivo.
          </div>
        </div>
      )}

      {/* Pending block — first */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <MS name="warning" size={20} filled style={{ color: 'var(--tv-warning)' }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Por confirmar ahora</div>
            <span className="tv-chip tv-chip-warning">{pending.length}</span>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
              Después de 24h se confirman automáticamente
            </div>
          </div>
          {/* Mobile: single column; desktop: two columns via grid */}
          <div className="lg:hidden flex flex-col" style={{ gap: 12 }}>
            {pending.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={load} setError={setError} />
            ))}
          </div>
          <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {pending.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={load} setError={setError} />
            ))}
          </div>
        </div>
      )}

      {/* Disputed block */}
      {disputed.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <MS name="gavel" size={20} style={{ color: 'var(--tv-danger)' }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>En disputa</div>
            <span className="tv-chip tv-chip-danger">{disputed.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {disputed.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={load} setError={setError} />
            ))}
          </div>
        </div>
      )}

      {/* History block */}
      {settled.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <MS name="history" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Historial</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {settled.map((r) => (
              <SettlementCard key={r.id} row={r} onDone={load} setError={setError} />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function NegocioEfectivoPage() {
  return (
    <DashboardShell
      active="efectivo"
      title="Efectivo"
      subtitle="Liquidación diaria · cuenta el dinero antes de confirmar"
    >
      <EfectivoView />
    </DashboardShell>
  )
}
