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
  license_plate: string | null
  is_active: boolean
  driver_availability: { is_available: boolean } | null
  driver_restaurants: { business_id: string }[] | null
}

interface BizRow {
  id: string
  name: string
  is_active: boolean
}

export default function MotorizadosPage() {
  const [rows, setRows] = useState<DrvRow[] | null>(null)
  const [locales, setLocales] = useState<BizRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Motorizado cuyo panel de locales está abierto. */
  const [editando, setEditando] = useState<string | null>(null)
  /** Selección en curso, sin guardar. */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<DrvRow[]>>('/admin/drivers')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
    api
      .get<ApiEnvelope<BizRow[]>>('/admin/businesses')
      .then((r) => setLocales(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [load])

  function abrirLocales(d: DrvRow) {
    setEditando(d.id)
    setSeleccion(new Set((d.driver_restaurants ?? []).map((r) => r.business_id)))
  }

  async function guardarLocales(driverId: string) {
    setBusyId(driverId)
    setError(null)
    try {
      await api.put(`/admin/drivers/${driverId}/restaurants`, {
        businessIds: [...seleccion],
      })
      setEditando(null)
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

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
          {rows.map((d) => {
            const asignados = d.driver_restaurants ?? []
            const sinLocales = asignados.length === 0
            const nombres = asignados
              .map((r) => {
                const b = locales.find((l) => l.id === r.business_id)
                if (!b) return null
                return b.is_active ? b.name : `${b.name} (inactivo)`
              })
              .filter(Boolean)
            return (
              <li key={d.id} className="t-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[15px] text-ink">{d.full_name}</span>
                      {d.driver_availability?.is_available ? (
                        <StatusBadge label="Disponible" tone="success" />
                      ) : (
                        <StatusBadge label="No disponible" tone="neutral" />
                      )}
                      {!d.is_active && <StatusBadge label="Desactivado" tone="danger" />}
                      {/* El fallo silencioso hecho ruidoso: sin locales el
                          motorizado abre su app y no ve UN SOLO pedido, sin
                          error que lo explique. Aquí se ve antes de que pase. */}
                      {sinLocales && <StatusBadge label="Sin locales" tone="danger" />}
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {d.vehicle_type}
                      {d.license_plate ? ` · ${d.license_plate}` : ''} · {d.phone ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {sinLocales ? (
                        <span className="text-danger">
                          No verá ningún pedido hasta asignarle un local
                        </span>
                      ) : (
                        `Atiende: ${nombres.join(', ')}`
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => abrirLocales(d)}>
                      Locales
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === d.id}
                      onClick={() => toggleActive(d)}
                    >
                      {d.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={openImpersonation('drivers', d.id)}
                    >
                      Entrar como
                    </Button>
                  </div>
                </div>

                {editando === d.id && (
                  <div className="mt-3 border-ink/[0.08] border-t pt-3">
                    <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">
                      Locales que atiende
                    </p>
                    {locales.length === 0 ? (
                      <p className="text-[13px] text-ink-subtle">No hay negocios registrados.</p>
                    ) : (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {locales.map((b) => (
                          <label
                            key={b.id}
                            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[14px] hover:bg-ink/[0.03]"
                          >
                            <input
                              type="checkbox"
                              checked={seleccion.has(b.id)}
                              onChange={(e) => {
                                const s = new Set(seleccion)
                                if (e.target.checked) s.add(b.id)
                                else s.delete(b.id)
                                setSeleccion(s)
                              }}
                            />
                            <span className={b.is_active ? 'text-ink font-medium' : 'text-ink-muted'}>
                              {b.name}
                              {!b.is_active && (
                                <span className="ml-1.5 rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-mono font-medium text-ink-subtle">
                                  inactivo
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === d.id}
                        onClick={() => guardarLocales(d.id)}
                      >
                        {busyId === d.id ? 'Guardando…' : 'Guardar'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
