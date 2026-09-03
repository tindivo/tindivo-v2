'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { BlockModal, ModeModal } from '@/components/businesses/business-action-modals'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

interface BizRow {
  id: string
  name: string
  slug?: string | null
  primary_capability: string
  is_active: boolean
  is_blocked: boolean
  balance_due: number
  accent_color?: string
  coordinates_lat?: number | null
  coordinates_lng?: number | null
  phone?: string | null
  address?: string | null
}

const CAPABILITY_LABELS: Record<string, string> = {
  drivers_only: 'Solo motorizados',
  catalog_pickup: 'Catálogo + recojo',
  catalog_delivery: 'Catálogo + delivery',
  catalog_full: 'Catálogo completo',
  pickup_local: 'Atención en local',
  catalog_only: 'Solo WhatsApp',
}

type FilterTab = 'all' | 'active' | 'inactive' | 'blocked' | 'with_gps' | 'no_gps'

export default function NegociosPage() {
  const [rows, setRows] = useState<BizRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Búsqueda y filtros
  const [search, setSearch] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')

  // Modales de acción limpia
  const [modalModeBiz, setModalModeBiz] = useState<BizRow | null>(null)
  const [modalBlockBiz, setModalBlockBiz] = useState<BizRow | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<BizRow[]>>('/admin/businesses')
      .then((r) => setRows(r.data))
      .catch((e) => setError(errMsg(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(b: BizRow) {
    setBusyId(b.id)
    setError(null)
    try {
      await api.patch(`/admin/businesses/${b.id}`, { isActive: !b.is_active })
      load()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusyId(null)
    }
  }

  // Filtrado reactivo
  const filteredRows = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()

    return rows.filter((b) => {
      // Filtro de texto
      if (q) {
        const matchName = b.name.toLowerCase().includes(q)
        const matchSlug = b.slug?.toLowerCase().includes(q)
        const matchPhone = b.phone?.toLowerCase().includes(q)
        const matchAddress = b.address?.toLowerCase().includes(q)
        if (!matchName && !matchSlug && !matchPhone && !matchAddress) return false
      }

      // Filtro de pestañas
      if (filterTab === 'active') return b.is_active && !b.is_blocked
      if (filterTab === 'inactive') return !b.is_active
      if (filterTab === 'blocked') return b.is_blocked
      if (filterTab === 'with_gps') return b.coordinates_lat != null && b.coordinates_lng != null
      if (filterTab === 'no_gps') return b.coordinates_lat == null || b.coordinates_lng == null

      return true
    })
  }, [rows, search, filterTab])

  // Métricas de resumen
  const metrics = useMemo(() => {
    if (!rows) return { total: 0, active: 0, blocked: 0, withGps: 0, noGps: 0 }
    return {
      total: rows.length,
      active: rows.filter((b) => b.is_active && !b.is_blocked).length,
      blocked: rows.filter((b) => b.is_blocked).length,
      withGps: rows.filter((b) => b.coordinates_lat != null && b.coordinates_lng != null).length,
      noGps: rows.filter((b) => b.coordinates_lat == null || b.coordinates_lng == null).length,
    }
  }, [rows])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionHeader
        eyebrow="Red de Restaurantes"
        title="Gestión de Negocios"
        description={
          rows
            ? `${rows.length} restaurantes registrados en la plataforma.`
            : 'Cargando directorio de negocios…'
        }
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load}>
              Refrescar
            </Button>
            <Link
              href="/negocios/nuevo"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 font-medium text-[14px] text-white transition-colors hover:bg-brand-dark shadow-xs"
            >
              <Ico.plus className="h-4 w-4" />
              Nuevo negocio
            </Link>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-[14px] text-danger">
          {error}
        </div>
      )}

      {/* Barra de métricas resumen */}
      {rows && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink/10 bg-surface p-3 shadow-xs">
            <span className="text-[12px] font-medium text-ink-muted">Total negocios</span>
            <div className="mt-1 font-mono text-[20px] font-bold text-ink">{metrics.total}</div>
          </div>
          <div className="rounded-xl border border-ink/10 bg-surface p-3 shadow-xs">
            <span className="text-[12px] font-medium text-ink-muted">Activos</span>
            <div className="mt-1 font-mono text-[20px] font-bold text-success">
              {metrics.active}
            </div>
          </div>
          <div className="rounded-xl border border-ink/10 bg-surface p-3 shadow-xs">
            <span className="text-[12px] font-medium text-ink-muted">Bloqueados</span>
            <div className="mt-1 font-mono text-[20px] font-bold text-danger">
              {metrics.blocked}
            </div>
          </div>
          <div className="rounded-xl border border-ink/10 bg-surface p-3 shadow-xs">
            <span className="text-[12px] font-medium text-ink-muted">Con GPS activo</span>
            <div className="mt-1 font-mono text-[20px] font-bold text-brand">{metrics.withGps}</div>
          </div>
        </div>
      )}

      {/* Controles de búsqueda y filtros */}
      <div className="space-y-3">
        <div className="relative">
          <input
            type="text"
            className="t-field pl-10 pr-9 text-[14px]"
            placeholder="Buscar por nombre, slug, teléfono o dirección…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Ico.search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-[14px]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Pestañas de filtrado rápido */}
        <div className="flex flex-wrap gap-1.5 border-b border-ink/10 pb-2">
          {[
            { key: 'all', label: 'Todos', count: metrics.total },
            { key: 'active', label: 'Activos', count: metrics.active },
            {
              key: 'inactive',
              label: 'Inactivos',
              count: metrics.total - metrics.active - metrics.blocked,
            },
            { key: 'blocked', label: 'Bloqueados', count: metrics.blocked },
            { key: 'with_gps', label: 'Con GPS', count: metrics.withGps },
            { key: 'no_gps', label: 'Sin GPS', count: metrics.noGps },
          ].map((tab) => {
            const on = filterTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key as FilterTab)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  on
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-ink/[0.04] text-ink-muted hover:bg-ink/[0.08] hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[11px] ${
                    on ? 'bg-white/25 text-white' : 'bg-ink/10 text-ink-muted'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista de restaurantes */}
      {!rows ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-ink/[0.05]" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="t-card py-10">
          <EmptyState
            icon={<Ico.store className="h-6 w-6" />}
            title="No se encontraron restaurantes"
            hint={
              search
                ? `Ningún resultado coincide con "${search}".`
                : 'No hay restaurantes en esta categoría.'
            }
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredRows.map((b) => {
            const hasGps = b.coordinates_lat != null && b.coordinates_lng != null
            return (
              <div
                key={b.id}
                className="t-card flex flex-col justify-between gap-4 p-4 transition-all hover:border-ink/20 sm:flex-row sm:items-center"
              >
                {/* Información principal */}
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {b.accent_color && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-black/10 shadow-xs"
                        style={{ backgroundColor: b.accent_color }}
                        title={`Color: ${b.accent_color}`}
                      />
                    )}
                    <span className="font-bold text-[16px] text-ink">{b.name}</span>

                    {/* Estado activo / inactivo / bloqueado */}
                    {!b.is_active ? (
                      <StatusBadge label="Inactivo" tone="neutral" />
                    ) : b.is_blocked ? (
                      <StatusBadge label="Bloqueado" tone="danger" />
                    ) : (
                      <StatusBadge label="Activo" tone="success" />
                    )}

                    <StatusBadge
                      label={CAPABILITY_LABELS[b.primary_capability] ?? b.primary_capability}
                      tone="brand"
                    />
                  </div>

                  {/* Metadatos en fila limpia */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
                    {/* Badge de GPS */}
                    {hasGps ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 text-[12px]">
                        <Ico.mapPin className="h-3.5 w-3.5 text-emerald-600" />
                        GPS configurado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60 text-[12px]">
                        <Ico.mapPin className="h-3.5 w-3.5 text-amber-500" />
                        Sin coordenadas
                      </span>
                    )}

                    {/* Deuda */}
                    <span>
                      Deuda:{' '}
                      <strong
                        className={`font-mono ${b.balance_due > 0 ? 'text-danger' : 'text-ink'}`}
                      >
                        {soles(b.balance_due)}
                      </strong>
                    </span>

                    {/* Teléfono */}
                    {b.phone && (
                      <span className="flex items-center gap-1 font-mono text-[12px]">
                        <Ico.phone className="h-3.5 w-3.5 text-ink-subtle" />
                        {b.phone}
                      </span>
                    )}

                    {/* Slug */}
                    {b.slug && (
                      <span className="font-mono text-[12px] text-ink-subtle">/{b.slug}</span>
                    )}
                  </div>

                  {b.address && (
                    <p className="text-[12px] text-ink-subtle truncate max-w-xl">📍 {b.address}</p>
                  )}
                </div>

                {/* Acciones limpias y organizadas */}
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {/* Botón principal: Editar todos los campos */}
                  <Link
                    href={`/negocios/${b.id}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-brand/30 bg-brand/5 px-3 font-semibold text-[13px] text-brand transition-colors hover:bg-brand/10 shadow-2xs"
                  >
                    <Ico.edit className="h-3.5 w-3.5" />
                    Editar
                  </Link>

                  {/* Cambiar Modo */}
                  <Button size="sm" variant="ghost" onClick={() => setModalModeBiz(b)}>
                    Modo
                  </Button>

                  {/* Activar / Desactivar */}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyId === b.id}
                    onClick={() => toggleActive(b)}
                  >
                    {b.is_active ? 'Desactivar' : 'Activar'}
                  </Button>

                  {/* Bloquear / Desbloquear */}
                  <Button
                    size="sm"
                    variant={b.is_blocked ? 'ghost' : 'outline'}
                    className={
                      b.is_blocked
                        ? 'text-success hover:bg-success/10'
                        : 'text-danger hover:bg-danger/10 border-danger/20'
                    }
                    onClick={() => setModalBlockBiz(b)}
                  >
                    {b.is_blocked ? 'Desbloquear' : 'Bloquear'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modales */}
      {modalModeBiz && (
        <ModeModal business={modalModeBiz} onClose={() => setModalModeBiz(null)} onSuccess={load} />
      )}

      {modalBlockBiz && (
        <BlockModal
          business={modalBlockBiz}
          onClose={() => setModalBlockBiz(null)}
          onSuccess={load}
        />
      )}
    </div>
  )
}
