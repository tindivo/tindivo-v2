'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import type { AdminAppealDto } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

type Tab = 'pending' | 'refund_pending' | 'history'

function timeAgo(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  return `hace ${d} días`
}

const soles = (n: number | null) => (n != null ? `S/ ${n.toFixed(2)}` : null)

interface AppealListData {
  items: AdminAppealDto[]
  total: number
  page: number
  perPage: number
}

function AppealCard({ a }: { a: AdminAppealDto }) {
  const statusLabel =
    a.appealStatus === 'pending'
      ? 'Pendiente'
      : a.appealStatus === 'in_review'
        ? 'En revisión'
        : a.appealStatus === 'approved'
          ? a.refundStatus === 'completed'
            ? 'Devuelto'
            : 'Aprobado'
          : 'Rechazado'

  const statusTone =
    a.appealStatus === 'rejected'
      ? 'danger'
      : a.appealStatus === 'approved' && a.refundStatus === 'completed'
        ? 'success'
        : 'warning'

  return (
    <Link href={`/apelaciones/${a.id}`} className="block">
      <div className="t-card group transition-all hover:shadow-md hover:border-brand/20">
        {/* Fila 1: badge + negocio + tiempo */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge label={statusLabel} tone={statusTone} />
            {a.businessName && (
              <span className="text-[13px] font-semibold text-ink truncate">{a.businessName}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-ink-subtle">{timeAgo(a.createdAt)}</span>
            <span className="text-[12px] text-ink-subtle group-hover:text-brand transition-colors">
              →
            </span>
          </div>
        </div>

        {/* Fila 2: short_id + nombre cliente + teléfono + monto */}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {a.orderShortId && (
            <span className="font-mono text-[12px] font-bold text-ink-muted bg-ink/[0.05] px-1.5 py-0.5 rounded">
              #{a.orderShortId}
            </span>
          )}
          {a.customerName && <span className="text-[12px] text-ink-subtle">{a.customerName}</span>}
          {a.customerPhone && (
            <span className="text-[12px] text-ink-subtle">📞 {a.customerPhone}</span>
          )}
          {a.refundAmount != null && (
            <span className="ml-auto font-mono text-[13px] font-semibold text-ink">
              {soles(a.refundAmount)}
            </span>
          )}
        </div>

        {/* Fila 3: motivo de rechazo (si existe) */}
        {a.rejectionReasonText && (
          <div className="mt-1.5 flex items-start gap-1">
            <span className="text-[11px] text-amber-600">⚠</span>
            <p className="text-[12px] text-ink-muted truncate">{a.rejectionReasonText}</p>
          </div>
        )}
      </div>
    </Link>
  )
}

export default function ApelacionesPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [appeals, setAppeals] = useState<AdminAppealDto[] | null>(null)
  const [counts, setCounts] = useState<Record<Tab, number>>({
    pending: 0,
    refund_pending: 0,
    history: 0,
  })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      if (tab === 'pending') {
        const [p, r] = await Promise.all([
          api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=pending'),
          api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=in_review'),
        ])
        setAppeals([...p.data.items, ...r.data.items])
      } else if (tab === 'refund_pending') {
        const res = await api.get<ApiEnvelope<AppealListData>>(
          '/admin/appeals?appeal_status=approved&refund_status=pending',
        )
        setAppeals(res.data.items)
      } else {
        const [a, r] = await Promise.all([
          api.get<ApiEnvelope<AppealListData>>(
            '/admin/appeals?appeal_status=approved&refund_status=completed',
          ),
          api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=rejected'),
        ])
        setAppeals([...a.data.items, ...r.data.items])
      }
    } catch (e) {
      setError(errMsg(e))
    }
  }, [tab])

  const loadCounts = useCallback(async () => {
    try {
      const [pending, inReview, refund] = await Promise.all([
        api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=pending&per_page=1'),
        api.get<ApiEnvelope<AppealListData>>('/admin/appeals?appeal_status=in_review&per_page=1'),
        api.get<ApiEnvelope<AppealListData>>(
          '/admin/appeals?appeal_status=approved&refund_status=pending&per_page=1',
        ),
      ])
      setCounts({
        pending: pending.data.total + inReview.data.total,
        refund_pending: refund.data.total,
        history: 0,
      })
    } catch {}
  }, [])

  useEffect(() => {
    load()
    loadCounts()
  }, [load, loadCounts])

  const totalPending = counts.pending + counts.refund_pending

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: 'Por resolver' },
    { key: 'refund_pending', label: 'Devolución pendiente' },
    { key: 'history', label: 'Historial' },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Antifraude"
        title="Apelaciones"
        description={
          totalPending > 0
            ? `${totalPending} caso${totalPending > 1 ? 's' : ''} pendiente${totalPending > 1 ? 's' : ''}`
            : 'Sin pendientes'
        }
        right={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              load()
              loadCounts()
            }}
          >
            Refrescar
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-[14px] bg-ink/[0.04] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-[10px] py-2 text-center text-[13px] font-semibold transition-colors ${
              tab === t.key ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!appeals ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : appeals.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.shield className="h-5 w-5" />}
            title={
              tab === 'pending'
                ? 'Sin apelaciones pendientes'
                : tab === 'refund_pending'
                  ? 'Sin devoluciones pendientes'
                  : 'Sin historial'
            }
            hint="🎉"
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {appeals.map((a) => (
            <li key={a.id}>
              <AppealCard a={a} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
