'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { DriverEditModal, DriverLocalesModal } from '@/components/drivers/driver-action-modals'
import { api, errMsg } from '@/lib/api'

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

type FilterTab = 'todos' | 'disponibles' | 'desconectados' | 'sin_locales' | 'inactivos'

const VEHICLE_EMOJIS: Record<string, string> = {
  moto: '🛵',
  bici: '🚲',
  auto: '🚗',
  pie: '🚶',
}

const VEHICLE_NAMES: Record<string, string> = {
  moto: 'Moto',
  bici: 'Bici',
  auto: 'Auto',
  pie: 'A pie',
}

export default function MotorizadosPage() {
  const [rows, setRows] = useState<DrvRow[] | null>(null)
  const [locales, setLocales] = useState<BizRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Filtros y búsqueda
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('todos')

  // Modales
  const [modalLocalesDriver, setModalLocalesDriver] = useState<{
    id: string
    name: string
    selectedIds: string[]
  } | null>(null)
  const [modalEditDriver, setModalEditDriver] = useState<DrvRow | null>(null)

  const load = useCallback(() => {
    setError(null)
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

  // Desactivar / activar motorizado
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

  // Conteos para KPIs y pestañas
  const counts = useMemo(() => {
    if (!rows) return { total: 0, disponibles: 0, desconectados: 0, sinLocales: 0, inactivos: 0 }
    let disponibles = 0
    let desconectados = 0
    let sinLocales = 0
    let inactivos = 0

    for (const r of rows) {
      if (!r.is_active) inactivos++
      if (r.driver_availability?.is_available && r.is_active) disponibles++
      if (!r.driver_availability?.is_available && r.is_active) desconectados++
      if (!r.driver_restaurants || r.driver_restaurants.length === 0) sinLocales++
    }

    return {
      total: rows.length,
      disponibles,
      desconectados,
      sinLocales,
      inactivos,
    }
  }, [rows])

  // Filtrado de lista
  const filteredRows = useMemo(() => {
    if (!rows) return []
    const q = search.toLowerCase().trim()

    return rows.filter((d) => {
      // Búsqueda por texto
      if (q) {
        const matchName = d.full_name.toLowerCase().includes(q)
        const matchPhone = d.phone?.toLowerCase().includes(q) ?? false
        const matchPlate = d.license_plate?.toLowerCase().includes(q) ?? false
        if (!matchName && !matchPhone && !matchPlate) return false
      }

      // Filtro por pestaña
      if (tab === 'disponibles') return d.driver_availability?.is_available && d.is_active
      if (tab === 'desconectados') return !d.driver_availability?.is_available && d.is_active
      if (tab === 'sin_locales') return !d.driver_restaurants || d.driver_restaurants.length === 0
      if (tab === 'inactivos') return !d.is_active
      return true
    })
  }, [rows, search, tab])

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-1 sm:px-0">
      {/* Cabecera Principal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionHeader
            eyebrow="Red de Repartidores"
            title="Motorizados"
            description={
              rows
                ? `${counts.total} repartidores · ${counts.disponibles} activos y disponibles`
                : 'Gestión y asignación de motorizados en San Jacinto.'
            }
          />
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button size="sm" variant="outline" onClick={load}>
            <Ico.refresh className="h-4 w-4" />
            <span className="hidden sm:inline">Refrescar</span>
          </Button>
          <Link
            href="/motorizados/nuevo"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3.5 font-medium text-[14px] text-white shadow-sm transition-all hover:bg-brand-dark"
          >
            <Ico.plus className="h-4 w-4" />
            <span>Nuevo motorizado</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-[14px] text-danger">
          {error}
        </div>
      )}

      {/* Métricas Resumen (2 cols en mobile, 4 cols en tablet/desktop) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <div className="t-card p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Total
          </div>
          <div className="mt-1 font-bold text-[22px] sm:text-[26px] text-ink">{counts.total}</div>
          <div className="mt-0.5 text-[11px] text-ink-subtle">Registrados</div>
        </div>

        <div className="t-card p-3.5 border-l-4 border-l-success">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-success">
            Disponibles
          </div>
          <div className="mt-1 font-bold text-[22px] sm:text-[26px] text-success">
            {counts.disponibles}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-subtle">Listos para pedido</div>
        </div>

        <div className="t-card p-3.5 border-l-4 border-l-danger">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-danger">
            Sin locales
          </div>
          <div className="mt-1 font-bold text-[22px] sm:text-[26px] text-danger">
            {counts.sinLocales}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-subtle">No verán pedidos</div>
        </div>

        <div className="t-card p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Inactivos
          </div>
          <div className="mt-1 font-bold text-[22px] sm:text-[26px] text-ink-muted">
            {counts.inactivos}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-subtle">Acceso pausado</div>
        </div>
      </div>

      {/* Buscador y Pestañas de Filtro */}
      <div className="space-y-2.5">
        {/* Input de Búsqueda */}
        <div className="relative">
          <Ico.search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nombre, celular o placa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="t-field pl-10 pr-9 py-2 text-[14px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-[13px] p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Pestañas con scroll horizontal en mobile */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[13px]">
          <button
            type="button"
            onClick={() => setTab('todos')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-medium transition-all ${
              tab === 'todos'
                ? 'bg-ink text-white'
                : 'bg-ink/[0.04] text-ink-muted hover:bg-ink/[0.08] hover:text-ink'
            }`}
          >
            Todos ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setTab('disponibles')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-medium transition-all ${
              tab === 'disponibles'
                ? 'bg-success text-white'
                : 'bg-ink/[0.04] text-ink-muted hover:bg-ink/[0.08] hover:text-ink'
            }`}
          >
            🟢 Disponibles ({counts.disponibles})
          </button>
          <button
            type="button"
            onClick={() => setTab('desconectados')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-medium transition-all ${
              tab === 'desconectados'
                ? 'bg-ink/70 text-white'
                : 'bg-ink/[0.04] text-ink-muted hover:bg-ink/[0.08] hover:text-ink'
            }`}
          >
            ⚪ Desconectados ({counts.desconectados})
          </button>
          <button
            type="button"
            onClick={() => setTab('sin_locales')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-medium transition-all ${
              tab === 'sin_locales'
                ? 'bg-danger text-white'
                : 'bg-ink/[0.04] text-danger hover:bg-danger/10'
            }`}
          >
            ⚠️ Sin locales ({counts.sinLocales})
          </button>
          <button
            type="button"
            onClick={() => setTab('inactivos')}
            className={`shrink-0 rounded-xl px-3 py-1.5 font-medium transition-all ${
              tab === 'inactivos'
                ? 'bg-ink/60 text-white'
                : 'bg-ink/[0.04] text-ink-muted hover:bg-ink/[0.08] hover:text-ink'
            }`}
          >
            Inactivos ({counts.inactivos})
          </button>
        </div>
      </div>

      {/* Lista de Motorizados */}
      {!rows ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-[20px] bg-ink/[0.05]" />
          <div className="h-28 animate-pulse rounded-[20px] bg-ink/[0.05]" />
          <div className="h-28 animate-pulse rounded-[20px] bg-ink/[0.05]" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="t-card py-12">
          <EmptyState
            icon={<Ico.truck className="h-6 w-6 text-ink-muted" />}
            title="No se encontraron motorizados"
            hint={
              search
                ? `No hay repartidores que coincidan con "${search}".`
                : 'No hay motorizados en este filtro.'
            }
          />
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredRows.map((d) => {
            const asignados = d.driver_restaurants ?? []
            const sinLocales = asignados.length === 0
            const vehicleEmoji = VEHICLE_EMOJIS[d.vehicle_type] ?? '🛵'
            const vehicleName = VEHICLE_NAMES[d.vehicle_type] ?? d.vehicle_type
            const isAvailable = d.driver_availability?.is_available && d.is_active

            // Obtener nombres de locales
            const nombresLocales = asignados
              .map((r) => {
                const b = locales.find((l) => l.id === r.business_id)
                return b ? b.name : null
              })
              .filter(Boolean) as string[]

            return (
              <div
                key={d.id}
                className={`t-card p-4 transition-all hover:border-ink/20 ${
                  !d.is_active ? 'opacity-70 bg-ink/[0.01]' : ''
                }`}
              >
                {/* Contenido Principal */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Info Izquierda con Avatar */}
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Avatar con emoji de vehículo */}
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink/[0.05] text-[20px] font-bold text-ink">
                      {vehicleEmoji}
                      {/* Dot de estado */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          !d.is_active
                            ? 'bg-ink/30'
                            : isAvailable
                              ? 'bg-success ring-2 ring-success/20'
                              : 'bg-ink/30'
                        }`}
                      />
                    </div>

                    {/* Datos del motorizado */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-[15px] sm:text-[16px] text-ink truncate">
                          {d.full_name}
                        </span>

                        {/* Badges de estado */}
                        {!d.is_active ? (
                          <StatusBadge label="Inactivo" tone="neutral" />
                        ) : isAvailable ? (
                          <StatusBadge label="Disponible" tone="success" />
                        ) : (
                          <StatusBadge label="Desconectado" tone="neutral" />
                        )}

                        {sinLocales && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                            ⚠️ Sin locales
                          </span>
                        )}
                      </div>

                      {/* Metadatos: Celular, Vehículo, Placa */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-muted">
                        {d.phone ? (
                          <a
                            href={`tel:${d.phone}`}
                            className="inline-flex items-center gap-1 hover:text-ink transition-colors font-mono"
                          >
                            <Ico.phone className="h-3.5 w-3.5 text-ink-muted" />
                            <span>{d.phone}</span>
                          </a>
                        ) : (
                          <span className="text-ink-subtle">Sin teléfono</span>
                        )}

                        <span className="text-ink/20">·</span>

                        <span className="font-medium text-ink-muted">
                          {vehicleName}
                          {d.license_plate ? ` (${d.license_plate})` : ''}
                        </span>
                      </div>

                      {/* Resumen de restaurantes que atiende */}
                      <div className="mt-2">
                        {sinLocales ? (
                          <button
                            type="button"
                            onClick={() =>
                              setModalLocalesDriver({
                                id: d.id,
                                name: d.full_name,
                                selectedIds: [],
                              })
                            }
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-danger hover:underline text-left"
                          >
                            <span>⚠️ No verá ningún pedido. Pulsa aquí para asignarle locales.</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setModalLocalesDriver({
                                id: d.id,
                                name: d.full_name,
                                selectedIds: asignados.map((r) => r.business_id),
                              })
                            }
                            className="inline-flex flex-wrap items-center gap-1 text-[12px] text-ink-subtle hover:text-ink transition-colors text-left"
                          >
                            <span className="font-semibold text-ink">
                              🏪 {asignados.length} {asignados.length === 1 ? 'local' : 'locales'}:
                            </span>
                            <span className="truncate max-w-[280px] sm:max-w-md">
                              {nombresLocales.join(', ')}
                            </span>
                            <span className="text-[11px] text-brand underline ml-0.5">Editar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Barra de Acciones (adaptada a Mobile y Desktop) */}
                  <div className="mt-3 sm:mt-0 flex items-center justify-end gap-1.5 border-t border-ink/5 pt-2.5 sm:border-0 sm:pt-0 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setModalLocalesDriver({
                          id: d.id,
                          name: d.full_name,
                          selectedIds: asignados.map((r) => r.business_id),
                        })
                      }
                      className="text-[12px] h-8 px-2.5"
                    >
                      Locales ({asignados.length})
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setModalEditDriver(d)}
                      className="text-[12px] h-8 px-2.5"
                    >
                      <Ico.edit className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>

                    <Button
                      size="sm"
                      variant={d.is_active ? 'ghost' : 'soft'}
                      disabled={busyId === d.id}
                      onClick={() => toggleActive(d)}
                      className={`text-[12px] h-8 px-2.5 ${
                        d.is_active ? 'text-ink-muted hover:text-danger' : 'text-success'
                      }`}
                    >
                      {d.is_active ? 'Pausar' : 'Activar'}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal para Asignar Locales */}
      {modalLocalesDriver && (
        <DriverLocalesModal
          isOpen={true}
          onClose={() => setModalLocalesDriver(null)}
          driver={{ id: modalLocalesDriver.id, name: modalLocalesDriver.name }}
          locales={locales}
          initialSelectedIds={modalLocalesDriver.selectedIds}
          onSaved={load}
        />
      )}

      {/* Modal para Editar Datos del Motorizado */}
      {modalEditDriver && (
        <DriverEditModal
          isOpen={true}
          onClose={() => setModalEditDriver(null)}
          driver={modalEditDriver}
          onSaved={load}
        />
      )}
    </div>
  )
}
