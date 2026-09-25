'use client'

import { ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { createCourierOrder, type Requester } from '../lib/api'
import { type CourierContact, recentContacts } from '../lib/contacts'
import { useCourierStore } from '../lib/store'
import type { CourierOrderResult } from '../types'

interface CustomerIdentity {
  userId: string | null
  name: string
  phone: string
  phoneVerified: boolean
}

async function loadIdentity(): Promise<CustomerIdentity> {
  const supabase = getSupabaseBrowser()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { userId: null, name: '', phone: '', phoneVerified: false }

  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase
      .from('customer_profiles')
      .select('phone, phone_verified_at')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
  ])

  return {
    userId: user.id,
    name: userRow?.full_name ?? '',
    phone: profile?.phone ?? '',
    phoneVerified: profile?.phone_verified_at != null,
  }
}

async function loadRecentContacts(userId: string, myPhone: string): Promise<CourierContact[]> {
  const supabase = getSupabaseBrowser()
  const { data } = await supabase
    .from('courier_orders')
    .select('origin_name, origin_phone, destination_name, destination_phone')
    .eq('customer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  return recentContacts(data ?? [], myPhone)
}

async function loadDefaultAddress() {
  const supabase = getSupabaseBrowser()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('customer_addresses')
    .select('line, reference, coordinates_lat, coordinates_lng')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle()
  if (!data || data.coordinates_lat == null || data.coordinates_lng == null) return null
  return {
    referenceText: data.reference,
    coordinates: { lat: Number(data.coordinates_lat), lng: Number(data.coordinates_lng) },
  }
}

/**
 * Orquestador del flujo de "pedir entrega" — patrón `use-checkout.ts`: junta
 * la identidad del cliente, precarga el destino por defecto, y expone
 * `submit()` para el paso final (`confirm`/`person-details`).
 */
export function useCourierRequest() {
  const draft = useCourierStore((s) => s.draft)
  const updateDraft = useCourierStore((s) => s.updateDraft)
  const updatePoint = useCourierStore((s) => s.updatePoint)
  const fromBusiness = useCourierStore((s) => s.fromBusiness)
  const submitted = useCourierStore((s) => s.submitted)

  const [identity, setIdentity] = useState<CustomerIdentity | null>(null)
  const [recents, setRecents] = useState<CourierContact[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    loadIdentity().then((id) => {
      if (!on) return
      setIdentity(id)
      if (id.userId) {
        loadRecentContacts(id.userId, id.phone).then((list) => {
          if (on) setRecents(list)
        })
      }
    })
    return () => {
      on = false
    }
  }, [])

  // Precarga el destino con la dirección por defecto del cliente SOLO cuando
  // el flujo entró desde un negocio (Main.dc.html: "Llevamos a" ya viene
  // relleno). En "otro lugar o persona" el destino lo escribe la persona.
  useEffect(() => {
    if (!fromBusiness || draft.destination.coordinates) return
    let on = true
    loadDefaultAddress().then((addr) => {
      if (!on || !addr) return
      updatePoint('destination', {
        contactName: identity?.name ?? '',
        contactPhone: identity?.phone ?? '',
        coordinates: addr.coordinates,
        referenceText: addr.referenceText,
      })
    })
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromBusiness, identity])

  async function submit(utmSource?: string | null): Promise<CourierOrderResult | null> {
    if (!identity?.userId) {
      setError('Ingresa con tu celular para continuar.')
      return null
    }
    const requester: Requester = { name: identity.name || 'Cliente', phone: identity.phone }
    setSubmitting(true)
    setError(null)
    try {
      const result = await createCourierOrder(draft, requester, utmSource)
      submitted(result)
      return result
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.problem.detail ?? err.message)
      } else {
        setError('No pudimos crear tu solicitud. Intenta de nuevo.')
      }
      return null
    } finally {
      setSubmitting(false)
    }
  }

  return { draft, updateDraft, updatePoint, identity, recents, submitting, error, submit }
}
