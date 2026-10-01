'use client'

import type { DirectoryBusinessCategory } from '@tindivo/contracts'
import { getSupabaseBrowser } from '@/lib/supabase/client'

// Fuente única en @tindivo/contracts (`courier.ts`): la prioridad
// partner > courier_enabled > visible_only se resuelve en un solo sitio.
// Se re-exporta para no repetir el import en cada pantalla del directorio.
export { type DirectoryCardState, directoryCardStateOf } from '@tindivo/contracts'

/**
 * El directorio de negocios de Tindivo Entregas. SE LEE DIRECTO DESDE EL
 * NAVEGADOR, sin pasar por `/api/v1` — mismo patrón y mismo motivo que
 * `lib/landmarks.ts`: `directory_businesses` es de solo lectura detrás de la
 * policy `db_public_read`, y meterla en un endpoint solo sumaría el medio
 * segundo de piso del salto a la API sin ganar ningún control adicional
 * (DECISIONS.md §30, decidido para este mismo módulo).
 */
export interface DirectoryBusiness {
  id: string
  name: string
  category: DirectoryBusinessCategory
  lat: number
  lng: number
  referenceText: string
  phone: string | null
  whatsapp: string | null
  opensAt: string | null
  closesAt: string | null
  coverPhotoUrl: string | null
  isPartner: boolean
  partnerBusinessId: string | null
  courierEnabled: boolean
  hasMenuInTindivo: boolean
  worksWithZorritos: boolean
}

let cached: Promise<DirectoryBusiness[]> | null = null

async function fetchDirectory(): Promise<DirectoryBusiness[]> {
  try {
    const { data } = await getSupabaseBrowser()
      .from('directory_businesses')
      .select(
        'id,name,category,lat,lng,reference_text,phone,whatsapp,opens_at,closes_at,cover_photo_url,is_partner,partner_business_id,courier_enabled,has_menu_in_tindivo,works_with_zorritos',
      )
      // Redundante con la policy, explícito por la misma razón que `landmarks.ts`.
      .eq('visible_on_map', true)
      .order('name')
    if (!data) return []
    return data.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      lat: Number(r.lat),
      lng: Number(r.lng),
      referenceText: r.reference_text,
      phone: r.phone,
      whatsapp: r.whatsapp,
      opensAt: r.opens_at,
      closesAt: r.closes_at,
      coverPhotoUrl: r.cover_photo_url,
      isPartner: r.is_partner,
      partnerBusinessId: r.partner_business_id,
      courierEnabled: r.courier_enabled,
      hasMenuInTindivo: r.has_menu_in_tindivo,
      worksWithZorritos: r.works_with_zorritos,
    }))
  } catch {
    // Un fallo acá no puede bloquear el resto de la app: el directorio es un
    // descubrimiento, no un requisito de nada más.
    return []
  }
}

/** Negocios visibles, memoizados por sesión de página (como `getLandmarks`). */
export function getDirectory(): Promise<DirectoryBusiness[]> {
  if (!cached) cached = fetchDirectory()
  return cached
}

/** Fuerza un re-fetch (p.ej. tras un pull-to-refresh en el directorio). */
export function invalidateDirectoryCache(): void {
  cached = null
}

export const DIRECTORY_CATEGORY_LABEL: Record<DirectoryBusinessCategory, string> = {
  chicken_grill: 'Pollo / parrilla',
  chifa: 'Chifa',
  pizza_burgers: 'Pizza y hamburguesas',
  snacks: 'Snacks y comida rápida',
  desserts: 'Postres y helados',
  drinks_liquor: 'Bebidas y licores',
  pharmacy: 'Farmacia',
  bodega: 'Minimarket / bodega',
  other: 'Otros',
}
