/**
 * Acceso a datos de Tindivo Store (0242/0243) para las rutas de la API.
 *
 * Las tablas de Store aún no están en `database.types.ts` (se regenera contra el
 * remoto DESPUÉS del `db push`, ver CLAUDE.md), así que aquí se usa un cliente
 * sin tipos y las filas se tipan a mano. Cuando se regeneren los tipos, esta es
 * la única capa que hay que apretar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  STORE_REFS,
  type StoreAudience,
  type StoreCondition,
  type StoreProductPatch,
  type StoreSettings,
  type StoreStatus,
  storeSettingsSchema,
} from '@tindivo/contracts'
import { DomainError } from '@tindivo/core'
import { createServiceClient } from '../supabase/service'

export function storeDb(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient
}

// ── Filas y DTOs ────────────────────────────────────────────────────────────

export interface StoreImageDto {
  id: string
  url: string
  thumbUrl: string
  position: number
}

/** Tarjeta de la grilla (también la usa «Vendidos recientemente» y «Relacionados»). */
export interface StoreCardDto {
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

export interface StoreDetailDto extends StoreCardDto {
  description: string | null
  negotiable: boolean
  audience: StoreAudience | null
  createdAt: string
  images: StoreImageDto[]
}

/** Fila del admin: la tarjeta más lo que Jesús necesita para operar. */
export interface StoreAdminItemDto extends StoreDetailDto {
  categoryId: string | null
  updatedAt: string
  publishedAt: string | null
  views: number
  whatsappClicks: number
}

type Row = Record<string, unknown>

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Fila `store_products` (con `store_categories` y `store_product_images` anidadas) → DTO. */
export function mapProductRow(r: Row): StoreAdminItemDto {
  const cat = (r.store_categories ?? null) as Row | null
  const imgs = ((r.store_product_images ?? []) as Row[])
    .map((i) => ({
      id: i.id as string,
      url: i.url as string,
      thumbUrl: i.thumb_url as string,
      position: Number(i.position),
    }))
    .sort((a, b) => a.position - b.position)
  return {
    id: r.id as string,
    code: r.code as string,
    slug: (r.slug as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    price: num(r.price),
    originalPrice: num(r.original_price),
    isClearance: Boolean(r.is_clearance),
    negotiable: Boolean(r.negotiable),
    condition: (r.condition as StoreCondition | null) ?? null,
    conditionScore: num(r.condition_score),
    sizeLabel: (r.size_label as string | null) ?? null,
    audience: (r.audience as StoreAudience | null) ?? null,
    status: r.status as StoreStatus,
    categoryId: (r.category_id as string | null) ?? null,
    categorySlug: (cat?.slug as string | undefined) ?? null,
    categoryName: (cat?.name as string | undefined) ?? null,
    thumbUrl: imgs[0]?.thumbUrl ?? null,
    coverFocusX: Number(r.cover_focus_x ?? 0.5),
    coverFocusY: Number(r.cover_focus_y ?? 0.5),
    soldAt: (r.sold_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    publishedAt: (r.published_at as string | null) ?? null,
    images: imgs,
    views: 0,
    whatsappClicks: 0,
  }
}

/** Fila JSON de `list_store_products` / `list_store_sold` (snake_case) → tarjeta. */
export function mapCardJson(r: Row): StoreCardDto {
  return {
    id: r.id as string,
    code: r.code as string,
    slug: (r.slug as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    price: num(r.price),
    originalPrice: num(r.original_price),
    isClearance: Boolean(r.is_clearance),
    condition: (r.condition as StoreCondition | null) ?? null,
    conditionScore: num(r.condition_score),
    sizeLabel: (r.size_label as string | null) ?? null,
    status: ((r.status as StoreStatus | undefined) ?? 'sold') as StoreStatus,
    categorySlug: (r.category_slug as string | null) ?? null,
    categoryName: (r.category_name as string | null) ?? null,
    thumbUrl: (r.thumb_url as string | null) ?? null,
    coverFocusX: Number(r.cover_focus_x ?? 0.5),
    coverFocusY: Number(r.cover_focus_y ?? 0.5),
    soldAt: (r.sold_at as string | null) ?? null,
  }
}

export const PRODUCT_SELECT =
  '*, store_categories(slug,name), store_product_images(id,url,thumb_url,position)'

// ── Ajustes ─────────────────────────────────────────────────────────────────

const SETTINGS_FALLBACK: StoreSettings = {
  whatsappNumber: '51906550166',
  deliveryMin: 2,
  deliveryMax: 2.5,
  deliveryText: null,
}

/** `app_settings.store`. Si la fila falta o está corrupta, los valores iniciales del PRD. */
export async function readStoreSettings(db: SupabaseClient): Promise<StoreSettings> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'store').maybeSingle()
  const parsed = storeSettingsSchema.safeParse(data?.value)
  return parsed.success ? parsed.data : SETTINGS_FALLBACK
}

// ── Errores de la base → errores de dominio ─────────────────────────────────

const DB_MESSAGES: Record<string, { message: string; code: 'validation_error' | 'conflict' }> = {
  store_product_needs_a_photo: {
    message: 'Un artículo necesita al menos una foto',
    code: 'validation_error',
  },
  store_product_max_photos: { message: 'Máximo 6 fotos por artículo', code: 'validation_error' },
  store_product_cannot_return_to_draft: {
    message: 'Un artículo publicado no vuelve a borrador',
    code: 'conflict',
  },
}

/** Traduce las excepciones de los triggers de la 0242 a un error legible. */
export function throwDbError(error: { message: string; code?: string }): never {
  for (const [key, mapped] of Object.entries(DB_MESSAGES)) {
    if (error.message.includes(key)) throw new DomainError(mapped.message, mapped.code)
  }
  if (error.message.includes('store_products_publishable_chk')) {
    throw new DomainError('Faltan datos para publicar el artículo', 'validation_error')
  }
  throw new Error(error.message)
}

/** El `ref` del link, solo si es una fuente conocida. */
export function cleanRef(value: string | null): string | null {
  return value && (STORE_REFS as readonly string[]).includes(value) ? value : null
}

// ── Operaciones compartidas del admin ───────────────────────────────────────

/** Carga un artículo con categoría y fotos, o lanza 404. */
export async function loadProduct(db: SupabaseClient, id: string): Promise<StoreAdminItemDto> {
  const { data, error } = await db
    .from('store_products')
    .select(PRODUCT_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DomainError('Artículo no encontrado', 'not_found')
  return mapProductRow(data as Record<string, unknown>)
}

/** Parche del autosave (camelCase) → columnas (snake_case). Solo lo presente. */
export function patchToColumns(patch: StoreProductPatch): Record<string, unknown> {
  const map: Record<keyof StoreProductPatch, string> = {
    title: 'title',
    description: 'description',
    categoryId: 'category_id',
    audience: 'audience',
    condition: 'condition',
    conditionScore: 'condition_score',
    sizeLabel: 'size_label',
    price: 'price',
    originalPrice: 'original_price',
    isClearance: 'is_clearance',
    negotiable: 'negotiable',
    coverFocusX: 'cover_focus_x',
    coverFocusY: 'cover_focus_y',
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(map) as (keyof StoreProductPatch)[]) {
    if (patch[key] !== undefined) out[map[key]] = patch[key]
  }
  // El estado 1–10 solo existe en lo usado (PRD §6.3): al pasar a nuevo se limpia.
  if (patch.condition && patch.condition !== 'used') out.condition_score = null
  return out
}

/** Ruta dentro del bucket a partir de la URL pública de una foto. */
export function storagePathFromUrl(url: string): string | null {
  const marker = '/store-products/'
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0] ?? '')
}

/** Metas del experimento (PRD §1 y §9): mínimo para seguir y meta. */
export const STORE_GOALS = {
  visits: { min: 150, target: 250 },
  whatsappClicks: { min: 20, target: 40 },
  sales: { min: 5, target: 8 },
  amountSold: { min: 150, target: 250 },
} as const

/** Borra del bucket las fotos de las URLs dadas. Best-effort: un huérfano no rompe nada. */
export async function storageDeleteUrls(db: SupabaseClient, urls: string[]): Promise<void> {
  const paths = urls.map(storagePathFromUrl).filter((p): p is string => !!p)
  if (paths.length === 0) return
  const { error } = await db.storage.from('store-products').remove(paths)
  if (error) console.error('[store] no se pudieron borrar fotos del bucket:', error.message)
}
