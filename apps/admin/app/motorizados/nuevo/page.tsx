'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { Field, SectionHeader } from '@/components/admin'
import { api, errMsg } from '@/lib/api'

export default function NuevoMotorizadoPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    vehicleType: 'moto',
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    setLoading(true)
    try {
      const r = await api.post<ApiEnvelope<{ driver: { full_name: string } }>>(
        '/admin/drivers',
        form,
      )
      setMsg({ ok: true, text: `Motorizado "${r.data.driver.full_name}" creado.` })
      setForm({ email: '', password: '', fullName: '', phone: '', vehicleType: 'moto' })
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
        title="Nuevo motorizado"
        right={
          <Link href="/motorizados" className="text-[13px] text-ink-muted hover:text-ink">
            ← Volver
          </Link>
        }
      />
      <div className="t-card">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre completo">
            <input
              className="t-field"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </Field>
          <Field label="Celular">
            <input
              className="t-field"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
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
          <Field label="Vehículo">
            <select
              className="t-field"
              value={form.vehicleType}
              onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
            >
              <option value="moto">Moto</option>
              <option value="bici">Bici</option>
              <option value="auto">Auto</option>
              <option value="pie">A pie</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className="t-btn t-btn-primary t-btn-block" disabled={loading}>
              {loading ? 'Creando…' : 'Crear motorizado'}
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
