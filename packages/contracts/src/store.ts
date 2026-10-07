/**
 * Tindivo Store — contratos y reglas puras.
 *
 * Spec: Docs/Store/tindivo-store-prd-v2.md. Todo lo de aquí es TS puro (sin I/O)
 * para que lo usen igual la API, el customer y el admin.
 *
 * Los IDENTIFICADORES van en inglés (convención del repo) y los TEXTOS que ve
 * la gente, en español peruano. La URL pública del comprador es la excepción
 * deliberada: `?categoria=ropa&condicion=segunda&orden=precio_asc` se comparte
 * por WhatsApp y tiene que leerse (PRD §5.1); `parseStoreListParams` traduce.
 */
import { z } from 'zod'

// ── Enums ───────────────────────────────────────────────────────────────────

export const STORE_STATUSES = ['draft', 'available', 'reserved', 'sold', 'hidden'] as const
export type StoreStatus = (typeof STORE_STATUSES)[number]

export const STORE_CONDITIONS = ['new_with_tag', 'new_unused', 'used'] as const
export type StoreCondition = (typeof STORE_CONDITIONS)[number]

export const STORE_AUDIENCES = ['women', 'men', 'kids', 'unisex'] as const
export type StoreAudience = (typeof STORE_AUDIENCES)[number]

/** Fuentes conocidas del `?ref=` (PRD §5.5). */
export const STORE_REFS = ['fb', 'mp', 'wa_estado', 'grupo', 'tiktok'] as const
export type StoreRef = (typeof STORE_REFS)[number]

export const STORE_EVENT_TYPES = [
  'view_list',
  'view_product',
  'search',
  'filter_open',
  'filter_apply',
  'click_whatsapp',
  'click_notify',
  'share',
  'nav_out',
] as const
export type StoreEventType = (typeof STORE_EVENT_TYPES)[number]

export const STORE_MAX_PHOTOS = 6
export const STORE_TITLE_MAX = 60
export const STORE_DESCRIPTION_MAX = 600
export const STORE_SIZE_MAX = 20
/** Tope (en caracteres de JSON) del `metadata` de un evento anónimo. */
export const STORE_EVENT_METADATA_MAX = 1000

// ── Modelo mínimo para las reglas ───────────────────────────────────────────

/** Lo que tiene un artículo YA PUBLICADO: los campos obligatorios existen. */
export interface StoreProductCore {
  code: string
  slug: string | null
  title: string
  price: number
  originalPrice: number | null
  isClearance: boolean
  condition: StoreCondition
  conditionScore: number | null
  sizeLabel: string | null
  status: StoreStatus
}

/** Un borrador: casi todo puede faltar todavía. */
export type StoreDraftFields = {
  [K in keyof StoreProductCore]: K extends 'code' | 'slug' | 'status' | 'isClearance'
    ? StoreProductCore[K]
    : StoreProductCore[K] | null
} & { categoryId: string | null }

// ── Presentación ────────────────────────────────────────────────────────────

/** `S/30` si es entero, `S/29.50` si tiene céntimos (PRD §5: «S/30», «S/2.00–2.50»). */
export function formatStorePrice(value: number): string {
  const cents = Math.round(value * 100)
  return cents % 100 === 0 ? `S/${cents / 100}` : `S/${(cents / 100).toFixed(2)}`
}

/**
 * Porcentaje de descuento, o null si no corresponde mostrarlo. El precio
 * original solo cuenta si es MAYOR que el actual (PRD §4) y un descuento que
 * redondea a 0 % sería ruido.
 */
export function discountPercent(price: number, originalPrice: number | null): number | null {
  if (originalPrice === null || originalPrice <= price) return null
  const pct = Math.round(((originalPrice - price) / originalPrice) * 100)
  return pct >= 1 ? pct : null
}

export function conditionScoreLabel(score: number): string {
  if (score >= 10) return 'Impecable'
  if (score >= 8) return 'Muy buen estado'
  if (score >= 6) return 'Buen estado, con uso'
  return 'Con detalles visibles (ver fotos)'
}

export type StoreBadge =
  | { kind: 'discount'; percent: number }
  | { kind: 'clearance' }
  | { kind: 'new' }
  | { kind: 'score'; score: number }
  | { kind: 'reserved' }
  | { kind: 'sold' }

/**
 * UNA sola insignia por tarjeta (PRD §5.1). Reservado y vendido reemplazan a la
 * normal: lo que importa de una pieza apartada es que está apartada.
 * Prioridad: −X % › Remate › Nuevo con etiqueta › Estado N/10.
 */
export function primaryBadge(p: StoreProductCore): StoreBadge | null {
  if (p.status === 'reserved') return { kind: 'reserved' }
  if (p.status === 'sold') return { kind: 'sold' }
  const percent = discountPercent(p.price, p.originalPrice)
  if (percent !== null) return { kind: 'discount', percent }
  if (p.isClearance) return { kind: 'clearance' }
  if (p.condition === 'new_with_tag') return { kind: 'new' }
  if (p.condition === 'used' && p.conditionScore !== null) {
    return { kind: 'score', score: p.conditionScore }
  }
  return null
}

// ── Publicar y cambiar de estado ────────────────────────────────────────────

/**
 * Qué falta para publicar, en el orden del formulario, o null si está listo.
 * El botón «Publicar» muestra este texto (PRD §6.3). Es la MISMA regla que
 * `store_products_publishable_chk` en la base (0242): si cambia una, la otra.
 */
export function missingForPublish(p: StoreDraftFields, photoCount: number): string | null {
  if (photoCount < 1) return 'Falta al menos una foto'
  if (!p.title || p.title.trim().length === 0) return 'Falta el título'
  if (p.price === null || p.price <= 0) return 'Falta el precio'
  if (!p.categoryId) return 'Falta la categoría'
  if (!p.condition) return 'Falta la condición'
  if (p.condition === 'used' && p.conditionScore === null) return 'Falta el estado del 1 al 10'
  return null
}

/**
 * Un borrador solo sale publicando; nada vuelve a borrador (el link ya
 * compartido no puede morir); entre publicados se mueve libre, incluido
 * revertir un vendido (PRD §6.2).
 */
export function canTransitionStoreStatus(from: StoreStatus, to: StoreStatus): boolean {
  if (from === to) return false
  if (to === 'draft') return false
  if (from === 'draft') return to === 'available'
  return true
}

// ── WhatsApp ────────────────────────────────────────────────────────────────

export function buildWhatsappMessage(p: StoreProductCore, productUrl: string): string {
  return `Hola Tindivo, quiero: ${p.title} (${formatStorePrice(p.price)}) — código ${p.code}. ${productUrl} ¿Sigue disponible?`
}

export function buildReservedMessage(p: Pick<StoreProductCore, 'code'>): string {
  return `Hola Tindivo, vi que ${p.code} está reservado. Avísame si se libera.`
}

export function buildSearchMessage(term: string): string {
  return `Hola Tindivo, busco: ${term.trim()}. ¿Me avisan si llega?`
}

/** `wa.me` solo admite dígitos en el número; el texto va codificado. */
export function buildWhatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

// ── Links y texto para redes ────────────────────────────────────────────────

export function buildProductPath(slug: string, ref?: StoreRef | null): string {
  return ref ? `/store/${slug}?ref=${ref}` : `/store/${slug}`
}

/** «Copiar texto para redes» (PRD §6.2). `origin` sin barra final. */
export function buildShareText(p: StoreProductCore, origin: string, ref?: StoreRef | null): string {
  if (!p.slug) throw new Error('store_share_text_needs_a_published_product')
  const parts = [p.title]
  if (p.condition === 'used' && p.conditionScore !== null)
    parts.push(`Estado ${p.conditionScore}/10`)
  const before = discountPercent(p.price, p.originalPrice) !== null && p.originalPrice !== null
  parts.push(
    before
      ? `${formatStorePrice(p.price)} (antes ${formatStorePrice(p.originalPrice as number)})`
      : formatStorePrice(p.price),
  )
  parts.push('Entrega en San Jacinto, pagas al recibir')
  parts.push(`${origin}${buildProductPath(p.slug, ref)}`)
  return parts.join(' · ')
}

// ── URL del listado ─────────────────────────────────────────────────────────

export type StoreListOrder = 'recent' | 'price_asc' | 'price_desc'
export type StoreListConditionFilter = 'new' | 'used' | null

export interface StoreListFilters {
  q: string | null
  category: string | null
  condition: StoreListConditionFilter
  order: StoreListOrder
}

const CONDITION_FROM_URL: Record<string, StoreListConditionFilter> = {
  nuevo: 'new',
  segunda: 'used',
  todo: null,
}
const ORDER_FROM_URL: Record<string, StoreListOrder> = {
  precio_asc: 'price_asc',
  precio_desc: 'price_desc',
}

/** Traduce `?q=&categoria=&condicion=&orden=` (español, compartible) a filtros. */
export function parseStoreListParams(params: Record<string, string | undefined>): StoreListFilters {
  const q = (params.q ?? '').trim().slice(0, 80)
  const category = (params.categoria ?? '').trim()
  return {
    q: q.length > 0 ? q : null,
    category: category.length > 0 ? category : null,
    condition: CONDITION_FROM_URL[params.condicion ?? ''] ?? null,
    order: ORDER_FROM_URL[params.orden ?? ''] ?? 'recent',
  }
}

// ── Esquemas ────────────────────────────────────────────────────────────────

/** Un texto opcional: vacío o solo espacios significa «bórralo». */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => {
      const t = s.trim()
      return t.length > 0 ? t : null
    })

/**
 * Parche del autosave (PRD §6.3): cualquier subconjunto de campos editables.
 * `status`, `code`, `slug` y `soldAt` NO están aquí a propósito — z.object
 * descarta lo desconocido, así que un cliente no puede colarlos. El estado va
 * por su propio endpoint (transiciones con Deshacer).
 */
export const storeProductPatchSchema = z.object({
  title: optionalText(STORE_TITLE_MAX).optional(),
  description: optionalText(STORE_DESCRIPTION_MAX).optional(),
  categoryId: z.uuid().nullable().optional(),
  audience: z.enum(STORE_AUDIENCES).nullable().optional(),
  condition: z.enum(STORE_CONDITIONS).nullable().optional(),
  conditionScore: z.number().int().min(1).max(10).nullable().optional(),
  sizeLabel: optionalText(STORE_SIZE_MAX).optional(),
  price: z.number().positive().max(100000).nullable().optional(),
  originalPrice: z.number().positive().max(100000).nullable().optional(),
  isClearance: z.boolean().optional(),
  negotiable: z.boolean().optional(),
  coverFocusX: z.number().min(0).max(1).optional(),
  coverFocusY: z.number().min(0).max(1).optional(),
})
export type StoreProductPatch = z.infer<typeof storeProductPatchSchema>

export const storeStatusChangeSchema = z.object({
  status: z.enum(['available', 'reserved', 'sold', 'hidden']),
})

/** Evento del embudo. Un `ref` desconocido se descarta, no rompe el registro. */
export const storeEventSchema = z.object({
  type: z.enum(STORE_EVENT_TYPES),
  sessionId: z.string().min(8).max(64),
  productId: z.uuid().nullable().optional().default(null),
  searchTerm: z
    .string()
    .max(80)
    .nullable()
    .optional()
    .transform((s) => {
      const t = (s ?? '').trim()
      return t.length > 0 ? t : null
    }),
  ref: z
    .string()
    .nullable()
    .optional()
    .transform((r) =>
      (STORE_REFS as readonly string[]).includes(r ?? '') ? (r as StoreRef) : null,
    ),
  // El endpoint es público y anónimo: sin tope, cualquiera podría guardar megas por evento.
  metadata: z
    .record(z.string(), z.unknown())
    .refine(
      (m) => JSON.stringify(m).length <= STORE_EVENT_METADATA_MAX,
      'metadata demasiado grande',
    )
    .nullable()
    .optional()
    .default(null),
})
export type StoreEventInput = z.infer<typeof storeEventSchema>

/** `app_settings.store` (PRD §6.4). */
export const storeSettingsSchema = z
  .object({
    whatsappNumber: z
      .string()
      .transform((s) => s.replace(/\D/g, ''))
      .pipe(z.string().regex(/^\d{11,15}$/, 'Incluye el código de país (51…)')),
    deliveryMin: z.number().nonnegative().max(100),
    deliveryMax: z.number().nonnegative().max(100),
    deliveryText: z
      .string()
      .max(160)
      .nullable()
      .transform((s) => {
        const t = (s ?? '').trim()
        return t.length > 0 ? t : null
      }),
  })
  .refine((s) => s.deliveryMin <= s.deliveryMax, {
    message: 'El mínimo no puede superar al máximo',
    path: ['deliveryMin'],
  })
export type StoreSettings = z.infer<typeof storeSettingsSchema>
