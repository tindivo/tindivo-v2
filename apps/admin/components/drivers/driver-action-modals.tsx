'use client'

import { VEHICLE_TYPES, type VehicleType } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { Field, Ico } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

interface BizRow {
  id: string
  name: string
  is_active: boolean
}

interface DrvRow {
  id: string
  full_name: string
  phone: string | null
  vehicle_type: string
  license_plate: string | null
  is_active: boolean
}

const VEHICLE_LABELS: Record<string, { label: string; icon: string }> = {
  moto: { label: 'Moto', icon: '🛵' },
  bici: { label: 'Bicicleta', icon: '🚲' },
  auto: { label: 'Auto', icon: '🚗' },
  pie: { label: 'A pie', icon: '🚶' },
}

// ── 1. Modal para Asignar Locales a un Motorizado ─────────────────────────────
export function DriverLocalesModal({
  isOpen,
  onClose,
  driver,
  locales,
  initialSelectedIds,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  driver: { id: string; name: string }
  locales: BizRow[]
  initialSelectedIds: string[]
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds))
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected(new Set(initialSelectedIds))
    setSearch('')
    setError(null)
  }, [initialSelectedIds])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const filtered = locales.filter((b) => b.name.toLowerCase().includes(search.toLowerCase().trim()))

  function toggleAll() {
    if (selected.size === locales.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(locales.map((l) => l.id)))
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/admin/drivers/${driver.id}/restaurants`, {
        businessIds: [...selected],
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Asignar restaurantes al motorizado"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm transition-all"
    >
      <div
        role="document"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] sm:max-h-[90vh] w-full sm:max-w-lg flex-col rounded-t-[24px] sm:rounded-[24px] bg-white p-5 sm:p-6 shadow-2xl border border-ink/10"
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between border-b border-ink/10 pb-3.5">
          <div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Asignar restaurantes
            </span>
            <h3 className="font-bold text-[18px] text-ink">{driver.name}</h3>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              El motorizado solo verá pedidos de los locales que tenga autorizados.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink transition-colors"
          >
            <Ico.close className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger/10 p-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        {/* Buscador y botón seleccionar todos */}
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Ico.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
            <input
              type="text"
              placeholder="Buscar restaurante…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="t-field pl-9 pr-8 text-[13px] py-1.5"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink text-[12px]"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-[12px] text-ink-muted px-1">
            <span>
              {selected.size} de {locales.length} seleccionados
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="font-medium text-brand hover:underline"
            >
              {selected.size === locales.length ? 'Desmarcar todos' : 'Seleccionar todos'}
            </button>
          </div>
        </div>

        {/* Lista de locales con scroll */}
        <div className="mt-2 flex-1 overflow-y-auto min-h-[160px] max-h-[320px] space-y-1 pr-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-ink-muted">
              No se encontraron restaurantes.
            </div>
          ) : (
            filtered.map((b) => {
              const isChecked = selected.has(b.id)
              return (
                <label
                  key={b.id}
                  className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3 border transition-all ${
                    isChecked
                      ? 'border-brand/40 bg-brand/5'
                      : 'border-ink/5 bg-ink/[0.01] hover:bg-ink/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const s = new Set(selected)
                        if (e.target.checked) s.add(b.id)
                        else s.delete(b.id)
                        setSelected(s)
                      }}
                      className="h-4 w-4 rounded border-ink/20 text-brand focus:ring-brand"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-[14px] text-ink truncate">{b.name}</div>
                      {!b.is_active && (
                        <span className="text-[11px] text-ink-subtle">Local inactivo</span>
                      )}
                    </div>
                  </div>
                  {isChecked && (
                    <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                      Asignado
                    </span>
                  )}
                </label>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-ink/10 pt-3">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" variant="brand" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : `Guardar cambios (${selected.size})`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── 2. Modal para Editar Datos del Motorizado ─────────────────────────────────
export function DriverEditModal({
  isOpen,
  onClose,
  driver,
  onSaved,
}: {
  isOpen: boolean
  onClose: () => void
  driver: DrvRow | null
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleType, setVehicleType] = useState<string>('moto')
  const [licensePlate, setLicensePlate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (driver) {
      setFullName(driver.full_name)
      setPhone(driver.phone ?? '')
      setVehicleType(driver.vehicle_type ?? 'moto')
      setLicensePlate(driver.license_plate ?? '')
      setError(null)
    }
  }, [driver])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !driver) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!driver) return
    if (!fullName.trim()) {
      setError('El nombre completo es obligatorio.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/admin/drivers/${driver.id}`, {
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        vehicleType: vehicleType as VehicleType,
        licensePlate: licensePlate.trim().toUpperCase() || '',
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Editar datos del motorizado"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 backdrop-blur-sm transition-all"
    >
      <div
        role="document"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] bg-white p-5 sm:p-6 shadow-2xl border border-ink/10"
      >
        <div className="flex items-start justify-between border-b border-ink/10 pb-3.5">
          <div>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Editar motorizado
            </span>
            <h3 className="font-bold text-[18px] text-ink">{driver.full_name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink transition-colors"
          >
            <Ico.close className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-danger/20 bg-danger/10 p-2.5 text-[13px] text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <Field label="Nombre completo">
            <input
              type="text"
              className="t-field"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>

          <Field label="Celular de contacto">
            <input
              type="text"
              className="t-field font-mono"
              placeholder="987654321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <div>
            <span className="t-field-label block mb-1.5">Tipo de vehículo</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VEHICLE_TYPES.map((v) => {
                const info = VEHICLE_LABELS[v] ?? { label: v, icon: '🛵' }
                const isSelected = vehicleType === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVehicleType(v)}
                    className={`flex flex-col items-center justify-center rounded-xl p-2.5 text-center border transition-all ${
                      isSelected
                        ? 'border-brand bg-brand/10 text-brand ring-1 ring-brand'
                        : 'border-ink/10 bg-white hover:bg-ink/[0.03] text-ink'
                    }`}
                  >
                    <span className="text-[20px]">{info.icon}</span>
                    <span className="mt-1 font-semibold text-[12px]">{info.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <Field label="Placa del vehículo">
            <input
              type="text"
              className="t-field font-mono uppercase"
              placeholder="Ej. 1234-5B"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
            />
          </Field>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-ink/10 pt-3">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" variant="brand" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar datos'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
