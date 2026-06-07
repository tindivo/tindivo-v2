'use client'

import { ApiError } from '@tindivo/api-client'
import { useCallback, useEffect, useState } from 'react'
import { MS, soles } from '@/components/dashboard/primitives'
import { DashboardShell } from '@/components/dashboard/shell'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const DISPUTE_WINDOW_MS = 48 * 3600 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────
interface Advance {
  id: string
  amount: number
  reason: string
  actor_charged: string
  status: string
  created_at: string
  orders: { short_id: string } | null
}

interface Settlement {
  id: string
  period_start: string
  period_end: string
  order_count: number
  total_amount: number
  status: string
  due_date: string
  paid_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const ADVANCE_STATE: Record<string, { chipCls: string; label: string }> = {
  activo: { chipCls: 'tv-chip-warning', label: 'Activo' },
  disputado: { chipCls: 'tv-chip-info', label: 'En disputa' },
  cancelado: { chipCls: 'tv-chip-success', label: 'Anulado' },
}

const SETTLEMENT_STATE: Record<string, { chipCls: string; label: string }> = {
  paid: { chipCls: 'tv-chip-success', label: 'Pagado' },
  pending: { chipCls: 'tv-chip-warning', label: 'Por pagar' },
  overdue: { chipCls: 'tv-chip-danger', label: 'Vencido' },
  cancelled: { chipCls: '', label: 'Cancelado' },
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
  })
}

// ── AdvanceCard ───────────────────────────────────────────────────────────────
function AdvanceCard({
  a,
  disputeId,
  disputeNote,
  busy,
  err,
  onStartDispute,
  onNoteChange,
  onSubmitDispute,
  onCancelDispute,
}: {
  a: Advance
  disputeId: string | null
  disputeNote: string
  busy: boolean
  err: string | null
  onStartDispute: (id: string) => void
  onNoteChange: (v: string) => void
  onSubmitDispute: (id: string) => void
  onCancelDispute: () => void
}) {
  const stateMeta = ADVANCE_STATE[a.status] ?? { chipCls: '', label: a.status }
  const canDispute =
    a.actor_charged === 'restaurante' &&
    a.status === 'activo' &&
    Date.now() - new Date(a.created_at).getTime() < DISPUTE_WINDOW_MS
  const windowExpired = !canDispute && a.status === 'activo' && a.actor_charged === 'restaurante'
  const hoursLeft = Math.max(
    0,
    Math.floor((DISPUTE_WINDOW_MS - (Date.now() - new Date(a.created_at).getTime())) / 3600000),
  )

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        padding: 12,
        border: '1px solid var(--tv-border)',
        boxShadow: 'var(--tv-elev-1)',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div className="tv-mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--tv-ink)' }}>
          − {soles(a.amount)}
        </div>
        <div style={{ flex: 1 }} />
        <span className={`tv-chip ${stateMeta.chipCls}`}>{stateMeta.label}</span>
      </div>

      {/* Reason */}
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.4,
          marginBottom: 8,
          color: 'var(--tv-ink)',
        }}
      >
        {a.reason}
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--tv-ink-muted)',
        }}
      >
        <MS name="receipt_long" size={12} />
        {a.orders?.short_id && <span className="tv-mono">#{a.orders.short_id}</span>}
        {a.orders?.short_id && <span>·</span>}
        <span>{fmtDate(a.created_at)}</span>
      </div>

      {/* Dispute zone — only for activo */}
      {a.status === 'activo' && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--tv-border)',
          }}
        >
          {canDispute && disputeId !== a.id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 11, color: 'var(--tv-ink-muted)' }}>
                Ventana de disputa: <strong style={{ color: 'var(--tv-ink)' }}>{hoursLeft}h</strong>{' '}
                restantes
              </div>
              <button
                type="button"
                className="tv-btn tv-btn-dark tv-btn-sm"
                onClick={() => onStartDispute(a.id)}
              >
                <MS name="gavel" size={14} /> Disputar
              </button>
            </div>
          )}
          {canDispute && disputeId === a.id && (
            <div>
              {err && (
                <p style={{ fontSize: 12, color: 'var(--tv-danger)', marginBottom: 6 }}>{err}</p>
              )}
              <textarea
                className="tv-input"
                style={{ minHeight: 76, resize: 'vertical', fontSize: 13 }}
                placeholder="¿Por qué no corresponde este adelanto?"
                value={disputeNote}
                onChange={(e) => onNoteChange(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="tv-btn tv-btn-danger tv-btn-sm"
                  disabled={busy}
                  onClick={() => onSubmitDispute(a.id)}
                >
                  {busy ? 'Enviando…' : 'Enviar disputa'}
                </button>
                <button
                  type="button"
                  className="tv-btn tv-btn-ghost tv-btn-sm"
                  onClick={onCancelDispute}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {windowExpired && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--tv-ink-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <MS name="lock" size={12} />
              Ventana de disputa (48 h) vencida
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SettlementRow ─────────────────────────────────────────────────────────────
function SettlementRow({ s }: { s: Settlement }) {
  const stateMeta = SETTLEMENT_STATE[s.status] ?? { chipCls: '', label: s.status }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--tv-border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tv-ink)' }}>
          {fmtDate(s.period_start)} – {fmtDate(s.period_end)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
          {s.order_count} pedidos
          {s.paid_at ? ` · pagado el ${fmtDate(s.paid_at)}` : ''}
        </div>
      </div>
      <div className="tv-mono" style={{ fontSize: 14, fontWeight: 700 }}>
        {soles(s.total_amount)}
      </div>
      <span className={`tv-chip ${stateMeta.chipCls}`} style={{ fontSize: 11 }}>
        {stateMeta.label}
      </span>
    </div>
  )
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({
  icon,
  title,
  badge,
  hint,
}: {
  icon: string
  title: string
  badge?: number
  hint?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
      }}
    >
      <MS name={icon} size={20} filled style={{ color: 'var(--tv-warning)' }} />
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      {badge != null && <span className="tv-chip">{badge}</span>}
      {hint && (
        <>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>{hint}</div>
        </>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DeudaPage() {
  const BLOCK_THRESHOLD = 300

  const [balance, setBalance] = useState<number>(0)
  const [blocked, setBlocked] = useState(false)
  const [yape, setYape] = useState<string | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [advances, setAdvances] = useState<Advance[]>([])
  const [disputeId, setDisputeId] = useState<string | null>(null)
  const [disputeNote, setDisputeNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const [{ data: biz }, { data: stl }, { data: adv }, { data: cfg }] = await Promise.all([
      supabase.from('businesses').select('balance_due,is_blocked,blocked_for_debt').maybeSingle(),
      supabase
        .from('settlements')
        .select('id,period_start,period_end,order_count,total_amount,status,due_date,paid_at')
        .order('period_end', { ascending: false })
        .limit(50),
      supabase
        .from('contingency_advances')
        .select('id,amount,reason,actor_charged,status,created_at,orders(short_id)')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('app_settings').select('value').eq('key', 'support_whatsapp').maybeSingle(),
    ])
    if (biz) {
      setBalance(Number(biz.balance_due))
      setBlocked(Boolean(biz.is_blocked))
    }
    setSettlements((stl ?? []) as Settlement[])
    setAdvances((adv ?? []) as Advance[])
    if (cfg?.value) setYape(String(cfg.value).replace(/"/g, ''))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function dispute(id: string) {
    const note = disputeNote.trim()
    if (note.length < 5) {
      setErr('Explica brevemente por qué disputas (mín. 5 caracteres).')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await api.post(`/business/contingency/${id}/dispute`, { note })
      setDisputeId(null)
      setDisputeNote('')
      await load()
    } catch (e) {
      setErr(e instanceof ApiError ? (e.problem.detail ?? e.message) : 'No se pudo disputar')
    } finally {
      setBusy(false)
    }
  }

  const pct = Math.min(balance / BLOCK_THRESHOLD, 1) * 100
  const whatsappHref = yape
    ? `https://wa.me/${yape.replace(/\D/g, '')}?text=${encodeURIComponent('Hola Tindivo, quiero coordinar el pago de mi deuda.')}`
    : '#'

  // ── WhatsApp CTA (shared between mobile and desktop header) ──────────────────
  const WhatsAppBtn = ({ size = 'normal' }: { size?: 'normal' | 'sm' }) => (
    <a
      href={whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      className={`tv-btn tv-btn-brand${size === 'sm' ? ' tv-btn-sm' : ''}`}
      style={{ textDecoration: 'none' }}
    >
      <MS name="chat" size={size === 'sm' ? 14 : 18} />
      {size === 'sm' ? 'Abrir' : 'WhatsApp a Tindivo'}
    </a>
  )

  // ── Hero negro (balance + progress) ──────────────────────────────────────────
  const BalanceHero = ({ large = false }: { large?: boolean }) => (
    <div
      style={{
        background: 'linear-gradient(135deg, #1A1614 0%, #2A2422 100%)',
        color: '#fff',
        borderRadius: 20,
        padding: large ? 22 : '20px 18px',
      }}
    >
      <div className="tv-label" style={{ color: 'rgba(255,255,255,0.6)' }}>
        DEBES AHORA
      </div>
      <div
        className="tv-mono"
        style={{
          fontSize: large ? 54 : 40,
          fontWeight: 700,
          lineHeight: 1,
          margin: `${large ? 8 : 6}px 0 ${large ? 16 : 14}px`,
        }}
      >
        {soles(balance)}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: large ? 12 : 10 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: large ? 6 : 4,
          }}
        >
          <span>0</span>
          <span>Suspensión a {soles(BLOCK_THRESHOLD)}</span>
        </div>
        <div
          style={{
            height: large ? 8 : 6,
            background: 'rgba(255,255,255,0.12)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: pct >= 80 ? 'var(--tv-danger)' : 'var(--tv-brand)',
              transition: 'width 600ms ease',
            }}
          />
        </div>
      </div>

      {large ? (
        // Desktop info strip
        <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.06)',
              padding: '8px 12px',
              borderRadius: 10,
              flex: 1,
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>RIESGO DE SUSPENSIÓN</div>
            <div style={{ marginTop: 2, fontWeight: 600 }}>{Math.round(pct)}% del límite</div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.06)',
              padding: '8px 12px',
              borderRadius: 10,
              flex: 1,
            }}
          >
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>ADELANTOS ACTIVOS</div>
            <div style={{ marginTop: 2, fontWeight: 600 }}>
              {advances.filter((a) => a.status === 'activo').length} adelantos
            </div>
          </div>
        </div>
      ) : (
        // Mobile info strip
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
          }}
        >
          <MS name="info" size={14} />
          <span>Suspensión automática al llegar a {soles(BLOCK_THRESHOLD)}</span>
        </div>
      )}
    </div>
  )

  // ── Cómo pagar card ───────────────────────────────────────────────────────────
  const HowToPayCard = () => (
    <div
      style={{
        background: '#fff',
        borderRadius: 20,
        padding: 22,
        border: '1px solid var(--tv-border)',
      }}
    >
      <div className="tv-label">CÓMO PAGAR</div>
      <div
        style={{
          marginTop: 10,
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--tv-ink-muted)',
        }}
      >
        Coordina el pago con Tindivo a través de WhatsApp. Una vez confirmado, tu saldo se actualiza
        en segundos.
      </div>
      <div
        style={{
          background: 'var(--tv-surface)',
          borderRadius: 12,
          padding: '12px 14px',
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <MS name="chat" size={20} style={{ color: 'var(--tv-success)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Soporte Tindivo</div>
          {yape && (
            <div className="tv-mono" style={{ fontSize: 12, color: 'var(--tv-ink-muted)' }}>
              {yape}
            </div>
          )}
        </div>
        <WhatsAppBtn size="sm" />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          fontSize: 12,
          color: 'var(--tv-ink-muted)',
        }}
      >
        <MS name="info" size={14} />
        {`Si tu deuda llega a ${soles(BLOCK_THRESHOLD)}, tu cuenta queda suspendida automáticamente.`}
      </div>
    </div>
  )

  const disputeableCount = advances.filter(
    (a) =>
      a.actor_charged === 'restaurante' &&
      a.status === 'activo' &&
      Date.now() - new Date(a.created_at).getTime() < DISPUTE_WINDOW_MS,
  ).length

  return (
    <DashboardShell
      active="deuda"
      title="Deuda con Tindivo"
      subtitle="Comisiones acumuladas y fondo de contingencia"
      headerRight={
        /* Desktop header CTA */
        <div className="hidden lg:block">
          <WhatsAppBtn />
        </div>
      }
    >
      {/* Suspended banner */}
      {blocked && (
        <div
          style={{
            background: 'var(--tv-danger-soft)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--tv-danger)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <MS name="block" size={18} filled style={{ flexShrink: 0 }} />
          Tu cuenta está suspendida por deuda. Regulariza para reactivarla.
        </div>
      )}

      {/* ── MOBILE layout ─────────────────────────────────────────────────── */}
      <div className="lg:hidden flex flex-col" style={{ gap: 14 }}>
        <BalanceHero large={false} />

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="tv-btn tv-btn-brand tv-btn-block tv-btn-lg"
          style={{ textDecoration: 'none' }}
        >
          <MS name="chat" size={18} /> Pagar por WhatsApp a Tindivo
        </a>

        {advances.length > 0 && (
          <div>
            <SectionHeader
              icon="report_problem"
              title="Adelantos del fondo"
              badge={advances.length}
              hint="48h para disputar"
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {advances.map((a) => (
                <AdvanceCard
                  key={a.id}
                  a={a}
                  disputeId={disputeId}
                  disputeNote={disputeNote}
                  busy={busy}
                  err={disputeId === a.id ? err : null}
                  onStartDispute={(id) => {
                    setDisputeId(id)
                    setDisputeNote('')
                    setErr(null)
                  }}
                  onNoteChange={setDisputeNote}
                  onSubmitDispute={dispute}
                  onCancelDispute={() => setDisputeId(null)}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <MS name="history" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
            <div style={{ fontSize: 16, fontWeight: 700 }}>Liquidaciones semanales</div>
          </div>
          {settlements.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 16px',
                color: 'var(--tv-ink-subtle)',
                fontSize: 14,
              }}
            >
              Aún no hay liquidaciones generadas.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {settlements.map((s) => (
                <SettlementRow key={s.id} s={s} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── DESKTOP layout ────────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        {/* Top row: balance hero + cómo pagar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <BalanceHero large />
          <HowToPayCard />
        </div>

        {/* Bottom row: advances + settlements */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
          {/* Advances */}
          <div>
            <SectionHeader
              icon="report_problem"
              title="Adelantos del fondo"
              badge={advances.length}
              hint={
                disputeableCount > 0
                  ? `${disputeableCount} disputable${disputeableCount > 1 ? 's' : ''}`
                  : 'Tienes 48h para disputar después del cobro'
              }
            />
            {advances.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--tv-ink-subtle)',
                  fontSize: 14,
                  background: '#fff',
                  borderRadius: 14,
                  border: '1px solid var(--tv-border)',
                }}
              >
                Sin adelantos registrados.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {advances.map((a) => (
                  <AdvanceCard
                    key={a.id}
                    a={a}
                    disputeId={disputeId}
                    disputeNote={disputeNote}
                    busy={busy}
                    err={disputeId === a.id ? err : null}
                    onStartDispute={(id) => {
                      setDisputeId(id)
                      setDisputeNote('')
                      setErr(null)
                    }}
                    onNoteChange={setDisputeNote}
                    onSubmitDispute={dispute}
                    onCancelDispute={() => setDisputeId(null)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Settlements */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <MS name="history" size={20} style={{ color: 'var(--tv-ink-muted)' }} />
              <div style={{ fontSize: 16, fontWeight: 700 }}>Liquidaciones semanales</div>
            </div>
            {settlements.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--tv-ink-subtle)',
                  fontSize: 14,
                  background: '#fff',
                  borderRadius: 14,
                  border: '1px solid var(--tv-border)',
                }}
              >
                Aún no hay liquidaciones generadas.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settlements.map((s) => (
                  <SettlementRow key={s.id} s={s} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
