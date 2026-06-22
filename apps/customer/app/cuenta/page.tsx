'use client'

import { ADDRESS_REFERENCE_MAX, ADDRESS_REFERENCE_MIN } from '@tindivo/contracts'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { type LatLng, MapPicker } from '@/components/map-picker'
import { BottomSheet, Icon, ScreenHeader } from '@/components/ui'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const soles = (n: number | null) => (n == null ? '—' : `S/ ${Number(n).toFixed(2)}`)
const labelEmoji = (l: string) => (l === 'Casa' ? '🏠' : l === 'Trabajo' ? '💼' : '📍')

const STATUS_LABEL: Record<string, string> = {
  validando: 'Validando',
  pending_acceptance: 'Por aceptar',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  waiting_driver: 'Buscando moto',
  heading_to_restaurant: 'Moto en camino',
  waiting_at_restaurant: 'Moto en local',
  picked_up: 'En reparto',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

interface Address {
  id: string
  label: string
  line: string | null
  reference: string
  is_default: boolean
  coordinates_lat: number | null
  coordinates_lng: number | null
}
interface OrderRow {
  id: string
  short_id: string
  status: string
  order_amount: number
  created_at: string
}
interface Profile {
  name: string
  email: string
  phone: string
}

export default function CuentaPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', phone: '' })
  const [addresses, setAddresses] = useState<Address[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [editing, setEditing] = useState<Address | 'new' | null>(null)

  const loadData = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const [{ data: addrs }, { data: ords }] = await Promise.all([
      supabase
        .from('customer_addresses')
        .select('id,label,line,reference,is_default,coordinates_lat,coordinates_lng')
        .order('is_default', { ascending: false }),
      supabase
        .from('orders')
        .select('id,short_id,status,order_amount,created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setAddresses((addrs ?? []) as Address[])
    setOrders((ords ?? []) as OrderRow[])
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/entrar?next=/cuenta')
        return
      }
      const meta = data.session.user.user_metadata as { full_name?: string } | undefined
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('full_name,phone')
        .maybeSingle()
      setProfile({
        name: prof?.full_name ?? meta?.full_name ?? '',
        email: data.session.user.email ?? '',
        phone: prof?.phone ?? '',
      })
      await loadData()
      setReady(true)
    })
  }, [router, loadData])

  async function setDefault(id: string) {
    const supabase = getSupabaseBrowser()
    await supabase.from('customer_addresses').update({ is_default: false }).neq('id', id)
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id)
    await loadData()
  }

  async function remove(id: string) {
    await getSupabaseBrowser().from('customer_addresses').delete().eq('id', id)
    await loadData()
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/')
  }

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>
  const initial = (profile.name[0] ?? profile.email[0] ?? 'U').toUpperCase()

  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface pb-16">
      <ScreenHeader title="Mi cuenta" onBack={() => router.push('/')} />

      <div className="px-4 pt-2">
        {/* Profile card */}
        <div
          className="relative flex items-center gap-4 overflow-hidden rounded-[22px] p-5 text-white"
          style={{ background: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)' }}
        >
          <div
            className="absolute rounded-full"
            style={{
              right: -20,
              top: -30,
              width: 140,
              height: 140,
              background: 'rgba(255,255,255,0.1)',
            }}
          />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.18] font-bold text-[22px]">
            {initial}
          </div>
          <div className="relative flex-1">
            <div className="t-display text-[20px] leading-[1.1]">{profile.name || 'Usuario'}</div>
            <div className="mt-0.5 text-[12px] opacity-85">{profile.email}</div>
            {profile.phone && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.18] px-2.5 py-[3px] text-[11px]">
                <Icon.Phone style={{ width: 12, height: 12 }} /> {profile.phone}
              </div>
            )}
          </div>
        </div>

        {/* Addresses */}
        <div className="mt-6 flex items-baseline justify-between">
          <div className="t-display text-[19px]">Mis direcciones</div>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1 font-semibold text-[13px] text-brand"
          >
            <Icon.Plus style={{ width: 14, height: 14 }} /> Añadir
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2.5">
          {addresses.length === 0 ? (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="flex flex-col items-center gap-1.5 rounded-[18px] px-4 py-6"
              style={{
                background: 'rgba(249,115,22,0.04)',
                border: '1.5px dashed rgba(249,115,22,0.35)',
                color: '#C2410C',
              }}
            >
              <Icon.Plus style={{ width: 22, height: 22 }} />
              <span className="font-semibold text-[14px]">Añade tu primera dirección</span>
              <span className="text-[11px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                Guárdala una vez, úsala siempre.
              </span>
            </button>
          ) : (
            addresses.map((a) => (
              <div
                key={a.id}
                className="flex items-start gap-3 rounded-[18px] border border-border bg-white p-3.5"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
                  style={{ background: 'rgba(249,115,22,0.1)' }}
                >
                  {labelEmoji(a.label)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[14px]">{a.label}</span>
                    {a.is_default && (
                      <span
                        className="rounded-[5px] px-1.5 py-0.5 font-bold text-[9px] uppercase"
                        style={{ color: '#F97316', background: 'rgba(249,115,22,0.1)' }}
                      >
                        Por defecto
                      </span>
                    )}
                  </div>
                  {a.line && (
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: 'rgba(26,22,20,0.85)' }}
                    >
                      {a.line}
                    </div>
                  )}
                  <div className="mt-1 text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                    {a.reference}
                  </div>
                  <div className="mt-2.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(a)}
                      className="rounded-lg bg-ink/[0.05] px-2.5 py-1.5 font-medium text-[12px]"
                    >
                      Editar
                    </button>
                    {!a.is_default && (
                      <button
                        type="button"
                        onClick={() => setDefault(a.id)}
                        className="rounded-lg bg-ink/[0.05] px-2.5 py-1.5 font-medium text-[12px]"
                      >
                        Predeterminada
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* History */}
        <div className="mt-6 mb-2">
          <div className="t-display text-[19px]">Pedidos anteriores</div>
        </div>
        {orders.length === 0 ? (
          <p className="t-muted text-[13px]">Aún no tienes pedidos.</p>
        ) : (
          <div className="overflow-hidden rounded-[18px] border border-border bg-white">
            {orders.map((o, i) => (
              <Link
                key={o.id}
                href={`/pedido/${o.short_id}`}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{
                  borderBottom: i < orders.length - 1 ? '1px solid rgba(26,22,20,0.06)' : 'none',
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                  style={{
                    background:
                      o.status === 'delivered' ? 'rgba(26,150,80,0.1)' : 'rgba(249,115,22,0.1)',
                    color: o.status === 'delivered' ? '#1A8050' : '#F97316',
                  }}
                >
                  {o.status === 'delivered' ? <Icon.Check /> : <Icon.Clock />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] font-semibold">#{o.short_id}</div>
                  <div className="text-[11px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
                    {STATUS_LABEL[o.status] ?? o.status} ·{' '}
                    {new Date(o.created_at).toLocaleDateString('es-PE')}
                  </div>
                </div>
                <div className="font-semibold text-[14px] tabular-nums">
                  {soles(o.order_amount)}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Account links */}
        <div className="mt-6 mb-2">
          <div className="t-display text-[19px]">Cuenta</div>
        </div>
        <div className="overflow-hidden rounded-[18px] border border-border bg-white">
          <Link
            href="/terminos"
            className="flex items-center gap-3 border-border border-b px-4 py-3.5 text-[14px] font-medium"
          >
            📄 <span className="flex-1">Términos y privacidad</span>
            <span style={{ opacity: 0.4 }}>›</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium"
            style={{ color: '#C2410C' }}
          >
            🚪 <span className="flex-1">Cerrar sesión</span>
          </button>
        </div>
      </div>

      {editing && (
        <AddressSheet
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadData()
          }}
          onDelete={
            editing !== 'new'
              ? () => {
                  remove(editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
    </main>
  )
}

function AddressSheet({
  address,
  onClose,
  onSaved,
  onDelete,
}: {
  address: Address | null
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
}) {
  const [label, setLabel] = useState(address?.label ?? 'Casa')
  const [line, setLine] = useState(address?.line ?? '')
  const [reference, setReference] = useState(address?.reference ?? '')
  const [isDefault, setIsDefault] = useState(address?.is_default ?? false)
  const [coords, setCoords] = useState<LatLng | null>(
    address?.coordinates_lat != null && address?.coordinates_lng != null
      ? { lat: Number(address.coordinates_lat), lng: Number(address.coordinates_lng) }
      : null,
  )
  const [insideZone, setInsideZone] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refLen = reference.trim().length
  const refOk = refLen >= ADDRESS_REFERENCE_MIN
  const canSave = refOk && insideZone

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    setBusy(true)
    setError(null)
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) return
    if (isDefault) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .neq('id', address?.id ?? '')
    }
    const payload = {
      label,
      line: line.trim() || null,
      reference: reference.trim(),
      is_default: isDefault,
      coordinates_lat: coords?.lat ?? null,
      coordinates_lng: coords?.lng ?? null,
    }
    const { error: err } = address
      ? await supabase.from('customer_addresses').update(payload).eq('id', address.id)
      : await supabase.from('customer_addresses').insert({ ...payload, user_id: userId })
    if (err) {
      setError(err.message)
      setBusy(false)
    } else onSaved()
  }

  return (
    <BottomSheet open onClose={onClose}>
      <ScreenHeader title={address ? 'Editar dirección' : 'Nueva dirección'} onBack={onClose} />
      <form onSubmit={save} className="t-scroll flex-1 px-4 pt-2 pb-6">
        <span className="t-field-label">Etiqueta</span>
        <div className="mb-3.5 flex gap-1.5">
          {['Casa', 'Trabajo', 'Otro'].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLabel(l)}
              className={`t-chip flex-1 justify-center${label === l ? ' active' : ''}`}
            >
              {labelEmoji(l)} {l}
            </button>
          ))}
        </div>

        <div className="mb-3.5">
          <span className="t-field-label">Ubicación en el mapa</span>
          <MapPicker
            value={coords}
            onChange={setCoords}
            onValidityChange={setInsideZone}
            heightPx={160}
          />
        </div>

        <label className="mb-3.5 block">
          <span className="t-field-label">Calle / Jirón</span>
          <input
            className="t-field"
            placeholder="Ej. Jr. Sucre 412"
            value={line}
            onChange={(e) => setLine(e.target.value)}
          />
        </label>

        <label className="mb-1.5 block">
          <span className="t-field-label">
            Referencia <span style={{ color: '#F97316' }}>*</span>
          </span>
          <textarea
            className="t-field"
            placeholder="Frente a la bodega, casa de reja negra, tocar timbre 2 veces…"
            value={reference}
            maxLength={ADDRESS_REFERENCE_MAX}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <div
          className="mb-4 flex justify-between gap-3 text-[11px]"
          style={{ color: refOk ? 'rgba(26,22,20,0.5)' : '#C2410C' }}
        >
          <span>
            {refOk
              ? 'Referencia suficiente'
              : `Mínimo ${ADDRESS_REFERENCE_MIN} caracteres · faltan ${ADDRESS_REFERENCE_MIN - refLen}`}
          </span>
          <span className="tabular-nums">
            {reference.length}/{ADDRESS_REFERENCE_MAX}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsDefault((d) => !d)}
          className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-white p-3.5 text-left"
        >
          <span
            className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
            style={{ background: isDefault ? '#F97316' : 'rgba(26,22,20,0.15)' }}
          >
            <span
              className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
              style={{ left: isDefault ? 18 : 2 }}
            />
          </span>
          <span className="flex-1">
            <span className="block font-medium text-[14px]">Usar como predeterminada</span>
            <span className="block text-[11px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Aparece primero al pedir.
            </span>
          </span>
        </button>

        {error && <p className="mt-3 text-danger text-sm">{error}</p>}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mt-3.5 w-full rounded-[14px] px-4 py-3.5 font-semibold text-[14px]"
            style={{ background: 'rgba(220,38,38,0.06)', color: '#DC2626' }}
          >
            Eliminar dirección
          </button>
        )}
        <button
          type="submit"
          className="t-btn t-btn-primary t-btn-block mt-4"
          disabled={!canSave || busy}
        >
          {busy ? 'Guardando…' : address ? 'Guardar cambios' : 'Guardar dirección'}
        </button>
      </form>
    </BottomSheet>
  )
}
