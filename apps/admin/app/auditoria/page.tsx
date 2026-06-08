'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, fieldSm, Ico, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { dateTime } from '@/lib/format'

interface AuditRow {
  id: string
  event_type: string
  actor_role: string | null
  created_at: string
  data: unknown
  orders: { short_id: string } | null
}

export default function AuditoriaPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shortId, setShortId] = useState('')

  const load = useCallback((sid: string) => {
    const q = sid.trim() ? `?shortId=${encodeURIComponent(sid.trim())}` : ''
    api
      .get<ApiEnvelope<AuditRow[]>>(`/admin/audit${q}`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load('')
  }, [load])

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Trazabilidad"
        title="Auditoría"
        description="Eventos del sistema, filtrables por pedido."
      />
      <div className="t-card">
        <div className="mb-3 flex items-center gap-2">
          <input
            className={`${fieldSm} flex-1`}
            placeholder="Filtrar por código de pedido (ABCDEFGH)"
            value={shortId}
            onChange={(e) => setShortId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load(shortId)
            }}
          />
          <Button size="sm" onClick={() => load(shortId)}>
            Buscar
          </Button>
        </div>
        {error && <p className="mb-2 text-[14px] text-danger">{error}</p>}
        {!rows ? (
          <div className="h-24 animate-pulse rounded-2xl bg-ink/[0.05]" />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Ico.audit className="h-5 w-5" />} title="Sin eventos" />
        ) : (
          <ul className="divide-y divide-ink/5">
            {rows.map((e) => (
              <li key={e.id} className="py-2 text-[13px]">
                <span className="font-mono text-ink">{e.event_type}</span>
                {e.orders?.short_id && (
                  <span className="ml-2 font-mono text-ink-muted">#{e.orders.short_id}</span>
                )}
                {e.actor_role && <span className="ml-2 text-ink-subtle">· {e.actor_role}</span>}
                <span className="ml-2 text-ink-subtle">· {dateTime(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
