'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

const soles = (n: number) => `S/ ${Number(n).toFixed(2)}`

interface ClaimRow {
  id: string
  order_id: string
  amount: number
  reason: string
  evidence_url: string | null
  status: string
  created_at: string
}

export default function ClaimsPage() {
  const [items, setItems] = useState<ClaimRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<ClaimRow[]>>('/admin/fraud-claims')
      .then((r) => setItems(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function resolve(id: string, approve: boolean) {
    setBusyId(id)
    try {
      await api.put(`/admin/fraud-claims/${id}/resolve`, { approve })
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
        title="Cobertura de fraude"
        description={
          items ? `${items.length} reclamos pendientes` : 'Reclamos de cobertura del fondo.'
        }
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!items ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : items.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.wallet className="h-5 w-5" />}
            title="Sin reclamos"
            hint="Nada pendiente de aprobar. 🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="t-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <StatusBadge label={soles(c.amount)} tone="warning" />
                  <p className="mt-1.5 text-[14px] text-ink">{c.reason}</p>
                  {c.evidence_url && (
                    <a
                      href={c.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-[13px] text-brand underline"
                    >
                      Ver evidencia
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button size="sm" disabled={busyId === c.id} onClick={() => resolve(c.id, true)}>
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === c.id}
                    onClick={() => resolve(c.id, false)}
                  >
                    Rechazar
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
