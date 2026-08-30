'use client'

import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Ico, SectionHeader, StatusBadge } from '@/components/admin'
import { AgendaMap, type LatLng } from '@/components/agenda/agenda-map'
import { getSupabaseBrowser } from '@/lib/supabase/client'

interface AddressDirectoryItem {
  id: string
  phone: string
  customer_name: string | null
  reference: string
  lat: number | null
  lng: number | null
  accuracy_m: number | null
  source: string
  is_default: boolean
  times_used: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

interface CustomerGroup {
  phone: string
  customer_name: string
  total_orders: number
  last_used_at: string | null
  addresses: AddressDirectoryItem[]
}

function formatRelativeDate(isoString: string | null | undefined): string {
  if (!isoString) return '-'
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'hace unos segundos'
  if (diffMins < 60) return `hace ${diffMins} min`
  if (diffHours < 24) return `hace ${diffHours} h`
  if (diffDays === 1) return 'ayer'
  if (diffDays < 30) return `hace ${diffDays} días`
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
}

export default function AgendaPage() {
  const [tab, setTab] = useState<'curar' | 'todos'>('curar')
  const [items, setItems] = useState<AddressDirectoryItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Auto-dismiss toast
  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 4000)
    return () => clearTimeout(t)
  }, [toastMessage])

  // --- Filtros Pestaña 1: Por curar ---
  const [searchCurar, setSearchCurar] = useState('')
  const [onlySinPin, setOnlySinPin] = useState(false)
  const [onlyRefCorta, setOnlyRefCorta] = useState(false)
  const [onlySinNombre, setOnlySinNombre] = useState(false)
  const [minTimesUsedCurar, setMinTimesUsedCurar] = useState(0)
  const [curationSession, setCurationSession] = useState<'solo' | 'ernesto'>('solo')
  const [pageCurar, setPageCurar] = useState(1)
  const pageSizeCurar = 20

  // --- Filtros Pestaña 2: Todos los registros ---
  const [searchTodos, setSearchTodos] = useState('')
  const [hasPinFilter, setHasPinFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [lastUsedStart, setLastUsedStart] = useState<string | null>(null)
  const [lastUsedEnd, setLastUsedEnd] = useState<string | null>(null)
  const [minAccuracy, setMinAccuracy] = useState<number | null>(null)
  const [maxAccuracy, setMaxAccuracy] = useState<number | null>(null)
  const [minTimesUsedTodos, setMinTimesUsedTodos] = useState(0)
  const [groupByCustomer, setGroupByCustomer] = useState(true)
  const [pageTodos, setPageTodos] = useState(1)
  const pageSizeTodos = 25

  // PopUp / Modal de direcciones de un cliente seleccionado
  const [viewingCustomer, setViewingCustomer] = useState<CustomerGroup | null>(null)

  // Modal de Curación / Edición
  const [editingAddress, setEditingAddress] = useState<AddressDirectoryItem | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<AddressDirectoryItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editReference, setEditReference] = useState('')
  const [editLat, setEditLat] = useState('')
  const [editLng, setEditLng] = useState('')
  const [editIsDefault, setEditIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  // Carga de datos inicial desde Supabase (`address_directory`)
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowser()
      // biome-ignore lint/suspicious/noExplicitAny: query sobre address_directory
      const { data, error: sbErr } = await (supabase as any)
        .from('address_directory')
        .select('*')
        .order('last_used_at', { ascending: false, nullsFirst: false })

      if (sbErr) {
        setError(sbErr.message)
      } else {
        setItems(data ?? [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la agenda')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // KPIs / Stats de Curación
  const stats = useMemo(() => {
    if (!items) return { total: 0, curated: 0, pending: 0, percentage: 0 }
    const total = items.length
    const curated = items.filter(
      (a) =>
        a.lat !== null &&
        a.lng !== null &&
        a.reference.trim().length >= 15 &&
        Boolean(a.customer_name?.trim()),
    ).length
    const pending = total - curated
    const percentage = total ? Math.round((curated / total) * 100) : 0
    return { total, curated, pending, percentage }
  }, [items])

  // Resetea paginación al cambiar filtros en Pestaña 1
  useEffect(() => {
    setPageCurar(1)
  }, [searchCurar, onlySinPin, onlyRefCorta, onlySinNombre, minTimesUsedCurar])

  // Resetea paginación al cambiar filtros en Pestaña 2
  useEffect(() => {
    setPageTodos(1)
  }, [
    searchTodos,
    hasPinFilter,
    selectedSources,
    lastUsedStart,
    lastUsedEnd,
    minAccuracy,
    maxAccuracy,
    minTimesUsedTodos,
    groupByCustomer,
  ])

  // --- FILTRADO PESTAÑA 1: POR CURAR ---
  const listCurar = useMemo(() => {
    if (!items) return []
    const q = searchCurar.trim().toLowerCase()

    return items.filter((a) => {
      const isCurated =
        a.lat !== null &&
        a.lng !== null &&
        a.reference.trim().length >= 15 &&
        Boolean(a.customer_name?.trim())

      if (isCurated) return false

      if (q) {
        const matchPhone = a.phone.includes(q)
        const matchName = (a.customer_name ?? '').toLowerCase().includes(q)
        const matchRef = a.reference.toLowerCase().includes(q)
        if (!matchPhone && !matchName && !matchRef) return false
      }

      const sinPin = a.lat === null || a.lng === null
      const refCorta = a.reference.trim().length < 15
      const sinNombre = !a.customer_name?.trim()

      if (onlySinPin && !sinPin) return false
      if (onlyRefCorta && !refCorta) return false
      if (onlySinNombre && !sinNombre) return false
      if (minTimesUsedCurar > 0 && (a.times_used || 0) < minTimesUsedCurar) return false

      return true
    })
  }, [items, searchCurar, onlySinPin, onlyRefCorta, onlySinNombre, minTimesUsedCurar])

  const totalPagesCurar = Math.ceil(listCurar.length / pageSizeCurar) || 1
  const paginatedCurar = useMemo(() => {
    const start = (pageCurar - 1) * pageSizeCurar
    return listCurar.slice(start, start + pageSizeCurar)
  }, [listCurar, pageCurar])

  // --- FILTRADO PESTAÑA 2: TODOS LOS REGISTROS ---
  const listTodos = useMemo(() => {
    if (!items) return []
    const q = searchTodos.trim().toLowerCase()

    return items.filter((a) => {
      if (q) {
        const matchPhone = a.phone.includes(q)
        const matchName = (a.customer_name ?? '').toLowerCase().includes(q)
        const matchRef = a.reference.toLowerCase().includes(q)
        if (!matchPhone && !matchName && !matchRef) return false
      }

      if (hasPinFilter === 'yes' && (a.lat === null || a.lng === null)) return false
      if (hasPinFilter === 'no' && a.lat !== null && a.lng !== null) return false

      if (selectedSources.length > 0 && !selectedSources.includes(a.source)) return false

      if (minTimesUsedTodos > 0 && (a.times_used || 0) < minTimesUsedTodos) return false

      if (lastUsedStart && a.last_used_at && a.last_used_at < lastUsedStart) return false
      if (lastUsedEnd && a.last_used_at && a.last_used_at > `${lastUsedEnd}T23:59:59`) return false

      if (minAccuracy !== null && (a.accuracy_m === null || a.accuracy_m < minAccuracy))
        return false
      if (maxAccuracy !== null && a.accuracy_m !== null && a.accuracy_m > maxAccuracy) return false

      return true
    })
  }, [
    items,
    searchTodos,
    hasPinFilter,
    selectedSources,
    minTimesUsedTodos,
    lastUsedStart,
    lastUsedEnd,
    minAccuracy,
    maxAccuracy,
  ])

  // Agrupación por cliente
  const customerGroupsTodos = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, AddressDirectoryItem[]>()
    for (const item of listTodos) {
      const list = map.get(item.phone) ?? []
      list.push(item)
      map.set(item.phone, list)
    }

    const groups: CustomerGroup[] = []
    map.forEach((addrs, phone) => {
      const name =
        addrs.find((a) => a.customer_name?.trim())?.customer_name?.trim() ?? 'Cliente sin nombre'
      const total_orders = addrs.reduce((acc, a) => acc + (a.times_used || 0), 0)
      const last_used_at = addrs.reduce<string | null>((latest, a) => {
        if (!a.last_used_at) return latest
        if (!latest) return a.last_used_at
        return Date.parse(a.last_used_at) > Date.parse(latest) ? a.last_used_at : latest
      }, null)

      groups.push({
        phone,
        customer_name: name,
        total_orders,
        last_used_at,
        addresses: addrs.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0)),
      })
    })

    return groups
  }, [listTodos])

  // Mantener actualizado el grupo que se esté viendo en PopUp al recargar datos
  const activeViewingCustomer = useMemo(() => {
    if (!viewingCustomer) return null
    return customerGroupsTodos.find((g) => g.phone === viewingCustomer.phone) ?? viewingCustomer
  }, [viewingCustomer, customerGroupsTodos])

  const totalItemsTodos = groupByCustomer ? customerGroupsTodos.length : listTodos.length
  const totalPagesTodos = Math.ceil(totalItemsTodos / pageSizeTodos) || 1
  const paginatedTodos = useMemo(() => {
    const start = (pageTodos - 1) * pageSizeTodos
    if (groupByCustomer) {
      return customerGroupsTodos.slice(start, start + pageSizeTodos)
    }
    return listTodos.slice(start, start + pageSizeTodos)
  }, [groupByCustomer, customerGroupsTodos, listTodos, pageTodos])

  // Coordenadas parseadas para el mapa interactivo Leaflet
  const mapCoords = useMemo<LatLng | null>(() => {
    const latNum = Number.parseFloat(editLat)
    const lngNum = Number.parseFloat(editLng)
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null
    return { lat: latNum, lng: lngNum }
  }, [editLat, editLng])

  // Abrir modal de edición / curación
  const openEditModal = (addr: AddressDirectoryItem) => {
    setEditingAddress(addr)
    setEditName(addr.customer_name ?? '')
    setEditReference(addr.reference ?? '')
    setEditLat(addr.lat !== null ? String(addr.lat) : '')
    setEditLng(addr.lng !== null ? String(addr.lng) : '')
    setEditIsDefault(addr.is_default)
  }

  // Guardar edición
  const handleSaveAddress = async () => {
    if (!editingAddress) return
    setSaving(true)
    try {
      const supabase = getSupabaseBrowser()
      const latNum = editLat.trim() !== '' ? Number.parseFloat(editLat) : null
      const lngNum = editLng.trim() !== '' ? Number.parseFloat(editLng) : null

      // biome-ignore lint/suspicious/noExplicitAny: update sobre address_directory
      const { error: err } = await (supabase as any)
        .from('address_directory')
        .update({
          customer_name: editName.trim() || null,
          reference: editReference.trim(),
          lat: Number.isNaN(latNum) ? null : latNum,
          lng: Number.isNaN(lngNum) ? null : lngNum,
          source: 'admin_curated',
          is_default: editIsDefault,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingAddress.id)

      if (err) throw err

      if (editIsDefault) {
        // biome-ignore lint/suspicious/noExplicitAny: reset default
        await (supabase as any)
          .from('address_directory')
          .update({ is_default: false })
          .eq('phone', editingAddress.phone)
          .neq('id', editingAddress.id)
      }

      setEditingAddress(null)
      setToastMessage('¡Registro curado y guardado exitosamente!')
      await loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar la dirección')
    } finally {
      setSaving(false)
    }
  }

  // Marcar como predeterminada rápida
  const handleSetDefault = async (addr: AddressDirectoryItem) => {
    try {
      const supabase = getSupabaseBrowser()
      // biome-ignore lint/suspicious/noExplicitAny: reset default
      await (supabase as any)
        .from('address_directory')
        .update({ is_default: false })
        .eq('phone', addr.phone)

      // biome-ignore lint/suspicious/noExplicitAny: update default
      const { error: err } = await (supabase as any)
        .from('address_directory')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', addr.id)

      if (err) throw err
      setToastMessage(`Dirección predeterminada actualizada para +51 ${addr.phone}`)
      await loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al marcar como predeterminada')
    }
  }

  // Confirmar eliminación
  const confirmDeleteAddress = async () => {
    if (!deletingRecord) return
    try {
      const supabase = getSupabaseBrowser()
      // biome-ignore lint/suspicious/noExplicitAny: delete sobre address_directory
      const { error: err } = await (supabase as any)
        .from('address_directory')
        .delete()
        .eq('id', deletingRecord.id)

      if (err) throw err
      setDeletingRecord(null)
      setToastMessage('Registro eliminado de la agenda.')
      await loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar el registro')
    }
  }

  const toggleSource = (src: string) => {
    setSelectedSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src],
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeader
        eyebrow="Directorio Hiperlocal"
        title="Agenda de Clientes"
        description="Cura ubicaciones con mapa interactivo Leaflet, gestiona direcciones agrupadas por cliente en PopUp y mantén la precisión de entregas en San Jacinto."
        right={
          <Button size="sm" variant="outline" onClick={loadData}>
            Refrescar
          </Button>
        }
      />

      {/* Banner de progreso de curación (Fidelidad Legacy) */}
      <div className="rounded-2xl p-5 md:p-6 bg-brand-soft/40 border border-brand/20 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex-1">
          <p className="text-xs font-bold tracking-wider uppercase text-brand">
            Progreso de Curación de la Agenda
          </p>
          <p className="text-xl md:text-2xl font-black mt-1 text-ink">
            {stats.curated} de {stats.total} direcciones curadas ({stats.percentage}%)
          </p>
          <div className="w-full bg-brand/15 rounded-full h-3 mt-3 overflow-hidden">
            <div
              className="bg-brand h-full transition-all duration-500 rounded-full"
              style={{ width: `${stats.percentage}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-ink-muted">
            Quedan <strong className="text-brand">{stats.pending} direcciones</strong> pendientes de
            fijar PIN o completar referencia.
          </p>
        </div>
        <div className="shrink-0 flex items-center justify-center w-14 h-14 rounded-2xl bg-brand/10 text-brand">
          <Ico.check className="h-7 w-7" />
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 flex items-center gap-2 text-sm font-bold shadow-md animate-fade-in">
          <Ico.check className="h-5 w-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {error && <p className="text-[14px] text-danger font-semibold">{error}</p>}

      {/* Tabs */}
      <div className="flex border-border border-b gap-4">
        <button
          type="button"
          onClick={() => setTab('curar')}
          className={`flex items-center gap-2 pb-3 text-sm font-bold border-b-2 transition-all px-1 ${
            tab === 'curar'
              ? 'border-brand text-brand'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Ico.edit className="h-4 w-4" />
          Por curar ({stats.pending})
        </button>
        <button
          type="button"
          onClick={() => setTab('todos')}
          className={`flex items-center gap-2 pb-3 text-sm font-bold border-b-2 transition-all px-1 ${
            tab === 'todos'
              ? 'border-brand text-brand'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <Ico.contacts className="h-4 w-4" />
          Todos los registros ({items?.length ?? 0})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: POR CURAR                                                     */}
      {/* ========================================================================= */}
      {tab === 'curar' && (
        <div className="space-y-4">
          {/* Panel de Filtros Por Curar */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Buscar por teléfono o nombre..."
                  value={searchCurar}
                  onChange={(e) => setSearchCurar(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-surface px-3 pl-9 text-sm text-ink outline-none focus:border-brand"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                  <Ico.search className="h-4 w-4" />
                </span>
              </div>

              {/* Selector de Sesión */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Sesión:
                </span>
                <div className="flex bg-surface rounded-xl p-1 border border-border">
                  <button
                    type="button"
                    onClick={() => setCurationSession('solo')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      curationSession === 'solo'
                        ? 'bg-card text-brand shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Solo
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurationSession('ernesto')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      curationSession === 'ernesto'
                        ? 'bg-card text-brand shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Ernesto (Auto-avance)
                  </button>
                </div>
              </div>
            </div>

            {/* Checkboxes de filtro rápido */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-3 border-t border-border text-xs">
              <label className="flex items-center gap-2 font-semibold text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlySinPin}
                  onChange={(e) => setOnlySinPin(e.target.checked)}
                  className="rounded text-brand focus:ring-brand"
                />
                Solo sin PIN GPS
              </label>
              <label className="flex items-center gap-2 font-semibold text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyRefCorta}
                  onChange={(e) => setOnlyRefCorta(e.target.checked)}
                  className="rounded text-brand focus:ring-brand"
                />
                Solo referencia corta (&lt;15c)
              </label>
              <label className="flex items-center gap-2 font-semibold text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlySinNombre}
                  onChange={(e) => setOnlySinNombre(e.target.checked)}
                  className="rounded text-brand focus:ring-brand"
                />
                Solo sin nombre de cliente
              </label>

              {/* Slider Pedidos Mínimos */}
              <div className="flex items-center gap-2 ml-auto">
                <span className="font-semibold text-ink-muted">Pedidos mínimos:</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={minTimesUsedCurar}
                  onChange={(e) => setMinTimesUsedCurar(Number(e.target.value))}
                  className="w-24 accent-brand"
                />
                <span className="font-mono text-xs bg-brand-light text-brand-dark px-2 py-0.5 rounded-md font-bold">
                  {minTimesUsedCurar}
                </span>
              </div>
            </div>
          </div>

          {/* Tabla de Por Curar */}
          {loading ? (
            <div className="h-64 animate-pulse rounded-[22px] bg-ink/[0.05]" />
          ) : paginatedCurar.length === 0 ? (
            <div className="t-card">
              <EmptyState
                icon={<Ico.check className="h-6 w-6" />}
                title="Todo curado"
                hint="No se encontraron registros de clientes que cumplan los filtros para curación."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm min-w-[850px]">
                    <thead className="border-b border-border bg-surface text-[11px] font-mono font-bold uppercase tracking-wider text-ink-muted">
                      <tr>
                        <th className="px-4 py-3.5">Teléfono</th>
                        <th className="px-4 py-3.5">Nombre</th>
                        <th className="px-4 py-3.5">Referencia</th>
                        <th className="px-4 py-3.5">Pedidos</th>
                        <th className="px-4 py-3.5">Último uso</th>
                        <th className="px-4 py-3.5">Origen</th>
                        <th className="px-4 py-3.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedCurar.map((row) => {
                        const sinPin = row.lat === null || row.lng === null
                        const refCorta = row.reference.trim().length < 15
                        return (
                          <tr key={row.id} className="hover:bg-surface/50 transition-colors">
                            <td className="px-4 py-3.5 font-mono font-bold text-ink whitespace-nowrap">
                              +51 {row.phone}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {row.customer_name ? (
                                <span className="font-semibold text-ink">{row.customer_name}</span>
                              ) : (
                                <span className="italic text-ink-subtle">Sin nombre</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-medium text-ink leading-snug">{row.reference}</p>
                              <div className="flex gap-1.5 mt-1">
                                {sinPin && (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                    ⚠️ Sin PIN GPS
                                  </span>
                                )}
                                {refCorta && (
                                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                    Ref. corta ({row.reference.trim().length}c)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs font-bold text-ink-muted whitespace-nowrap">
                              {row.times_used} ped.
                            </td>
                            <td className="px-4 py-3.5 text-xs text-ink-subtle whitespace-nowrap">
                              {formatRelativeDate(row.last_used_at)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <StatusBadge label={row.source} tone="neutral" />
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <Button size="sm" onClick={() => openEditModal(row)}>
                                <Ico.edit className="h-3.5 w-3.5" /> Curar
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación Por Curar */}
              {totalPagesCurar > 1 && (
                <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageCurar((p) => Math.max(1, p - 1))}
                    disabled={pageCurar === 1}
                  >
                    Anterior
                  </Button>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Página {pageCurar} de {totalPagesCurar} ({listCurar.length} registros)
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageCurar((p) => Math.min(totalPagesCurar, p + 1))}
                    disabled={pageCurar === totalPagesCurar}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: TODOS LOS REGISTROS                                           */}
      {/* ========================================================================= */}
      {tab === 'todos' && (
        <div className="space-y-4">
          {/* Panel de Filtros Avanzados */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Buscador */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Búsqueda:
                </span>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Teléfono, nombre, referencia..."
                    value={searchTodos}
                    onChange={(e) => setSearchTodos(e.target.value)}
                    className="w-full h-10 rounded-xl border border-border bg-surface px-3 pl-9 text-sm text-ink outline-none focus:border-brand"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                    <Ico.search className="h-4 w-4" />
                  </span>
                </div>
              </div>

              {/* Estado del Pin */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Estado del PIN GPS:
                </span>
                <select
                  value={hasPinFilter}
                  onChange={(e) => setHasPinFilter(e.target.value as 'all' | 'yes' | 'no')}
                  className="h-10 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-ink outline-none focus:border-brand"
                >
                  <option value="all">Todos los registros</option>
                  <option value="yes">Con PIN GPS</option>
                  <option value="no">Sin PIN GPS</option>
                </select>
              </div>

              {/* Orígenes */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Origen de datos:
                </span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['backfill', 'driver_verified', 'admin_curated', 'business_created'].map(
                    (src) => {
                      const active = selectedSources.includes(src)
                      return (
                        <button
                          type="button"
                          key={src}
                          onClick={() => toggleSource(src)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                            active
                              ? 'bg-brand text-white border-brand'
                              : 'bg-surface text-ink-muted border-border hover:border-ink/20'
                          }`}
                        >
                          {src}
                        </button>
                      )
                    },
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-border">
              {/* Rangos de Fecha */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Último uso (Rango):
                </span>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={lastUsedStart ?? ''}
                    onChange={(e) => setLastUsedStart(e.target.value || null)}
                    className="w-1/2 h-9 rounded-xl border border-border bg-surface px-2 text-xs font-medium text-ink outline-none"
                  />
                  <input
                    type="date"
                    value={lastUsedEnd ?? ''}
                    onChange={(e) => setLastUsedEnd(e.target.value || null)}
                    className="w-1/2 h-9 rounded-xl border border-border bg-surface px-2 text-xs font-medium text-ink outline-none"
                  />
                </div>
              </div>

              {/* Rango de Precisión */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Precisión GPS (metros):
                </span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min (m)"
                    value={minAccuracy ?? ''}
                    onChange={(e) =>
                      setMinAccuracy(e.target.value !== '' ? Number(e.target.value) : null)
                    }
                    className="w-1/2 h-9 rounded-xl border border-border bg-surface px-2 text-xs font-medium text-ink outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Max (m)"
                    value={maxAccuracy ?? ''}
                    onChange={(e) =>
                      setMaxAccuracy(e.target.value !== '' ? Number(e.target.value) : null)
                    }
                    className="w-1/2 h-9 rounded-xl border border-border bg-surface px-2 text-xs font-medium text-ink outline-none"
                  />
                </div>
              </div>

              {/* Slider Pedidos Mínimos & Toggle Agrupado */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                  Vista y Mínimo de Pedidos:
                </span>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={groupByCustomer}
                      onChange={(e) => setGroupByCustomer(e.target.checked)}
                      className="rounded text-brand focus:ring-brand"
                    />
                    Agrupar por Cliente
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="30"
                      value={minTimesUsedTodos}
                      onChange={(e) => setMinTimesUsedTodos(Number(e.target.value))}
                      className="w-20 accent-brand"
                    />
                    <span className="font-mono text-xs bg-brand-light text-brand-dark px-1.5 py-0.5 rounded font-bold">
                      {minTimesUsedTodos}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TABLA PRINCIPAL PESTAÑA 2 */}
          {loading ? (
            <div className="h-64 animate-pulse rounded-[22px] bg-ink/[0.05]" />
          ) : paginatedTodos.length === 0 ? (
            <div className="t-card">
              <EmptyState
                icon={<Ico.search className="h-6 w-6" />}
                title="Sin resultados"
                hint="Ningún registro coincide con los filtros aplicados."
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  {groupByCustomer ? (
                    /* MODO AGRUPADO POR CLIENTE (ABRE POPUP AL HACER CLIC) */
                    <table className="w-full text-left text-sm min-w-[850px]">
                      <thead className="border-b border-border bg-surface text-[11px] font-mono font-bold uppercase tracking-wider text-ink-muted">
                        <tr>
                          <th className="px-4 py-3.5 text-left">Teléfono</th>
                          <th className="px-4 py-3.5 text-left">Cliente</th>
                          <th className="px-4 py-3.5 text-left">Direcciones Registradas</th>
                          <th className="px-4 py-3.5 text-left">Total Pedidos</th>
                          <th className="px-4 py-3.5 text-left">Último uso</th>
                          <th className="px-4 py-3.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(paginatedTodos as CustomerGroup[]).map((group) => (
                          <tr
                            key={group.phone}
                            className="hover:bg-surface/50 transition-colors cursor-pointer select-none"
                            onClick={() => setViewingCustomer(group)}
                          >
                            <td className="px-4 py-3.5 font-mono font-bold text-ink whitespace-nowrap">
                              +51 {group.phone}
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-ink whitespace-nowrap">
                              {group.customer_name}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <StatusBadge
                                label={`${group.addresses.length} ${group.addresses.length === 1 ? 'dirección' : 'direcciones'}`}
                                tone="neutral"
                              />
                            </td>
                            <td className="px-4 py-3.5 font-mono text-xs font-bold text-ink-muted whitespace-nowrap">
                              {group.total_orders} ped.
                            </td>
                            <td className="px-4 py-3.5 text-xs text-ink-subtle whitespace-nowrap">
                              {formatRelativeDate(group.last_used_at)}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setViewingCustomer(group)
                                }}
                              >
                                Ver direcciones
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    /* MODO PLANO (FILA POR DIRECCIÓN) */
                    <table className="w-full text-left text-sm min-w-[950px]">
                      <thead className="border-b border-border bg-surface text-[11px] font-mono font-bold uppercase tracking-wider text-ink-muted">
                        <tr>
                          <th className="px-4 py-3.5 text-left">Teléfono</th>
                          <th className="px-4 py-3.5 text-left">Nombre</th>
                          <th className="px-4 py-3.5 text-left">Referencia</th>
                          <th className="px-4 py-3.5 text-left">Pedidos</th>
                          <th className="px-4 py-3.5 text-left">Último uso</th>
                          <th className="px-4 py-3.5 text-left">Origen</th>
                          <th className="px-4 py-3.5 text-left">PIN GPS</th>
                          <th className="px-4 py-3.5 text-left">Default</th>
                          <th className="px-4 py-3.5 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {(paginatedTodos as AddressDirectoryItem[]).map((row) => {
                          const hasPin = row.lat !== null && row.lng !== null
                          return (
                            <tr key={row.id} className="hover:bg-surface/50 transition-colors">
                              <td className="px-4 py-3.5 font-mono font-bold text-ink whitespace-nowrap">
                                +51 {row.phone}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-ink">
                                {row.customer_name ? (
                                  row.customer_name
                                ) : (
                                  <span className="italic text-ink-subtle font-normal">
                                    Sin nombre
                                  </span>
                                )}
                              </td>
                              <td
                                className="px-4 py-3.5 max-w-[240px] truncate"
                                title={row.reference}
                              >
                                {row.reference}
                              </td>
                              <td className="px-4 py-3.5 font-mono text-xs font-bold text-ink-muted whitespace-nowrap">
                                {row.times_used} ped.
                              </td>
                              <td className="px-4 py-3.5 text-xs text-ink-subtle whitespace-nowrap">
                                {formatRelativeDate(row.last_used_at)}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <StatusBadge label={row.source} tone="neutral" />
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {hasPin ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-success">
                                    <Ico.check className="h-3.5 w-3.5" /> Sí (
                                    {Math.round(row.accuracy_m ?? 0)}m)
                                  </span>
                                ) : (
                                  <span className="text-xs font-semibold text-ink-subtle">No</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {row.is_default ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                                    Principal
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleSetDefault(row)}
                                    className="text-[10px] font-bold text-brand hover:underline uppercase tracking-wider"
                                  >
                                    Hacer principal
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditModal(row)}
                                  >
                                    <Ico.edit className="h-3.5 w-3.5" /> Editar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-danger hover:bg-danger-soft"
                                    onClick={() => setDeletingRecord(row)}
                                  >
                                    <Ico.trash className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Paginación Pestaña 2 */}
              {totalPagesTodos > 1 && (
                <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageTodos((p) => Math.max(1, p - 1))}
                    disabled={pageTodos === 1}
                  >
                    Anterior
                  </Button>
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink-muted">
                    Página {pageTodos} de {totalPagesTodos} ({totalItemsTodos}{' '}
                    {groupByCustomer ? 'clientes' : 'registros'})
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPageTodos((p) => Math.min(totalPagesTodos, p + 1))}
                    disabled={pageTodos === totalPagesTodos}
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP / MODAL DE DIRECCIONES DEL CLIENTE                                   */}
      {/* ========================================================================= */}
      {activeViewingCustomer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Direcciones de ${activeViewingCustomer.customer_name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-ink">
                  Direcciones de {activeViewingCustomer.customer_name}
                </h3>
                <p className="font-mono text-xs font-semibold text-brand">
                  +51 {activeViewingCustomer.phone} · {activeViewingCustomer.total_orders} pedidos
                  realizados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                className="text-ink-muted hover:text-ink"
              >
                <Ico.close className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Direcciones guardadas ({activeViewingCustomer.addresses.length})
              </p>
              <div className="space-y-2">
                {activeViewingCustomer.addresses.map((addr) => {
                  const hasPin = addr.lat !== null && addr.lng !== null
                  return (
                    <div
                      key={addr.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                        addr.is_default
                          ? 'border-brand/40 bg-brand-soft/20 shadow-xs'
                          : 'border-border bg-surface/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {addr.is_default && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded-full">
                              <Ico.star className="h-3 w-3 fill-brand" /> Predeterminada
                            </span>
                          )}
                          {hasPin ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success-soft px-2 py-0.5 rounded-full">
                              <Ico.mapPin className="h-3 w-3" /> PIN GPS (
                              {Math.round(addr.accuracy_m ?? 0)}m)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              ⚠️ Sin PIN GPS
                            </span>
                          )}
                          <span className="text-[10px] text-ink-subtle font-mono">
                            {addr.source}
                          </span>
                        </div>

                        <p className="text-sm font-semibold text-ink leading-snug">
                          {addr.reference}
                        </p>

                        {hasPin && (
                          <p className="font-mono text-[11px] text-ink-subtle">
                            GPS: {addr.lat?.toFixed(5)}, {addr.lng?.toFixed(5)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {!addr.is_default && (
                          <Button size="sm" variant="ghost" onClick={() => handleSetDefault(addr)}>
                            Hacer principal
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={hasPin ? 'outline' : 'brand'}
                          onClick={() => openEditModal(addr)}
                        >
                          <Ico.edit className="h-3.5 w-3.5" />
                          {hasPin ? 'Editar' : 'Curar / Fijar GPS'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:bg-danger-soft"
                          onClick={() => setDeletingRecord(addr)}
                        >
                          <Ico.trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end border-t border-border pt-3">
              <Button variant="ghost" onClick={() => setViewingCustomer(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CURACIÓN Y EDICIÓN CON MAPA LEAFLET INTERACTIVO                   */}
      {/* ========================================================================= */}
      {editingAddress && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Curar / Editar Dirección"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-bold text-lg text-ink">Curar / Editar Dirección</h3>
                <p className="text-xs text-ink-muted">
                  Haz clic o arrastra el marcador en el mapa de San Jacinto para seleccionar el
                  punto exacto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAddress(null)}
                className="text-ink-muted hover:text-ink"
              >
                <Ico.close className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* MAPA INTERACTIVO LEAFLET */}
              <div>
                <p className="block text-xs font-mono font-bold uppercase tracking-wider text-ink-muted mb-1.5">
                  Mapa Interactivo (San Jacinto)
                </p>
                <AgendaMap
                  value={mapCoords}
                  onChange={(coords) => {
                    setEditLat(coords.lat.toFixed(6))
                    setEditLng(coords.lng.toFixed(6))
                  }}
                  heightPx={240}
                />
                <div className="mt-2 flex items-center justify-between bg-surface px-3 py-2 rounded-xl border border-border font-mono text-xs text-ink-muted">
                  <span>GPS Seleccionado:</span>
                  {mapCoords ? (
                    <span className="font-bold text-brand">
                      {mapCoords.lat.toFixed(6)}, {mapCoords.lng.toFixed(6)}
                    </span>
                  ) : (
                    <span className="italic text-amber-600">
                      Sin PIN GPS seleccionado (Haz clic en el mapa)
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="block text-xs font-mono font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Teléfono
                  </p>
                  <input
                    disabled
                    value={editingAddress.phone}
                    className="w-full h-10 rounded-xl border border-border bg-ink/[0.04] px-3 font-mono font-bold text-ink"
                  />
                </div>

                <div>
                  <p className="block text-xs font-mono font-bold uppercase tracking-wider text-ink-muted mb-1">
                    Nombre del Cliente
                  </p>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ej: María Quispe"
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-ink outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div>
                <p className="block text-xs font-mono font-bold uppercase tracking-wider text-ink-muted mb-1">
                  Dirección / Referencia de Entrega
                </p>
                <textarea
                  rows={2}
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                  placeholder="Ej: Jr. San Martín 245, casa azul frente al parque..."
                  className="w-full rounded-xl border border-border bg-card p-3 text-ink outline-none focus:border-brand resize-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editIsDefault}
                  onChange={(e) => setEditIsDefault(e.target.checked)}
                  className="rounded text-brand focus:ring-brand"
                />
                <span className="text-xs font-semibold text-ink">
                  Marcar como dirección predeterminada de este cliente
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setEditingAddress(null)}>
                Cancelar
              </Button>
              <Button disabled={saving} onClick={handleSaveAddress}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {deletingRecord && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="¿Eliminar registro de la agenda?"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-ink">¿Eliminar registro de la agenda?</h3>
            <p className="text-sm text-ink-muted">
              ¿Estás seguro de eliminar la dirección de <strong>+51 {deletingRecord.phone}</strong>{' '}
              (<i>{deletingRecord.reference}</i>)? Esto NO borrará los pedidos del teléfono.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeletingRecord(null)}>
                Cancelar
              </Button>
              <Button
                variant="ghost"
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={confirmDeleteAddress}
              >
                Sí, eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
