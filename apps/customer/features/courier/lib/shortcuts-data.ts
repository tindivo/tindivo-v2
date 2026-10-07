'use client'

import { getSupabaseBrowser } from '@/lib/supabase/client'
import type { CourierPoint } from '../types'
import { type CourierRoute, recentPoints, recentRoutes } from './routes'

export interface SavedAddress {
  referenceText: string
  coordinates: { lat: number; lng: number }
}

/** La dirección por defecto del cliente (`customer_addresses`), la de sus pedidos de comida. */
export async function loadDefaultAddress(): Promise<SavedAddress | null> {
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

export interface CourierShortcuts {
  routes: CourierRoute[]
  points: CourierPoint[]
  home: SavedAddress | null
}

const EMPTY: CourierShortcuts = { routes: [], points: [], home: null }

/**
 * Lo que alimenta los atajos del pin: «Repetir una entrega», los sitios
 * recientes de la lupa y «Mi dirección». Dos lecturas directas por RLS
 * (`co_customer_select`, y la de `customer_addresses`); el filtro por usuario
 * evita traer filas ajenas si algún día una policy se abre. Sin sesión, nada:
 * Entregas pide la cuenta al entrar, así que no debería pasar.
 */
export async function loadShortcuts(): Promise<CourierShortcuts> {
  const supabase = getSupabaseBrowser()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return EMPTY
  const [{ data: rows }, home] = await Promise.all([
    supabase
      .from('courier_orders')
      .select(
        'origin_name, origin_phone, origin_lat, origin_lng, origin_reference_text, destination_name, destination_phone, destination_lat, destination_lng, destination_reference_text, item_description, payer, status',
      )
      .eq('customer_user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    loadDefaultAddress(),
  ])
  return { routes: recentRoutes(rows ?? []), points: recentPoints(rows ?? []), home }
}
