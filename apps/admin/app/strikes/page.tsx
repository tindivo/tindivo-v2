'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

interface StrikeRow {
  user_id: string
  full_name: string
  phone: string | null
  strikes: number
  blocked_until: string | null
}

export default function StrikesPage() {
  const [items, setItems] = useState<StrikeRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<StrikeRow[]>>('/admin/strikes')
      .then((r) => setItems(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Antifraude"
        title="Strikes"
        description={
          items ? `${items.length} clientes con strikes` : 'Reputación de clientes por strikes.'
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
            icon={<Ico.shield className="h-5 w-5" />}
            title="Sin strikes"
            hint="Ningún cliente tiene strikes activos. 🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => {
            const blocked = s.blocked_until != null && new Date(s.blocked_until) > new Date()
            return (
              <li key={s.user_id} className="t-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[14px] text-ink">{s.full_name}</p>
                    {s.phone && <p className="text-[13px] text-ink-subtle">📞 {s.phone}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge
                      label={`${s.strikes} strike${s.strikes === 1 ? '' : 's'}`}
                      tone={s.strikes >= 3 ? 'danger' : 'warning'}
                    />
                    {blocked && <StatusBadge label="Bloqueado" tone="danger" />}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
