'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { PhonePeSchema } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import {
  AccentColorPicker,
  EmptyState,
  Field,
  Ico,
  SectionHeader,
  StatusBadge,
} from '@/components/admin'
import { BusinessLocationMap, type LatLng } from '@/components/businesses/business-location-map'
import { api, errMsg } from '@/lib/api'
import { soles } from '@/lib/format'

interface BusinessDetail {
  id: string
  name: string
  slug: string
  tagline: string | null
  address: string | null
  coordinates_lat: number | null
  coordinates_lng: number | null
  estimated_eta_min: number
  estimated_eta_max: number
  phone: string | null
  whatsapp_number: string | null
  yape_number: string | null
  plin_number: string | null
  accent_color: string
  delivery_fee: number
  commission_override_delivery: number | null
  commission_override_pickup: number | null
  is_active: boolean
  is_blocked: boolean
  blocked_for_debt: boolean
  block_reason: string | null
  balance_due: number
  primary_capability: string
  publishes_catalog: boolean
  accepts_web_pickup: boolean
  accepts_web_delivery: boolean
  uses_tindivo_drivers: boolean
}

export default function AdminEditNegocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [usedColors, setUsedColors] = useState<string[]>([])

  // Campos de formulario
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [tagline, setTagline] = useState('')
  const [address, setAddress] = useState('')
  const [coordinates, setCoordinates] = useState<LatLng | null>(null)
  const [etaMin, setEtaMin] = useState<number>(20)
  const [etaMax, setEtaMax] = useState<number>(45)
  const [phone, setPhone] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [yapeNumber, setYapeNumber] = useState('')
  const [plinNumber, setPlinNumber] = useState('')
  const [accentColor, setAccentColor] = useState('f97316')
  const [deliveryFee, setDeliveryFee] = useState<number>(3)
  const [commissionDelivery, setCommissionDelivery] = useState<string>('')
  const [commissionPickup, setCommissionPickup] = useState<string>('')
  const [isActive, setIsActive] = useState(true)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockReason, setBlockReason] = useState<string | null>(null)
  const [balanceDue, setBalanceDue] = useState(0)

  // Capacidades / modo
  const [publishesCatalog, setPublishesCatalog] = useState(true)
  const [acceptsWebPickup, setAcceptsWebPickup] = useState(false)
  const [acceptsWebDelivery, setAcceptsWebDelivery] = useState(true)
  const [usesTindivoDrivers, setUsesTindivoDrivers] = useState(true)

  // Cargar colores en uso
  useEffect(() => {
    api
      .get<ApiEnvelope<{ accent_color: string; is_active: boolean }[]>>('/admin/businesses')
      .then((r) => setUsedColors(r.data.filter((b) => b.is_active).map((b) => b.accent_color)))
      .catch(() => setUsedColors([]))
  }, [])

  // Cargar detalle del negocio
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .get<ApiEnvelope<BusinessDetail>>(`/admin/businesses/${id}`)
      .then((r) => {
        const b = r.data
        setName(b.name)
        setSlug(b.slug ?? '')
        setTagline(b.tagline ?? '')
        setAddress(b.address ?? '')
        if (b.coordinates_lat != null && b.coordinates_lng != null) {
          setCoordinates({ lat: b.coordinates_lat, lng: b.coordinates_lng })
        } else {
          setCoordinates(null)
        }
        setEtaMin(b.estimated_eta_min ?? 20)
        setEtaMax(b.estimated_eta_max ?? 45)
        setPhone(b.phone ?? '')
        setWhatsappNumber(b.whatsapp_number ?? '')
        setYapeNumber(b.yape_number ?? '')
        setPlinNumber(b.plin_number ?? '')
        setAccentColor(b.accent_color ?? 'f97316')
        setDeliveryFee(b.delivery_fee ?? 3)
        setCommissionDelivery(
          b.commission_override_delivery != null ? String(b.commission_override_delivery) : '',
        )
        setCommissionPickup(
          b.commission_override_pickup != null ? String(b.commission_override_pickup) : '',
        )
        setIsActive(b.is_active)
        setIsBlocked(b.is_blocked)
        setBlockReason(b.block_reason)
        setBalanceDue(b.balance_due)
        setPublishesCatalog(b.publishes_catalog)
        setAcceptsWebPickup(b.accepts_web_pickup)
        setAcceptsWebDelivery(b.accepts_web_delivery)
        setUsesTindivoDrivers(b.uses_tindivo_drivers)
      })
      .catch((err) => setError(errMsg(err)))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Guardar cambios
  async function handleSave() {
    setError(null)
    setSuccessMsg(null)
    setSaving(true)

    // Validar WhatsApp si está ingresado
    let cleanedWa: string | null = null
    if (whatsappNumber.trim()) {
      const waParsed = PhonePeSchema.safeParse(whatsappNumber.trim())
      if (!waParsed.success) {
        setError('El WhatsApp debe ser un número peruano válido de 9 dígitos empezando por 9.')
        setSaving(false)
        return
      }
      cleanedWa = waParsed.data
    }

    try {
      await api.patch(`/admin/businesses/${id}`, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        tagline: tagline.trim() || null,
        address: address.trim() || null,
        coordinatesLat: coordinates ? coordinates.lat : null,
        coordinatesLng: coordinates ? coordinates.lng : null,
        estimatedEtaMin: etaMin,
        estimatedEtaMax: etaMax,
        phone: phone.trim() || null,
        whatsappNumber: cleanedWa,
        yapeNumber: yapeNumber.trim() || null,
        plinNumber: plinNumber.trim() || null,
        accentColor,
        deliveryFee,
        commissionOverrideDelivery: commissionDelivery.trim()
          ? Number.parseFloat(commissionDelivery)
          : null,
        commissionOverridePickup: commissionPickup.trim()
          ? Number.parseFloat(commissionPickup)
          : null,
        isActive,
        publishesCatalog,
        acceptsWebPickup,
        acceptsWebDelivery,
        usesTindivoDrivers,
      })

      setSuccessMsg('Los cambios del restaurante se han guardado exitosamente.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  // Predefinir modo
  function applyModePreset(preset: 'delivery' | 'catalog') {
    if (preset === 'delivery') {
      setPublishesCatalog(true)
      setAcceptsWebPickup(false)
      setAcceptsWebDelivery(true)
      setUsesTindivoDrivers(true)
    } else {
      setPublishesCatalog(true)
      setAcceptsWebPickup(false)
      setAcceptsWebDelivery(false)
      setUsesTindivoDrivers(false)
    }
  }

  const isCatalogOnly = publishesCatalog && !acceptsWebDelivery && !usesTindivoDrivers

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 py-8">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-ink/[0.06]" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-ink/[0.05]" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-ink/[0.05]" />
      </div>
    )
  }

  if (error && !name) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="t-card py-10">
          <EmptyState
            icon={<Ico.store className="h-6 w-6 text-danger" />}
            title="Error al cargar negocio"
            hint={error}
          />
          <div className="mt-4 flex justify-center">
            <Link href="/negocios" className="t-btn t-btn-outline">
              ← Volver a la lista
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      {/* Encabezado y navegación */}
      <div>
        <div className="mb-2">
          <Link
            href="/negocios"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-muted hover:text-ink transition-colors"
          >
            ← Volver a negocios
          </Link>
        </div>
        <SectionHeader
          eyebrow="Configuración de Restaurante"
          title={name || 'Editar Restaurante'}
          description={`ID: ${id} · Deuda actual: ${soles(balanceDue)}`}
          right={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="brand" disabled={saving} onClick={handleSave}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          }
        />
      </div>

      {/* Alertas */}
      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-[14px] text-danger">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-success/20 bg-success/10 p-3 text-[14px] text-success">
          {successMsg}
        </div>
      )}

      {/* Estado del negocio */}
      {isBlocked && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-start gap-3">
            <span className="text-[20px]">⚠️</span>
            <div>
              <div className="font-bold text-[15px] text-danger">
                Este restaurante está bloqueado
              </div>
              <p className="mt-0.5 text-[13px] text-ink-muted">
                Motivo: {blockReason ?? 'Sin motivo registrado'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tarjeta 1: Identidad del Negocio */}
      <div className="t-card space-y-4">
        <div className="border-b border-ink/10 pb-3">
          <h3 className="font-bold text-[16px] text-ink">Identidad y Catálogo</h3>
          <p className="text-[12px] text-ink-muted">
            Datos visibles para los clientes en la plataforma web y la app móvil.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del restaurante">
            <input
              type="text"
              className="t-field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>

          <Field label="Slug URL (catálogo web)">
            <input
              type="text"
              className="t-field font-mono"
              placeholder="mi-restaurante"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
            {slug && (
              <span className="mt-1 block text-[11px] text-ink-subtle truncate">
                Catálogo: tindivo.com/negocio/{slug}
              </span>
            )}
          </Field>

          <Field label="Tagline / Eslogan comercial" className="sm:col-span-2">
            <input
              type="text"
              className="t-field"
              placeholder="Ej. Las mejores hamburguesas artesanales de San Jacinto"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </Field>

          <div className="sm:col-span-2">
            <span className="t-field-label block mb-1">Color de papelito / Marca</span>
            <AccentColorPicker
              value={accentColor}
              onChange={setAccentColor}
              usedColors={usedColors}
            />
          </div>
        </div>
      </div>

      {/* Tarjeta 2: Ubicación y Coordenadas GPS (Mapa interactivo) */}
      <div className="t-card space-y-4">
        <div className="border-b border-ink/10 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[16px] text-ink">Ubicación y Coordenadas GPS</h3>
              <p className="text-[12px] text-ink-muted">
                Define el punto exacto para cálculo de rutas de entrega y visualización del local.
              </p>
            </div>
            {coordinates ? (
              <StatusBadge label="GPS fijado" tone="success" />
            ) : (
              <StatusBadge label="Sin GPS" tone="neutral" />
            )}
          </div>
        </div>

        <Field label="Dirección física / Referencia">
          <input
            type="text"
            className="t-field"
            placeholder="Ej. Jr. Comercio 123, Frente a la Plaza Mayor"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>

        <div>
          <span className="t-field-label block mb-2">Seleccionar ubicación en el mapa</span>
          <BusinessLocationMap
            value={coordinates}
            onChange={setCoordinates}
            heightPx={360}
            businessName={name}
          />
        </div>
      </div>

      {/* Tarjeta 3: Contacto y Cuentas de Cobro */}
      <div className="t-card space-y-4">
        <div className="border-b border-ink/10 pb-3">
          <h3 className="font-bold text-[16px] text-ink">Contacto y Pagos</h3>
          <p className="text-[12px] text-ink-muted">
            Canales de comunicación directa y billeteras móviles para pagos de clientes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono de contacto / Local">
            <input
              type="text"
              className="t-field font-mono"
              placeholder="Ej. 987654321"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Field label="WhatsApp para pedidos (Modo catálogo)">
            <input
              type="text"
              className="t-field font-mono"
              placeholder="Ej. 9XXXXXXXX"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
            />
          </Field>

          <Field label="Número Yape">
            <input
              type="text"
              className="t-field font-mono"
              placeholder="Ej. 9XXXXXXXX"
              value={yapeNumber}
              onChange={(e) => setYapeNumber(e.target.value)}
            />
          </Field>

          <Field label="Número Plin">
            <input
              type="text"
              className="t-field font-mono"
              placeholder="Ej. 9XXXXXXXX"
              value={plinNumber}
              onChange={(e) => setPlinNumber(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Tarjeta 4: Tiempos y Operaciones de Delivery */}
      <div className="t-card space-y-4">
        <div className="border-b border-ink/10 pb-3">
          <h3 className="font-bold text-[16px] text-ink">Tiempos y Comisiones</h3>
          <p className="text-[12px] text-ink-muted">
            Tarifas base, tiempo estimado de entrega y acuerdos de comisión de la plataforma.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tarifa de delivery base (S/)">
            <input
              type="number"
              step="0.5"
              min="0"
              className="t-field font-mono"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(Number.parseFloat(e.target.value) || 0)}
            />
          </Field>

          <Field label="ETA mínimo (minutos)">
            <input
              type="number"
              min="5"
              max="180"
              className="t-field font-mono"
              value={etaMin}
              onChange={(e) => setEtaMin(Number.parseInt(e.target.value, 10) || 15)}
            />
          </Field>

          <Field label="ETA máximo (minutos)">
            <input
              type="number"
              min="10"
              max="240"
              className="t-field font-mono"
              value={etaMax}
              onChange={(e) => setEtaMax(Number.parseInt(e.target.value, 10) || 45)}
            />
          </Field>

          <Field label="Comisión Delivery (S/)" className="sm:col-span-1">
            <input
              type="number"
              step="0.5"
              min="0"
              className="t-field font-mono"
              placeholder="Por defecto del sistema"
              value={commissionDelivery}
              onChange={(e) => setCommissionDelivery(e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-ink-subtle">
              En blanco = comisión global
            </span>
          </Field>

          <Field label="Comisión Recojo (S/)" className="sm:col-span-1">
            <input
              type="number"
              step="0.5"
              min="0"
              className="t-field font-mono"
              placeholder="Por defecto del sistema"
              value={commissionPickup}
              onChange={(e) => setCommissionPickup(e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-ink-subtle">
              En blanco = comisión global
            </span>
          </Field>
        </div>
      </div>

      {/* Tarjeta 5: Modo de Operación y Estado */}
      <div className="t-card space-y-4">
        <div className="border-b border-ink/10 pb-3">
          <h3 className="font-bold text-[16px] text-ink">Modo de Operación y Estado</h3>
          <p className="text-[12px] text-ink-muted">
            Define cómo opera el restaurante en la plataforma.
          </p>
        </div>

        {/* Presets de modo */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => applyModePreset('delivery')}
            className={`rounded-2xl border p-4 text-left transition-all ${
              !isCatalogOnly
                ? 'border-brand bg-brand/5 ring-2 ring-brand'
                : 'border-ink/10 hover:border-ink/20'
            }`}
          >
            <div className="font-bold text-[15px] text-ink">Delivery Tindivo</div>
            <p className="mt-1 text-[13px] text-ink-muted">
              Recibe pedidos web y los motorizados de la plataforma se encargan del despacho.
            </p>
          </button>

          <button
            type="button"
            onClick={() => applyModePreset('catalog')}
            className={`rounded-2xl border p-4 text-left transition-all ${
              isCatalogOnly
                ? 'border-brand bg-brand/5 ring-2 ring-brand'
                : 'border-ink/10 hover:border-ink/20'
            }`}
          >
            <div className="font-bold text-[15px] text-ink">Solo catálogo (WhatsApp)</div>
            <p className="mt-1 text-[13px] text-ink-muted">
              El cliente arma su canasta en la web y envía el pedido directamente por WhatsApp.
            </p>
          </button>
        </div>

        {/* Switches de estado */}
        <div className="pt-2 border-t border-ink/10 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink/20 text-brand focus:ring-brand"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <div>
              <span className="font-semibold text-[14px] text-ink">
                Negocio activo en plataforma
              </span>
              <p className="text-[12px] text-ink-muted">
                Si se desactiva, los clientes no podrán hacer nuevos pedidos en este restaurante.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Barra fija inferior de guardar cambios */}
      <div className="sticky bottom-4 z-40 rounded-2xl border border-ink/10 bg-white/95 p-4 shadow-xl backdrop-blur-md flex items-center justify-between">
        <div className="text-[13px] text-ink-muted">
          Asegúrate de guardar los cambios antes de salir.
        </div>
        <div className="flex items-center gap-2">
          <Link href="/negocios" className="t-btn t-btn-ghost text-[13px]">
            Cancelar
          </Link>
          <Button size="sm" variant="brand" disabled={saving} onClick={handleSave}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  )
}
