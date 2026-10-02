import type { StoreAudience, StoreCondition, StoreSettings, StoreStatus } from '@tindivo/contracts'

/**
 * Forma de lo que devuelve `GET /public/store` y `GET /public/store/:slug`.
 * Espejo de `apps/api/lib/store/store.ts` (DTOs): el customer no puede importar
 * de la API, así que el contrato público vive duplicado aquí a propósito.
 */

export interface StoreImage {
  id: string
  url: string
  thumbUrl: string
  position: number
}

export interface StoreCard {
  id: string
  code: string
  slug: string | null
  title: string | null
  price: number | null
  originalPrice: number | null
  isClearance: boolean
  condition: StoreCondition | null
  conditionScore: number | null
  sizeLabel: string | null
  status: StoreStatus
  categorySlug: string | null
  categoryName: string | null
  thumbUrl: string | null
  coverFocusX: number
  coverFocusY: number
  soldAt: string | null
}

export interface StoreProduct extends StoreCard {
  description: string | null
  negotiable: boolean
  audience: StoreAudience | null
  createdAt: string
  images: StoreImage[]
}

export interface StoreCategory {
  slug: string
  name: string
  icon: string
  count: number
}

export type PublicStoreSettings = StoreSettings

export interface StoreListData {
  products: StoreCard[]
  sold: StoreCard[]
  categories: StoreCategory[]
  totalAvailable: number
  settings: PublicStoreSettings
}

export interface StoreDetailData {
  product: StoreProduct
  related: StoreCard[]
  settings: PublicStoreSettings
}

/** Filtros del listado, tal como viajan en la URL del comprador (en español). */
export interface StoreUrlFilters {
  q: string
  categoria: string
  condicion: '' | 'nuevo' | 'segunda'
  orden: '' | 'precio_asc' | 'precio_desc'
}
