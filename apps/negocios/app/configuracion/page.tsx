'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Card, CardBody } from '@tindivo/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useState } from 'react'
import { ScheduleEditor } from '@/components/schedule-editor'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const inputCls =
  'mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand'
const labelCls = 'font-mono text-[11px] text-ink-subtle uppercase tracking-wide'

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

export default function ConfiguracionPage() {
  const router = useRouter()
  const [form, setForm] = useState<Form | null>(null)
  const [capability, setCapability] = useState<string>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      const { data: biz } = await supabase
        .from('businesses')
        .select(
          'name,phone,yape_number,tagline,accent_color,estimated_eta_min,estimated_eta_max,delivery_fee,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers,primary_capability',
        )
        .maybeSingle()
      if (biz) {
        setForm({
          name: biz.name ?? '',
          phone: biz.phone ?? '',
          yapeNumber: biz.yape_number ?? '',
          tagline: biz.tagline ?? '',
          accentColor: biz.accent_color ?? 'f97316',
          estimatedEtaMin: biz.estimated_eta_min ?? 25,
          estimatedEtaMax: biz.estimated_eta_max ?? 35,
          deliveryFee: Number(biz.delivery_fee ?? 2),
          publishesCatalog: biz.publishes_catalog,
          acceptsWebPickup: biz.accepts_web_pickup,
          acceptsWebDelivery: biz.accepts_web_delivery,
          usesTindivoDrivers: biz.uses_tindivo_drivers,
        })
        setCapability(biz.primary_capability ?? '')
      }
    })
  }, [router])

  async function save(e: FormEvent) {
    e.preventDefault()
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
        text: err instanceof ApiError ? (err.problem.detail ?? err.message) : 'Error',
      })
    } finally {
      setSaving(false)
    }
  }

  if (!form) return <div className="p-10 text-ink-muted">Cargando…</div>
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })

  const CAP: { key: keyof Form; label: string; hint: string }[] = [
    {
      key: 'publishesCatalog',
      label: 'Publicar catálogo',
      hint: 'Aparece en el buscador del cliente',
    },
    { key: 'acceptsWebPickup', label: 'Recojo en local', hint: 'Requiere catálogo' },
    {
      key: 'acceptsWebDelivery',
      label: 'Delivery web',
      hint: 'Requiere catálogo + motorizados Tindivo',
    },
    { key: 'usesTindivoDrivers', label: 'Motorizados de Tindivo', hint: 'Usa la flota de Tindivo' },
  ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/" className="font-mono text-[11px] text-ink-subtle uppercase tracking-widest">
        ← Pedidos
      </Link>
      <h1 className="mt-2 mb-1 font-display font-semibold text-[24px] text-ink">Configuración</h1>
      {capability && (
        <p className="mb-4 text-[13px] text-ink-muted">
          Modo actual: <span className="font-mono text-brand-dark">{capability}</span>
        </p>
      )}

      <form onSubmit={save} className="space-y-4">
        <Card>
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Nombre</span>
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                required
              />
            </label>
            <label className="block">
              <span className={labelCls}>Tagline</span>
              <input
                className={inputCls}
                value={form.tagline}
                onChange={(e) => set({ tagline: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Teléfono</span>
              <input
                className={inputCls}
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Número Yape</span>
              <input
                className={inputCls}
                value={form.yapeNumber}
                onChange={(e) => set({ yapeNumber: e.target.value })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>ETA mín (min)</span>
              <input
                type="number"
                className={inputCls}
                value={form.estimatedEtaMin}
                min={1}
                max={180}
                onChange={(e) => set({ estimatedEtaMin: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>ETA máx (min)</span>
              <input
                type="number"
                className={inputCls}
                value={form.estimatedEtaMax}
                min={1}
                max={180}
                onChange={(e) => set({ estimatedEtaMax: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Delivery (S/)</span>
              <input
                type="number"
                step="0.5"
                className={inputCls}
                value={form.deliveryFee}
                min={0}
                onChange={(e) => set({ deliveryFee: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Color (hex)</span>
              <input
                className={inputCls}
                value={form.accentColor}
                pattern="[0-9a-f]{6}"
                onChange={(e) => set({ accentColor: e.target.value })}
              />
            </label>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <p className="mb-2 font-display font-semibold text-[15px] text-ink">Capacidades</p>
            <div className="space-y-2">
              {CAP.map((c) => (
                <label key={c.key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={form[c.key] as boolean}
                    onChange={(e) => set({ [c.key]: e.target.checked } as Partial<Form>)}
                  />
                  <span className="text-[14px] text-ink">
                    {c.label} <span className="text-[12px] text-ink-subtle">· {c.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </CardBody>
        </Card>

        {msg && <p className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </form>

      <ScheduleEditor />
    </div>
  )
}
