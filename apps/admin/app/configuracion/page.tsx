'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { Button } from '@tindivo/ui'
import { useCallback, useEffect, useState } from 'react'
import { Field, SectionHeader } from '@/components/admin'
import { CoveragePolygonEditor, type LatLng } from '@/components/coverage-polygon-editor'
import { api, errMsg } from '@/lib/api'
import { TIMER_FIELDS, WEEKDAYS } from '@/lib/labels'

type Cfg = Record<string, unknown> | null | undefined
type SaveFn = (key: string, value: unknown) => void

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <input
        className="t-field"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  )
}

function CommissionsCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const [near, setNear] = useState(String((value as { near?: number })?.near ?? ''))
  const [far, setFar] = useState(String((value as { far?: number })?.far ?? ''))
  const [pickup, setPickup] = useState(String((value as { pickup?: number })?.pickup ?? ''))
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">Comisiones por pedido entregado (S/)</p>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Cerca" value={near} onChange={setNear} />
        <NumberField label="Lejos" value={far} onChange={setFar} />
        <NumberField label="Recojo" value={pickup} onChange={setPickup} />
      </div>
      <Button
        size="sm"
        className="mt-3"
        onClick={() =>
          save('commissions', { near: Number(near), far: Number(far), pickup: Number(pickup) })
        }
      >
        Guardar comisiones
      </Button>
    </div>
  )
}

function ScheduleCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const v = (value ?? {}) as { days?: string[]; startHHMM?: string; endHHMM?: string }
  const [days, setDays] = useState<string[]>(v.days ?? [])
  const [start, setStart] = useState(v.startHHMM ?? '18:00')
  const [end, setEnd] = useState(v.endHHMM ?? '23:00')
  const toggle = (d: string) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">Horario operativo</p>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map(([d, label]) => (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={`h-9 rounded-lg px-3 text-[13px] transition-colors ${
              days.includes(d) ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Inicio">
          <input
            type="time"
            className="t-field"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Fin (si ≤ inicio, cruza medianoche)">
          <input
            type="time"
            className="t-field"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <Button
        size="sm"
        className="mt-3"
        onClick={() => save('platform_schedule', { days, startHHMM: start, endHHMM: end })}
      >
        Guardar horario
      </Button>
    </div>
  )
}

function ThresholdsCard({
  prepay,
  validation,
  save,
}: {
  prepay: unknown
  validation: Cfg
  save: SaveFn
}) {
  const [pre, setPre] = useState(String(typeof prepay === 'number' ? prepay : ''))
  const [amt, setAmt] = useState(
    String((validation as { amountThreshold?: number })?.amountThreshold ?? ''),
  )
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">Umbrales (S/)</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Prepago forzado ≥" value={pre} onChange={setPre} />
        <NumberField label="Validación por monto ≥" value={amt} onChange={setAmt} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => save('prepay_threshold', Number(pre))}>
          Guardar prepago
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => save('validation', { amountThreshold: Number(amt) })}
        >
          Guardar validación
        </Button>
      </div>
    </div>
  )
}

function TimersCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const v = (value ?? {}) as Record<string, number>
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(TIMER_FIELDS.map(([k]) => [k, String(v[k] ?? '')])),
  )
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">Tiempos (timers)</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TIMER_FIELDS.map(([k, label]) => (
          <NumberField
            key={k}
            label={label}
            value={draft[k] ?? ''}
            onChange={(val) => setDraft({ ...draft, [k]: val })}
          />
        ))}
      </div>
      <Button
        size="sm"
        className="mt-3"
        onClick={() =>
          save('timers', Object.fromEntries(TIMER_FIELDS.map(([k]) => [k, Number(draft[k])])))
        }
      >
        Guardar tiempos
      </Button>
    </div>
  )
}

function SupportCard({ value, save }: { value: Cfg; save: SaveFn }) {
  const [wa, setWa] = useState(typeof value === 'string' ? value : '')
  return (
    <div className="t-card">
      <p className="t-display mb-3 text-[15px] text-ink">WhatsApp de soporte</p>
      <input
        className="t-field"
        value={wa}
        onChange={(e) => setWa(e.target.value)}
        placeholder="+51987654321"
      />
      <Button size="sm" className="mt-3" onClick={() => save('support_whatsapp', wa.trim())}>
        Guardar soporte
      </Button>
    </div>
  )
}

function CoverageCard({ polygon, coverage, save }: { polygon: Cfg; coverage: Cfg; save: SaveFn }) {
  const initial = (polygon as { polygon?: LatLng[] } | null)?.polygon ?? null
  const cov = (coverage ?? {}) as { centerLat?: number; centerLng?: number }
  const center: LatLng = { lat: cov.centerLat ?? -9.1547, lng: cov.centerLng ?? -78.5042 }
  const [ring, setRing] = useState<LatLng[] | null>(initial)
  const count = ring?.length ?? 0
  const canSave = count >= 3
  return (
    <div className="t-card">
      <p className="t-display mb-1 text-[15px] text-ink">Zona de cobertura (San Jacinto)</p>
      <p className="mb-3 text-[13px] text-ink-muted">
        Dibuja el polígono con la herramienta de la esquina del mapa. El cliente solo podrá elegir
        su dirección dentro de esta zona; usa “editar” para mover los vértices.
      </p>
      <CoveragePolygonEditor value={initial} center={center} onChange={setRing} heightPx={340} />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[12px] text-ink-muted">{count} vértices (mínimo 3)</span>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => canSave && ring && save('coverage_polygon', { polygon: ring })}
        >
          Guardar zona
        </Button>
      </div>
    </div>
  )
}

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<ApiEnvelope<{ key: string; value: unknown }[]>>('/admin/settings')
      .then((r) => setSettings(Object.fromEntries(r.data.map((s) => [s.key, s.value]))))
      .catch((e) => setError(errMsg(e)))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const save: SaveFn = async (key, value) => {
    setMsg(null)
    setError(null)
    try {
      await api.patch('/admin/settings', { key, value })
      setMsg(`Guardado: ${key}`)
      load()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader
        eyebrow="Ajustes"
        title="Configuración"
        description="Parámetros operativos de la plataforma."
        right={
          <Button size="sm" variant="outline" onClick={load}>
            Refrescar
          </Button>
        }
      />
      {msg && <p className="mb-2 text-[14px] text-success">{msg}</p>}
      {error && <p className="mb-2 text-[14px] text-danger">{error}</p>}
      {!settings ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-ink/[0.05]" />
      ) : (
        <div className="space-y-4" key={JSON.stringify(settings)}>
          <CommissionsCard value={settings.commissions as Cfg} save={save} />
          <ScheduleCard value={settings.platform_schedule as Cfg} save={save} />
          <ThresholdsCard
            prepay={settings.prepay_threshold}
            validation={settings.validation as Cfg}
            save={save}
          />
          <TimersCard value={settings.timers as Cfg} save={save} />
          <SupportCard value={settings.support_whatsapp as Cfg} save={save} />
          <CoverageCard
            polygon={settings.coverage_polygon as Cfg}
            coverage={settings.coverage as Cfg}
            save={save}
          />
        </div>
      )}
    </div>
  )
}
