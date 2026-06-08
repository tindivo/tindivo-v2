'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { api, errMsg } from '@/lib/api'
import { openImpersonation } from '@/lib/impersonate'

interface DrvRow {
  id: string
  full_name: string
  phone: string | null
  vehicle_type: string
  is_active: boolean
  driver_availability: { is_available: boolean } | null
}

export default function MotorizadosPage() {
  const [rows, setRows] = useState<DrvRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<DrvRow[]>>('/admin/drivers')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(d: DrvRow) {
    setBusyId(d.id)
    setError(null)
    try {
      await api.patch(`/admin/drivers/${d.id}`, { isActive: !d.is_active })
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
        title="Motorizados"
        description={rows ? `${rows.length} motorizados` : 'Repartidores de la plataforma.'}
        right={
          <>
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
            <Link
              href="/motorizados/nuevo"
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
          <EmptyState icon={<Ico.truck className="h-5 w-5" />} title="Sin motorizados todavía" />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id} className="t-card flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[15px] text-ink">{d.full_name}</span>
                  {d.driver_availability?.is_available ? (
                    <StatusBadge label="Disponible" tone="success" />
                  ) : (
                    <StatusBadge label="No disponible" tone="neutral" />
                  )}
                  {!d.is_active && <StatusBadge label="Desactivado" tone="danger" />}
                </div>
                <p className="mt-0.5 text-[12px] text-ink-subtle">
                  {d.vehicle_type} · {d.phone ?? '—'}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === d.id}
                  onClick={() => toggleActive(d)}
                >
                  {d.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button size="sm" variant="outline" onClick={openImpersonation('drivers', d.id)}>
                  Entrar como
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
