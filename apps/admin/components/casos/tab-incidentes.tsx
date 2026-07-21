'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { INCIDENT_TYPE_LABEL } from '@/lib/labels'

interface IncidentRow {
  id: string
  incident_type: string
  description: string | null
  customer_phone: string
  delivery_reference: string | null
  reported_by_role: string | null
  created_at: string
}

interface TabIncidentesProps {
  onCountChange?: (count: number) => void
}

export function TabIncidentes({ onCountChange }: TabIncidentesProps) {
  const [items, setItems] = useState<IncidentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<IncidentRow[]>>('/admin/incidents')
      .then((r) => {
        setItems(r.data)
        onCountChange?.(r.data.length)
      })
      .catch((e) => setError(errMsg(e)))
  }, [onCountChange])

  useEffect(() => {
    load()
  }, [load])

  async function review(id: string, result: 'confirmed' | 'dismissed') {
    setBusyId(id)
    try {
      await api.put(`/admin/incidents/${id}/review`, { result })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={load}>
          Refrescar
        </Button>
      </div>

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!items ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : items.length === 0 ? (
        <div className="t-card">
          <EmptyState
            icon={<Ico.shield className="h-5 w-5" />}
            title="Sin incidentes pendientes"
            hint="Nada por revisar. 🎉"
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="t-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={INCIDENT_TYPE_LABEL[it.incident_type] ?? it.incident_type}
                      tone="danger"
                    />
                    {it.reported_by_role && (
                      <span className="text-[12px] text-ink-subtle">
                        {it.reported_by_role === 'driver' ? 'Motorizado' : it.reported_by_role}
                      </span>
                    )}
                  </div>
                  {it.description && (
                    <p className="mt-1.5 text-[14px] text-ink">{it.description}</p>
                  )}
                  <p className="mt-0.5 text-[13px] text-ink-subtle">
                    📞 {it.customer_phone}
                    {it.delivery_reference ? ` · ${it.delivery_reference}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button
                    size="sm"
                    disabled={busyId === it.id}
                    onClick={() => review(it.id, 'confirmed')}
                  >
                    Confirmar strike
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === it.id}
                    onClick={() => review(it.id, 'dismissed')}
                  >
                    Desestimar
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
