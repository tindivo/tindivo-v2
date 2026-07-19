'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { REPORT_TYPE_LABEL } from '@/lib/labels'

interface ReportRow {
  id: string
  type: string
  status: string
  customer_phone: string | null
  description: string | null
  evidence_url: string | null
  created_at: string
  orders: { short_id: string } | null
}

export default function ReportesPage() {
  const [reports, setReports] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<ReportRow[]>>('/admin/reports?status=open')
      .then((r) => setReports(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function resolve(id: string, status: 'resolved' | 'dismissed', action?: 'refund_customer' | 'none') {
    setBusyId(id)
    try {
      await api.post(`/admin/reports/${id}/resolve`, { status, resolutionAction: action })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Antifraude"
        title="Reportes"
        description={
          reports ? `${reports.length} reportes abiertos` : 'Bandeja de incidentes abiertos.'
        }
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!reports ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : reports.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.shield className="h-5 w-5" />}
            title="Bandeja limpia"
            hint="Nada pendiente por revisar. 🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="t-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={REPORT_TYPE_LABEL[r.type] ?? r.type} tone="danger" />
                    {r.orders?.short_id && (
                      <span className="font-mono text-[13px] text-ink-muted">
                        #{r.orders.short_id}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[14px] text-ink">{r.description}</p>
                  {r.customer_phone && (
                    <p className="mt-0.5 text-[13px] text-ink-subtle">📞 {r.customer_phone}</p>
                  )}
                  {r.evidence_url && (
                    <div className="mt-2.5">
                      <a
                        href={r.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-[13px] text-brand hover:underline"
                      >
                        <Ico.eye className="h-3.5 w-3.5" /> Ver comprobante adjunto
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {r.type === 'rejected_proof_disputed' ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r.id, 'resolved', 'refund_customer')}
                      >
                        Reembolsar cliente
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r.id, 'dismissed')}
                      >
                        Descartar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r.id, 'resolved')}
                      >
                        Resolver
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r.id, 'dismissed')}
                      >
                        Descartar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
