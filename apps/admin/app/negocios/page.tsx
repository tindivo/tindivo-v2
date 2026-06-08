'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, fieldSm, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'
import { openImpersonation } from '@/lib/impersonate'

interface BizRow {
  id: string
  name: string
  primary_capability: string
  is_active: boolean
  is_blocked: boolean
  balance_due: number
}

export default function NegociosPage() {
  const [rows, setRows] = useState<BizRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [blockId, setBlockId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<BizRow[]>>('/admin/businesses')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      setBlockId(null)
      setReason('')
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
        eyebrow="Red"
        title="Negocios"
        description={rows ? `${rows.length} negocios` : 'Negocios de la plataforma.'}
        right={
          <>
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
            <Link
              href="/negocios/nuevo"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 font-medium text-[14px] text-white transition-colors hover:bg-brand-dark"
            >
              <Ico.plus className="h-4 w-4" />
              Nuevo
            </Link>
          </>
        }
      />

      {error && <p className="mb-3 text-[14px] text-danger">{error}</p>}

      {!rows ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : rows.length === 0 ? (
        <div className="t-card">
          <EmptyState icon={<Ico.store className="h-5 w-5" />} title="Sin negocios todavía" />
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((b) => (
            <li key={b.id} className="t-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[15px] text-ink">{b.name}</span>
                    {!b.is_active && <StatusBadge label="Inactivo" tone="neutral" />}
                    {b.is_blocked && <StatusBadge label="Bloqueado" tone="danger" />}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-subtle">
                    {b.primary_capability} · deuda{' '}
                    <span className="font-mono">{soles(b.balance_due)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === b.id}
                    onClick={() =>
                      act(
                        () => api.patch(`/admin/businesses/${b.id}`, { isActive: !b.is_active }),
                        b.id,
                      )
                    }
                  >
                    {b.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                  {b.is_blocked ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === b.id}
                      onClick={() =>
                        act(() => api.post(`/admin/businesses/${b.id}/unblock`, {}), b.id)
                      }
                    >
                      Desbloquear
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setBlockId(blockId === b.id ? null : b.id)
                        setReason('')
                      }}
                    >
                      Bloquear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openImpersonation('businesses', b.id)}
                  >
                    Entrar como
                  </Button>
                </div>
              </div>
              {blockId === b.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    className={`${fieldSm} flex-1`}
                    placeholder="Motivo del bloqueo (obligatorio)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busyId === b.id || reason.trim().length < 3}
                    onClick={() =>
                      act(() => api.post(`/admin/businesses/${b.id}/block`, { reason }), b.id)
                    }
                  >
                    Confirmar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
