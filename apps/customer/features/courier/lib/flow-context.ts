'use client'

import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { CourierPoint } from '../types'
import { type CourierRoute, recentPoints, recentRoutes } from './routes'

export interface CustomerIdentity {
  userId: string | null
  name: string
  phone: string
  phoneVerified: boolean
}

export interface SavedAddress {
  referenceText: string
  coordinates: { lat: number; lng: number }
}

export async function loadIdentity(): Promise<CustomerIdentity> {
  const supabase = getSupabaseBrowser()
  // `getSession` lee la sesión local; `getUser` iba al servidor de auth en
  // cada apertura. La RLS de las dos consultas de abajo ya valida el token.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return { userId: null, name: '', phone: '', phoneVerified: false }

  const [{ data: profile, error: profileError }, { data: userRow, error: userError }] =
    await Promise.all([
      supabase
        .from('customer_profiles')
        .select('phone, phone_verified_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('users').select('full_name').eq('id', user.id).maybeSingle(),
    ])
  // Un error de la base NO es «no hay datos»: se propaga, para que la lupa
  // diga que no pudo cargar en lugar de mostrarse vacía.
  if (profileError) throw profileError
  if (userError) throw userError

  return {
    userId: user.id,
    name: userRow?.full_name ?? '',
    phone: profile?.phone ?? '',
    phoneVerified: profile?.phone_verified_at != null,
  }
}

/** La dirección por defecto del cliente (`customer_addresses`), la de sus pedidos de comida. */
async function loadDefaultAddress(): Promise<SavedAddress | null> {
  const supabase = getSupabaseBrowser()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return null
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('line, reference, coordinates_lat, coordinates_lng')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle()
  if (error) throw error
  if (!data || data.coordinates_lat == null || data.coordinates_lng == null) return null
  return {
    referenceText: data.reference,
    coordinates: { lat: Number(data.coordinates_lat), lng: Number(data.coordinates_lng) },
  }
}

/**
 * Las últimas 20 entregas de quien pide: de ahí salen los contactos recientes,
 * «Repetir» y los sitios de la lupa. Una sola lectura para los tres. El filtro
 * por usuario evita traer filas ajenas si algún día `co_customer_select` se
 * abre.
 */
async function loadHistory(userId: string) {
  const { data, error } = await getSupabaseBrowser()
    .from('courier_orders')
    .select(
      'origin_name, origin_phone, origin_lat, origin_lng, origin_reference_text, destination_name, destination_phone, destination_lat, destination_lng, destination_reference_text, item_description, payer, status, created_at',
    )
    .eq('customer_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

export interface FlowContext {
  identity: CustomerIdentity
  /** «Repetir una entrega». */
  routes: CourierRoute[]
  /** Los sitios de la lupa. */
  points: CourierPoint[]
  /** «Mi dirección». */
  home: SavedAddress | null
}

export const EMPTY_FLOW_CONTEXT: FlowContext = {
  identity: { userId: null, name: '', phone: '', phoneVerified: false },
  routes: [],
  points: [],
  home: null,
}

/** Cuánto vale lo cargado: lo que dura abrir el flujo, no una sesión entera. */
const CONTEXT_TTL_MS = 10_000
let contextCache: { at: number; userId: string | null; value: Promise<FlowContext> } | null = null

/**
 * Todo lo que el flujo necesita saber de quien pide, UNA vez por apertura:
 * identidad, historial y dirección por defecto (cuatro consultas).
 *
 * Lo piden a la vez el mapa (los atajos del pin) y las hojas de después
 * (`TripDetailsSheet`, `ConfirmSheet`, vía `useCourierRequest`). Antes cada
 * uno cargaba lo suyo y el historial se leía dos veces; ahora el segundo
 * reutiliza la promesa del primero. Una apertura nueva, pasado el TTL, vuelve
 * a leer: la entrega recién pedida tiene que aparecer en «Repetir».
 *
 * La caché va ATADA A LA CUENTA: se compara con el usuario de la sesión
 * (lectura local, sin red) antes de reutilizarla. Sin esto, cerrar sesión y
 * entrar con otra cuenta dentro de los 10 s devolvía la identidad, la
 * dirección y las rutas de la anterior.
 */
export async function loadFlowContext(): Promise<FlowContext> {
  const {
    data: { session },
  } = await getSupabaseBrowser().auth.getSession()
  const userId = session?.user.id ?? null
  if (
    contextCache &&
    contextCache.userId === userId &&
    Date.now() - contextCache.at < CONTEXT_TTL_MS
  ) {
    return contextCache.value
  }
  const value = loadIdentity().then(async (identity) => {
    if (!identity.userId) return { ...EMPTY_FLOW_CONTEXT, identity }
    const [rows, home] = await Promise.all([loadHistory(identity.userId), loadDefaultAddress()])
    return {
      identity,
      routes: recentRoutes(rows),
      points: recentPoints(rows),
      home,
    }
  })
  const entry = { at: Date.now(), userId, value }
  contextCache = entry
  value.catch(() => {
    if (contextCache === entry) contextCache = null
  })
  return value
}
