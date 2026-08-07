'use client'

import { ApiError } from '@tindivo/api-client'
import { PhonePeSchema } from '@tindivo/contracts'
import { useCallback, useEffect, useState } from 'react'
import { notifySuccess } from '@/components/dashboard/toast'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { WA_ERROR } from '../lib/constants'
import type { Form } from '../types'

export interface ConfigMessage {
  ok: boolean
  text: string
}

export function useBusinessConfig() {
  const [form, setForm] = useState<Form | null>(null)
  const [capability, setCapability] = useState<string>('')
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [msg, setMsg] = useState<ConfigMessage | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase
      .from('businesses')
      .select(
        'name,phone,whatsapp_number,yape_number,tagline,accent_color,estimated_eta_min,estimated_eta_max,delivery_fee,publishes_catalog,accepts_web_pickup,accepts_web_delivery,uses_tindivo_drivers,primary_capability,qr_url,logo_url,banner_url',
      )
      .maybeSingle()
      .then(({ data: biz }) => {
        if (!biz) return
        setQrUrl(biz.qr_url ?? null)
        setLogoUrl(biz.logo_url ?? null)
        setBannerUrl(biz.banner_url ?? null)
        setForm({
          name: biz.name ?? '',
          phone: biz.phone ?? '',
          whatsappNumber: biz.whatsapp_number ?? '',
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

  const save = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault()
      if (!form) return
      const waTrimmed = form.whatsappNumber.trim()
      const waParsed = waTrimmed ? PhonePeSchema.safeParse(waTrimmed) : null
      if (waParsed && !waParsed.success) {
        setMsg({ ok: false, text: `WhatsApp para pedidos: ${WA_ERROR.toLowerCase()}` })
        return
      }
      setSaving(true)
      setMsg(null)
      try {
        const payload = {
          name: form.name,
          phone: form.phone,
          whatsappNumber: waParsed?.success ? waParsed.data : null,
          tagline: form.tagline,
          ...(capability !== 'catalog_only' && {
            yapeNumber: form.yapeNumber,
            estimatedEtaMin: form.estimatedEtaMin,
            estimatedEtaMax: form.estimatedEtaMax,
            deliveryFee: form.deliveryFee,
          }),
        }
        const r = await api.patch<{ data: { primary_capability: string } }>(
          '/business/profile',
          payload,
        )
        setCapability(r.data.primary_capability ?? '')
        notifySuccess('Cambios guardados')
      } catch (err) {
        setMsg({
          ok: false,
          text:
            err instanceof ApiError
              ? (err.problem.errors?.[0]?.message ?? err.problem.detail ?? err.message)
              : 'Error al guardar.',
        })
      } finally {
        setSaving(false)
      }
    },
    [form, capability],
  )

  const set = useCallback((patch: Partial<Form>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : null))
  }, [])

  return {
    form,
    capability,
    qrUrl,
    logoUrl,
    bannerUrl,
    msg,
    saving,
    save,
    set,
    setQrUrl,
    setLogoUrl,
    setBannerUrl,
  }
}
