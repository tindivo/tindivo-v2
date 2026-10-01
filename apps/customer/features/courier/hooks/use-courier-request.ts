'use client'

import { ApiError } from '@tindivo/api-client'
import { useEffect, useState } from 'react'
import { useActiveCourierOrdersStore } from '@/lib/active-courier-orders'
import { useOnboarding } from '@/lib/onboarding-store'
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
  // `getSession` lee la sesión local; `getUser` iba al servidor de auth en
  // cada apertura. La RLS de las dos consultas de abajo ya valida el token.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
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

interface FlowContext {
  identity: CustomerIdentity
  recents: CourierContact[]
}

/** Cuánto vale lo cargado: lo que dura abrir el flujo, no una sesión entera. */
const CONTEXT_TTL_MS = 10_000
let contextCache: { at: number; value: Promise<FlowContext> } | null = null

/**
 * Identidad + contactos recientes, UNA vez por apertura.
 *
 * `useCourierRequest` lo usan dos hojas montadas a la vez (`TripDetailsSheet`
 * y `ConfirmSheet`), y cada una cargaba lo suyo: cuatro o cinco consultas
 * repetidas cada vez que alguien tocaba Entregas. Ahora la segunda reutiliza
 * la promesa de la primera.
 */
function loadFlowContext(): Promise<FlowContext> {
  if (contextCache && Date.now() - contextCache.at < CONTEXT_TTL_MS) return contextCache.value
  const value = loadIdentity().then(async (identity) => ({
    identity,
    recents: identity.userId ? await loadRecentContacts(identity.userId, identity.phone) : [],
  }))
  contextCache = { at: Date.now(), value }
  value.catch(() => {
    contextCache = null
  })
  return value
}

async function loadDefaultAddress() {
  const supabase = getSupabaseBrowser()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
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

  // Se recarga cada vez que se abre Entregas: quien inició sesión con la app
  // ya cargada (login al entrar, `open-flow.ts`) tiene que ver su «Soy yo».
  // El seguimiento también abre la hoja, pero no necesita nada de esto.
  const sheetOpen = useCourierStore((s) => s.open && s.step !== 'tracking')
  useEffect(() => {
    if (!sheetOpen) return
    let on = true
    void loadFlowContext().then(({ identity: id, recents: list }) => {
      if (!on) return
      setIdentity(id)
      setRecents(list)
    })
    return () => {
      on = false
    }
  }, [sheetOpen])

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
    // La sesión pudo iniciarse después de cargar la identidad: se pregunta de
    // nuevo antes de rendirse. Si de verdad no hay, se ABRE el login (antes
    // solo se decía con un texto, al final del pedido).
    const who = identity?.userId ? identity : await loadIdentity()
    if (!who.userId) {
      setIdentity(who)
      setError('Inicia sesión y vuelve a tocar «Pedir entrega».')
      useOnboarding.getState().openSheet({ next: null, inPlace: true })
      return null
    }
    if (who !== identity) setIdentity(who)
    const requester: Requester = { name: who.name || 'Cliente', phone: who.phone }
    setSubmitting(true)
    setError(null)
    try {
      const result = await createCourierOrder(draft, requester, utmSource)
      submitted(result)
      // El banner «Entrega en curso» y el badge de «Pedidos» no esperan al
      // evento de Realtime: quien acaba de pedir tiene que verla al volver.
      void useActiveCourierOrdersStore.getState().recargar()
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
