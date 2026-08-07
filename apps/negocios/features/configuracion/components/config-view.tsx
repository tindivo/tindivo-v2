import { Card, Icon } from '@tindivo/ui'
import { type FormEvent, useRef, useState } from 'react'
import { useDashboard } from '@/components/dashboard/shell'
import { ScheduleEditor } from '@/components/schedule-editor'
import type { ConfigMessage } from '../hooks/use-business-config'
import { CAP_ITEMS, capabilityLabel, isWaInvalid, SECTIONS, WA_ERROR } from '../lib/constants'
import type { Form, SectionId } from '../types'
import { AccentColorReadonly } from './accent-color-readonly'
import { CapToggle } from './cap-toggle'
import { CapabilityNotes } from './capability-notes'
import { Field } from './field'
import { HeroCard } from './hero-card'
import { MobileSectionTitle } from './mobile-section-title'
import { ProfileImageUploader } from './profile-image-uploader'
import { QrUploader } from './qr-uploader'
import { SaveButton } from './save-button'
import { SectionCard } from './section-card'
import { SectionNav } from './section-nav'

interface ConfigViewProps {
  form: Form
  capability: string
  saving: boolean
  msg: ConfigMessage | null
  onSave: (e: FormEvent) => void
  set: (patch: Partial<Form>) => void
  qrUrl: string | null
  onQrUploaded: (url: string) => void
  logoUrl: string | null
  onLogoUploaded: (url: string) => void
  bannerUrl: string | null
  onBannerUploaded: (url: string) => void
}

const inputCls =
  'w-full rounded-2xl border border-ink/[0.06] bg-card px-4 py-3.5 text-[16px] font-medium text-ink outline-none transition-all placeholder:text-ink/45 focus:border-ink focus:ring-4 focus:ring-ink/[0.08]'
const inputMonoCls = `${inputCls} font-mono`

export function ConfigView({
  form,
  capability,
  saving,
  msg,
  onSave,
  set,
  qrUrl,
  onQrUploaded,
  logoUrl,
  onLogoUploaded,
  bannerUrl,
  onBannerUploaded,
}: ConfigViewProps) {
  const { bizName } = useDashboard()
  const [activeSection, setActiveSection] = useState<SectionId>('datos')
  const contentRef = useRef<HTMLDivElement>(null)

  const sections = SECTIONS.filter((s) => !s.hiddenFor?.some((c) => c === capability))
  const showSection = (id: SectionId) => sections.some((s) => s.id === id)

  function scrollToSection(id: SectionId) {
    setActiveSection(id)
    const el = contentRef.current?.querySelector(`#section-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleCapChange(field: keyof Form, value: boolean) {
    set({ [field]: value } as Partial<Form>)
  }

  return (
    <form onSubmit={onSave}>
      {/* ── MOBILE ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:hidden">
        <HeroCard form={form} bizName={bizName} capability={capability} />

        <MobileSectionTitle>Datos del negocio</MobileSectionTitle>
        <Card className="mb-2 flex flex-wrap gap-4 p-3">
          <div>
            <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
              Logo (inicio)
            </span>
            <ProfileImageUploader
              currentUrl={logoUrl}
              onUploaded={onLogoUploaded}
              bucket="business-logos"
              pathSuffix="logo"
              field="logoUrl"
              width={80}
              height={80}
              placeholderLabel="LOGO"
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
              Banner (portada)
            </span>
            <ProfileImageUploader
              currentUrl={bannerUrl}
              onUploaded={onBannerUploaded}
              bucket="business-logos"
              pathSuffix="banner"
              field="bannerUrl"
              width={200}
              height={80}
              placeholderLabel="BANNER"
            />
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <Field label="Nombre">
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
          </Field>
          <Field label="Eslogan">
            <input
              className={inputCls}
              value={form.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
            />
          </Field>
          <Field label="Teléfono">
            <input
              className={inputMonoCls}
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <Field
            label="WhatsApp para pedidos"
            helper="Número PÚBLICO al que los clientes escriben en modo catálogo. Puede ser el mismo del negocio."
          >
            <input
              className={inputMonoCls}
              inputMode="numeric"
              placeholder="9XXXXXXXX"
              value={form.whatsappNumber}
              onChange={(e) => set({ whatsappNumber: e.target.value })}
            />
            {isWaInvalid(form.whatsappNumber) && (
              <p className="mt-1.5 text-[12px] text-danger">{WA_ERROR}</p>
            )}
          </Field>
          <Field label="Color de papelito">
            <AccentColorReadonly value={form.accentColor} />
          </Field>
        </div>

        {showSection('yape') && (
          <>
            <MobileSectionTitle>Pago Yape</MobileSectionTitle>
            <div className="flex flex-col gap-3">
              <Field label="Número de Yape">
                <input
                  className={inputMonoCls}
                  value={form.yapeNumber}
                  onChange={(e) => set({ yapeNumber: e.target.value })}
                />
              </Field>
              <Card className="p-3">
                <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                  QR de Yape
                </span>
                <div className="flex items-start gap-4">
                  <QrUploader qrUrl={qrUrl} onUploaded={onQrUploaded} size={96} />
                  <p className="flex-1 text-[13px] text-ink-muted">
                    Sube tu QR para que el cliente escanee al hacer un pedido prepago.
                  </p>
                </div>
              </Card>
            </div>
          </>
        )}

        {showSection('tiempos') && (
          <>
            <MobileSectionTitle>Tiempos y precio</MobileSectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ETA mín">
                <input
                  type="number"
                  className={inputMonoCls}
                  value={form.estimatedEtaMin}
                  min={1}
                  max={180}
                  onChange={(e) => set({ estimatedEtaMin: Number(e.target.value) })}
                />
              </Field>
              <Field label="ETA máx">
                <input
                  type="number"
                  className={inputMonoCls}
                  value={form.estimatedEtaMax}
                  min={1}
                  max={180}
                  onChange={(e) => set({ estimatedEtaMax: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Delivery (S/)" helper="Lo que cobras al cliente por envío.">
                <input
                  type="number"
                  step="0.5"
                  className={inputMonoCls}
                  value={form.deliveryFee}
                  min={0}
                  onChange={(e) => set({ deliveryFee: Number(e.target.value) })}
                />
              </Field>
            </div>
          </>
        )}

        <MobileSectionTitle>Capacidades</MobileSectionTitle>
        <div className="flex flex-col gap-3">
          <CapabilityNotes capability={capability} whatsappNumber={form.whatsappNumber} />
          {CAP_ITEMS.map((c) => (
            <Card key={c.key} className="p-4">
              <CapToggle
                icon={c.icon}
                title={c.title}
                desc={c.desc}
                checked={form[c.key] as boolean}
                field={c.key}
                onChange={handleCapChange}
                disabled
              />
            </Card>
          ))}
        </div>

        <MobileSectionTitle>Horario semanal</MobileSectionTitle>
        <ScheduleEditor />

        {msg && (
          <p
            className={`mt-4 text-[13px] font-semibold ${msg.ok ? 'text-success' : 'text-danger'}`}
          >
            {msg.text}
          </p>
        )}

        <div className="mt-4 border-t border-ink/[0.06] pt-4">
          <SaveButton saving={saving} block />
        </div>
      </div>

      {/* ── DESKTOP ───────────────────────────────────────────────────────── */}
      <div className="hidden grid-cols-[220px_1fr] items-start gap-5 lg:grid">
        <SectionNav active={activeSection} capability={capability} onSelect={scrollToSection} />

        <div ref={contentRef} className="flex flex-col gap-4">
          {msg && (
            <div
              className={`rounded-xl px-4 py-3 text-[13px] font-semibold ${
                msg.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
              }`}
            >
              {msg.text}
            </div>
          )}

          <SectionCard title="Datos del negocio" icon="storefront" id="datos">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre">
                <input
                  className={inputCls}
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className={inputMonoCls}
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </Field>
              <div className="col-span-2">
                <Field
                  label="WhatsApp para pedidos"
                  helper="Número PÚBLICO al que los clientes escriben en modo catálogo."
                >
                  <input
                    className={inputMonoCls}
                    inputMode="numeric"
                    placeholder="9XXXXXXXX"
                    value={form.whatsappNumber}
                    onChange={(e) => set({ whatsappNumber: e.target.value })}
                  />
                  {isWaInvalid(form.whatsappNumber) && (
                    <p className="mt-1.5 text-[12px] text-danger">{WA_ERROR}</p>
                  )}
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Eslogan / lema">
                  <input
                    className={inputCls}
                    value={form.tagline}
                    onChange={(e) => set({ tagline: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Color de papelito">
                <AccentColorReadonly value={form.accentColor} />
              </Field>
              <div className="col-span-2 flex flex-wrap gap-5">
                <div>
                  <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                    Logo (aparece en el inicio)
                  </span>
                  <ProfileImageUploader
                    currentUrl={logoUrl}
                    onUploaded={onLogoUploaded}
                    bucket="business-logos"
                    pathSuffix="logo"
                    field="logoUrl"
                    width={96}
                    height={96}
                    placeholderLabel="LOGO"
                  />
                </div>
                <div>
                  <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                    Banner (portada de tu página)
                  </span>
                  <ProfileImageUploader
                    currentUrl={bannerUrl}
                    onUploaded={onBannerUploaded}
                    bucket="business-logos"
                    pathSuffix="banner"
                    field="bannerUrl"
                    width={280}
                    height={96}
                    placeholderLabel="BANNER"
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {showSection('yape') && (
            <SectionCard title="Pago por Yape" icon="qr_code_2" id="yape">
              <div className="grid grid-cols-[1fr_200px] items-start gap-4">
                <div className="flex flex-col gap-3">
                  <Field label="Número de Yape">
                    <input
                      className={inputMonoCls}
                      value={form.yapeNumber}
                      onChange={(e) => set({ yapeNumber: e.target.value })}
                    />
                  </Field>
                  <div className="flex gap-2 rounded-xl bg-info/10 px-3 py-2.5 text-[13px] font-medium text-info">
                    <Icon name="info" size={16} className="mt-0.5 shrink-0" />
                    <span>
                      Los clientes verán este número y tu QR cuando paguen por Yape antes del
                      pedido.
                    </span>
                  </div>
                </div>
                <div>
                  <span className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-wide text-ink/55">
                    QR de Yape
                  </span>
                  <QrUploader qrUrl={qrUrl} onUploaded={onQrUploaded} size={160} />
                </div>
              </div>
            </SectionCard>
          )}

          {showSection('tiempos') && (
            <SectionCard title="Tiempos y precio" icon="schedule" id="tiempos">
              <div className="grid grid-cols-3 gap-4">
                <Field label="ETA mínimo">
                  <input
                    type="number"
                    className={inputMonoCls}
                    value={form.estimatedEtaMin}
                    min={1}
                    max={180}
                    onChange={(e) => set({ estimatedEtaMin: Number(e.target.value) })}
                  />
                </Field>
                <Field label="ETA máximo">
                  <input
                    type="number"
                    className={inputMonoCls}
                    value={form.estimatedEtaMax}
                    min={1}
                    max={180}
                    onChange={(e) => set({ estimatedEtaMax: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Delivery (S/)">
                  <input
                    type="number"
                    step="0.5"
                    className={inputMonoCls}
                    value={form.deliveryFee}
                    min={0}
                    onChange={(e) => set({ deliveryFee: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Capacidades del negocio"
            icon="tune"
            id="capacidades"
            subtitle={capability ? `Modo actual: ${capabilityLabel(capability)}` : undefined}
          >
            <div className="flex flex-col gap-4">
              <CapabilityNotes capability={capability} whatsappNumber={form.whatsappNumber} />
              <div className="grid grid-cols-2 gap-3">
                {CAP_ITEMS.map((c) => (
                  <Card key={c.key} className="p-4">
                    <CapToggle
                      icon={c.icon}
                      title={c.title}
                      desc={c.desc}
                      checked={form[c.key] as boolean}
                      field={c.key}
                      onChange={handleCapChange}
                      disabled
                    />
                  </Card>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Horario semanal" icon="calendar_month" id="horario">
            <ScheduleEditor />
          </SectionCard>

          <div className="flex justify-end">
            <SaveButton saving={saving} />
          </div>
        </div>
      </div>
    </form>
  )
}
