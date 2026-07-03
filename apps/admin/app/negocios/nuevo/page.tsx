'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { BUSINESS_ACCENT_PALETTE } from '@tindivo/contracts'
import Link from 'next/link'
import { type FormEvent, useEffect, useState } from 'react'
import { AccentColorPicker, Field, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

const DEFAULT_FORM = {
  email: '',
  password: '',
  name: '',
  tagline: '',
  // `as string`: la paleta es `as const` y el literal sobre-estrecharía el estado.
  accentColor: BUSINESS_ACCENT_PALETTE[0].hex as string,
}

export default function NuevoNegocioPage() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [usedColors, setUsedColors] = useState<string[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  // Colores de negocios activos, para marcar "en uso" en el picker (advisory).
  useEffect(() => {
    api
      .get<ApiEnvelope<{ accent_color: string; is_active: boolean }[]>>('/admin/businesses')
      .then((r) => setUsedColors(r.data.filter((b) => b.is_active).map((b) => b.accent_color)))
      .catch(() => setUsedColors([]))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      const r = await api.post<ApiEnvelope<{ business: { id: string; name: string } }>>(
        '/admin/businesses',
        {
          ...form,
          publishesCatalog: true,
          acceptsWebPickup: true,
          acceptsWebDelivery: true,
          usesTindivoDrivers: true,
        },
      )
      setMsg({ ok: true, text: `Negocio "${r.data.business.name}" creado.` })
      setUsedColors((prev) => [...prev, form.accentColor])
      setForm(DEFAULT_FORM)
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionHeader
        eyebrow="Red · Alta"
        title="Nuevo negocio"
        right={
          <Link href="/negocios" className="text-[13px] text-ink-muted hover:text-ink">
            ← Volver
          </Link>
        }
      />
      <div className="t-card">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre del negocio">
            <input
              className="t-field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Tagline">
            <input
              className="t-field"
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </Field>
          <Field label="Correo de acceso">
            <input
              type="email"
              className="t-field"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Contraseña (mín. 8)">
            <input
              className="t-field"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={8}
              required
            />
          </Field>
          <Field label="Color de papelito" className="sm:col-span-2">
            <AccentColorPicker
              value={form.accentColor}
              onChange={(hex) => setForm({ ...form, accentColor: hex })}
              usedColors={usedColors}
            />
          </Field>
          <div className="flex items-end">
            <button type="submit" className="t-btn t-btn-primary t-btn-block" disabled={loading}>
              {loading ? 'Creando…' : 'Crear negocio'}
            </button>
          </div>
          {msg && (
            <p className={`text-[14px] sm:col-span-2 ${msg.ok ? 'text-success' : 'text-danger'}`}>
              {msg.text}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
