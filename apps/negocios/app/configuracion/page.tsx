'use client'

import { ApiError } from '@tindivo/api-client'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { FONT_DISPLAY, MS } from '@/components/dashboard/primitives'
import { DashboardShell, useDashboard } from '@/components/dashboard/shell'
import { ScheduleEditor } from '@/components/schedule-editor'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Form {
  name: string
  phone: string
  yapeNumber: string
  tagline: string
  accentColor: string
  estimatedEtaMin: number
  estimatedEtaMax: number
  deliveryFee: number
  publishesCatalog: boolean
  acceptsWebPickup: boolean
  acceptsWebDelivery: boolean
  usesTindivoDrivers: boolean
}

type SectionId = 'datos' | 'yape' | 'tiempos' | 'capacidades' | 'horario'

const SECTIONS: { id: SectionId; icon: string; label: string }[] = [
  { id: 'datos', icon: 'storefront', label: 'Datos' },
  { id: 'yape', icon: 'qr_code_2', label: 'Pago Yape' },
  { id: 'tiempos', icon: 'schedule', label: 'Tiempos y precio' },
  { id: 'capacidades', icon: 'tune', label: 'Capacidades' },
  { id: 'horario', icon: 'calendar_month', label: 'Horario' },
]

// ── Primitives ────────────────────────────────────────────────────────────────

/** Labelled input field using tv-* tokens */
function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div>
      {/* Use div instead of label — control is always a direct child */}
      <div className="tv-label-input" style={{ marginBottom: 6 }}>
        {label}
      </div>
      {children}
      {helper && (
        <div style={{ fontSize: 11, color: 'var(--tv-ink-muted)', marginTop: 4 }}>{helper}</div>
      )}
    </div>
  )
}

/** Toggle switch card for capabilities */
function CapToggle({
  icon,
  title,
  desc,
  on,
  onChange,
}: {
  icon: string
  title: string
  desc: string
  on: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: '#fff',
        borderRadius: 12,
        border: '1px solid var(--tv-border)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: on ? 'var(--tv-brand-soft)' : 'rgba(26,22,20,0.06)',
          color: on ? 'var(--tv-brand-dark)' : 'var(--tv-ink-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <MS name={icon} size={20} filled={on} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{desc}</div>
      </div>
      {/* Toggle switch */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 999,
          background: on ? 'var(--tv-brand)' : 'var(--tv-ink-subtle)',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 140ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: on ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: '#fff',
            transition: 'left 140ms ease',
          }}
        />
      </button>
    </div>
  )
}

/** Desktop section card */
function SectionCard({
  title,
  icon,
  subtitle,
  right,
  children,
  id,
}: {
  title: string
  icon: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
  id: SectionId
}) {
  return (
    <div
      id={`section-${id}`}
      style={{
        background: '#fff',
        borderRadius: 16,
        padding: 18,
        border: '1px solid var(--tv-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'var(--tv-brand-soft)',
            color: 'var(--tv-brand-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MS name={icon} size={18} filled />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--tv-ink-muted)', marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

/** Mobile section title */
function MobileSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="tv-label" style={{ marginTop: 18, marginBottom: 8, paddingLeft: 2 }}>
      {children}
    </div>
  )
}

/**
 * Yape QR upload: public bucket business-qrs (owner-folder policy, 0005),
 * fixed path {bizId}/qr with upsert; the persisted URL is versioned (?v=)
 * so customers never see a stale cached image. Saves immediately via PATCH.
 */
function QrUploader({
  qrUrl,
  onUploaded,
  size,
}: {
  qrUrl: string | null
  onUploaded: (url: string) => void
  size: number
}) {
  const { bizId } = useDashboard()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const path = `${bizId}/qr`
    const { error: upErr } = await supabase.storage
      .from('business-qrs')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setError(upErr.message)
      setBusy(false)
      return
    }
    const { data } = supabase.storage.from('business-qrs').getPublicUrl(path)
    const versionedUrl = `${data.publicUrl}?v=${Date.now()}`
    try {
      await api.patch('/business/profile', { qrUrl: versionedUrl })
      onUploaded(versionedUrl)
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.problem.detail ?? err.message) : 'No se pudo guardar el QR',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      {qrUrl ? (
        <img
          src={qrUrl}
          alt="QR de Yape"
          style={{
            width: size,
            height: size,
            borderRadius: 12,
            objectFit: 'contain',
            background: '#fff',
            border: '1px solid var(--tv-border)',
          }}
        />
      ) : (
        <div className="tv-ph" style={{ width: size, height: size, borderRadius: 12 }}>
          <span>QR YAPE</span>
        </div>
      )}
      <label
        className="tv-btn tv-btn-ghost tv-btn-sm"
        style={{ cursor: 'pointer', justifyContent: 'center' }}
      >
        <MS name="upload" size={14} /> {busy ? 'Subiendo…' : qrUrl ? 'Reemplazar' : 'Subir'}
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFile}
          disabled={busy}
        />
      </label>
      {error && <div style={{ fontSize: 11, color: 'var(--tv-danger)' }}>{error}</div>}
    </div>
  )
}

// ── Inner view (needs useDashboard) ──────────────────────────────────────────
function ConfigView({
  form,
  capability,
  saving,
  msg,
  onSave,
  set,
  qrUrl,
  onQrUploaded,
}: {
  form: Form
  capability: string
  saving: boolean
  msg: { ok: boolean; text: string } | null
  onSave: (e: FormEvent) => void
  set: (patch: Partial<Form>) => void
  qrUrl: string | null
  onQrUploaded: (url: string) => void
}) {
  const { bizName } = useDashboard()
  const [activeSection, setActiveSection] = useState<SectionId>('datos')
  const contentRef = useRef<HTMLDivElement>(null)

  const CAP_ITEMS: {
    key: keyof Form
    icon: string
    title: string
    desc: string
  }[] = [
    {
      key: 'publishesCatalog',
      icon: 'storefront',
      title: 'Publicar catálogo',
      desc: 'Aparecer en el marketplace de Tindivo',
    },
    {
      key: 'acceptsWebPickup',
      icon: 'shopping_bag',
      title: 'Recojo en local',
      desc: 'El cliente puede hacer pedidos para recoger',
    },
    {
      key: 'acceptsWebDelivery',
      icon: 'delivery_dining',
      title: 'Delivery web',
      desc: 'Aceptar pedidos con envío a domicilio',
    },
    {
      key: 'usesTindivoDrivers',
      icon: 'two_wheeler',
      title: 'Motorizados Tindivo',
      desc: 'Usar la flota de motos de Tindivo',
    },
  ]

  function scrollToSection(id: SectionId) {
    setActiveSection(id)
    const el = contentRef.current?.querySelector(`#section-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const SaveBtn = ({ block = false }: { block?: boolean }) => (
    <button
      type="submit"
      className={`tv-btn tv-btn-brand${block ? ' tv-btn-block tv-btn-lg' : ''}`}
      disabled={saving}
    >
      <MS name="save" size={block ? 20 : 18} filled />
      {saving ? 'Guardando…' : 'Guardar cambios'}
    </button>
  )

  return (
    <form onSubmit={onSave}>
      {/* ── MOBILE ──────────────────────────────────────────────────────── */}
      <div className="lg:hidden flex flex-col">
        {/* Hero card */}
        <div
          style={{
            background: '#fff',
            borderRadius: 16,
            padding: 14,
            border: '1px solid var(--tv-border)',
            marginBottom: 4,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: `#${form.accentColor}`,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT_DISPLAY,
              fontWeight: 700,
              fontSize: 22,
              flexShrink: 0,
            }}
          >
            {bizName[0] ?? 'T'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{bizName}</div>
            {capability && (
              <div className="tv-label" style={{ marginTop: 4, fontSize: 10 }}>
                MODO: {capability.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Datos del negocio */}
        <MobileSectionTitle>DATOS DEL NEGOCIO</MobileSectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="NOMBRE">
            <input
              className="tv-input"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
          </Field>
          <Field label="ESLOGAN">
            <input
              className="tv-input"
              value={form.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
            />
          </Field>
          <Field label="TELÉFONO">
            <input
              className="tv-input tv-mono"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <Field label="COLOR DE ACENTO (HEX)">
            <div className="tv-input" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: `#${form.accentColor}`,
                  flexShrink: 0,
                }}
              />
              <input
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: 15,
                }}
                value={form.accentColor}
                pattern="[0-9a-fA-F]{6}"
                onChange={(e) => set({ accentColor: e.target.value })}
              />
            </div>
          </Field>
        </div>

        {/* Pago Yape */}
        <MobileSectionTitle>PAGO YAPE</MobileSectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="NÚMERO DE YAPE">
            <input
              className="tv-input tv-mono"
              value={form.yapeNumber}
              onChange={(e) => set({ yapeNumber: e.target.value })}
            />
          </Field>
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 12,
              border: '1px solid var(--tv-border)',
            }}
          >
            <div className="tv-label-input" style={{ marginBottom: 6 }}>
              QR DE YAPE
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <QrUploader qrUrl={qrUrl} onUploaded={onQrUploaded} size={96} />
              <div style={{ flex: 1, fontSize: 12, color: 'var(--tv-ink-muted)' }}>
                Sube tu QR para que el cliente escanee al hacer un pedido prepago.
              </div>
            </div>
          </div>
        </div>

        {/* Tiempos y precio */}
        <MobileSectionTitle>TIEMPOS Y PRECIO</MobileSectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="ETA MÍN">
            <input
              type="number"
              className="tv-input tv-mono"
              value={form.estimatedEtaMin}
              min={1}
              max={180}
              onChange={(e) => set({ estimatedEtaMin: Number(e.target.value) })}
            />
          </Field>
          <Field label="ETA MÁX">
            <input
              type="number"
              className="tv-input tv-mono"
              value={form.estimatedEtaMax}
              min={1}
              max={180}
              onChange={(e) => set({ estimatedEtaMax: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="DELIVERY (S/)" helper="Lo que cobras al cliente por envío.">
            <input
              type="number"
              step="0.5"
              className="tv-input tv-mono"
              value={form.deliveryFee}
              min={0}
              onChange={(e) => set({ deliveryFee: Number(e.target.value) })}
            />
          </Field>
        </div>

        {/* Capacidades */}
        <MobileSectionTitle>CAPACIDADES</MobileSectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CAP_ITEMS.map((c) => (
            <CapToggle
              key={c.key}
              icon={c.icon}
              title={c.title}
              desc={c.desc}
              on={form[c.key] as boolean}
              onChange={(v) => set({ [c.key]: v } as Partial<Form>)}
            />
          ))}
        </div>

        {/* Horario */}
        <MobileSectionTitle>HORARIO SEMANAL</MobileSectionTitle>
        <ScheduleEditor />

        {/* Feedback + save */}
        {msg && (
          <p
            style={{
              marginTop: 12,
              fontSize: 13,
              color: msg.ok ? 'var(--tv-success)' : 'var(--tv-danger)',
            }}
          >
            {msg.text}
          </p>
        )}

        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--tv-border)',
          }}
        >
          <SaveBtn block />
        </div>
      </div>

      {/* ── DESKTOP ─────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:grid"
        style={{ gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'flex-start' }}
      >
        {/* Section nav */}
        <aside style={{ position: 'sticky', top: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {SECTIONS.map((it) => {
              const on = activeSection === it.id
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => scrollToSection(it.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    width: '100%',
                    background: on ? '#fff' : 'transparent',
                    border: on ? '1px solid var(--tv-border)' : '1px solid transparent',
                    color: 'var(--tv-ink)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: on ? 600 : 500,
                    textAlign: 'left',
                    boxShadow: on ? 'var(--tv-elev-1)' : 'none',
                  }}
                >
                  <MS
                    name={it.icon}
                    size={18}
                    filled={on}
                    style={{ color: on ? 'var(--tv-brand)' : 'var(--tv-ink-muted)' }}
                  />
                  {it.label}
                </button>
              )
            })}
          </div>
        </aside>

        {/* Main content */}
        <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Feedback */}
          {msg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                background: msg.ok ? 'var(--tv-success-soft)' : 'var(--tv-danger-soft)',
                color: msg.ok ? 'var(--tv-success)' : 'var(--tv-danger)',
              }}
            >
              {msg.text}
            </div>
          )}

          {/* Datos */}
          <SectionCard title="Datos del negocio" icon="storefront" id="datos">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="NOMBRE">
                <input
                  className="tv-input"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  required
                />
              </Field>
              <Field label="TELÉFONO">
                <input
                  className="tv-input tv-mono"
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ESLOGAN / LEMA">
                  <input
                    className="tv-input"
                    value={form.tagline}
                    onChange={(e) => set({ tagline: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="COLOR DE ACENTO (PAPELITO)">
                <div
                  className="tv-input"
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: `#${form.accentColor}`,
                      flexShrink: 0,
                    }}
                  />
                  <input
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      fontFamily: 'inherit',
                      fontSize: 15,
                    }}
                    value={form.accentColor}
                    pattern="[0-9a-fA-F]{6}"
                    onChange={(e) => set({ accentColor: e.target.value })}
                  />
                  <span className="tv-mono" style={{ color: 'var(--tv-ink-muted)', fontSize: 12 }}>
                    #{form.accentColor}
                  </span>
                </div>
              </Field>
            </div>
          </SectionCard>

          {/* Yape */}
          <SectionCard title="Pago por Yape" icon="qr_code_2" id="yape">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 200px',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="NÚMERO DE YAPE">
                  <input
                    className="tv-input tv-mono"
                    value={form.yapeNumber}
                    onChange={(e) => set({ yapeNumber: e.target.value })}
                  />
                </Field>
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--tv-info-soft)',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#0369A1',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                  }}
                >
                  <MS name="info" size={14} filled style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Los clientes verán este número y tu QR cuando paguen por Yape antes del pedido.
                  </span>
                </div>
              </div>
              <div>
                <div className="tv-label-input" style={{ marginBottom: 6 }}>
                  QR DE YAPE
                </div>
                <QrUploader qrUrl={qrUrl} onUploaded={onQrUploaded} size={160} />
              </div>
            </div>
          </SectionCard>

          {/* Tiempos */}
          <SectionCard title="Tiempos y precio" icon="schedule" id="tiempos">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="ETA MÍNIMO">
                <input
                  type="number"
                  className="tv-input tv-mono"
                  value={form.estimatedEtaMin}
                  min={1}
                  max={180}
                  onChange={(e) => set({ estimatedEtaMin: Number(e.target.value) })}
                />
              </Field>
              <Field label="ETA MÁXIMO">
                <input
                  type="number"
                  className="tv-input tv-mono"
                  value={form.estimatedEtaMax}
                  min={1}
                  max={180}
                  onChange={(e) => set({ estimatedEtaMax: Number(e.target.value) })}
                />
              </Field>
              <Field label="DELIVERY (S/)">
                <input
                  type="number"
                  step="0.5"
                  className="tv-input tv-mono"
                  value={form.deliveryFee}
                  min={0}
                  onChange={(e) => set({ deliveryFee: Number(e.target.value) })}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Capacidades */}
          <SectionCard
            title="Capacidades del negocio"
            icon="tune"
            id="capacidades"
            subtitle={capability ? `Modo actual: ${capability}` : undefined}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {CAP_ITEMS.map((c) => (
                <CapToggle
                  key={c.key}
                  icon={c.icon}
                  title={c.title}
                  desc={c.desc}
                  on={form[c.key] as boolean}
                  onChange={(v) => set({ [c.key]: v } as Partial<Form>)}
                />
              ))}
            </div>
          </SectionCard>

          {/* Horario */}
          <SectionCard title="Horario semanal" icon="calendar_month" id="horario">
            {/* ScheduleEditor manages its own save; render inside the section card */}
            <ScheduleEditor />
          </SectionCard>

          {/* Bottom save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <SaveBtn />
          </div>
        </div>
      </div>
    </form>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const [form, setForm] = useState<Form | null>(null)
  const [capability, setCapability] = useState<string>('')
  // Fuera de Form a propósito: el QR se persiste al subirse (PATCH inmediato),
  // no con el "Guardar cambios" del form.
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('businesses')
      .select(
        'name,phone,yape_number,tagline,accent_color,estimated_eta_min,estimated_eta_max,delivery_fee,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers,primary_capability,qr_url',
      )
      .maybeSingle()
      .then(({ data: biz }) => {
        if (!biz) return
        setQrUrl(biz.qr_url ?? null)
        setForm({
          name: biz.name ?? '',
          phone: biz.phone ?? '',
          yapeNumber: biz.yape_number ?? '',
          tagline: biz.tagline ?? '',
          accentColor: biz.accent_color ?? 'f97316',
          estimatedEtaMin: biz.estimated_eta_min ?? 25,
          estimatedEtaMax: biz.estimated_eta_max ?? 35,
          deliveryFee: Number(biz.delivery_fee ?? 2),
          publishesCatalog: Boolean(biz.publishes_catalog),
          acceptsWebPickup: Boolean(biz.accepts_web_pickup),
          acceptsWebDelivery: Boolean(biz.accepts_web_delivery),
          usesTindivoDrivers: Boolean(biz.uses_tindivo_drivers),
        })
        setCapability(biz.primary_capability ?? '')
      })
  }, [])

  async function save(e?: FormEvent) {
    e?.preventDefault()
    if (!form) return
    setSaving(true)
    setMsg(null)
    try {
      const r = await api.patch<{ data: { primary_capability: string } }>('/business/profile', form)
      setCapability(r.data.primary_capability ?? '')
      setMsg({ ok: true, text: 'Cambios guardados.' })
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error al guardar.',
      })
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<Form>) => {
    if (!form) return
    setForm({ ...form, ...patch })
  }

  return (
    <DashboardShell
      active="config"
      title="Configuración"
      subtitle="Perfil del restaurante, horarios y capacidades"
      headerRight={
        form ? (
          <div className="hidden lg:block">
            <button
              type="button"
              className="tv-btn tv-btn-brand"
              disabled={saving}
              onClick={() => save()}
            >
              <MS name="save" size={18} filled />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        ) : undefined
      }
    >
      {!form ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--tv-ink-muted)' }}>
          Cargando configuración…
        </div>
      ) : (
        <div data-config-form="">
          <ConfigView
            form={form}
            capability={capability}
            saving={saving}
            msg={msg}
            onSave={save}
            set={set}
            qrUrl={qrUrl}
            onQrUploaded={setQrUrl}
          />
        </div>
      )}
    </DashboardShell>
  )
}
