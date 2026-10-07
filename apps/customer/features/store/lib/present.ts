import { buildProductPath, type StoreProductCore } from '@tindivo/contracts'
import type { StoreCard } from '../types'

/**
 * Una tarjeta pública SIEMPRE es de un artículo publicado, así que título,
 * precio y condición existen (la base lo garantiza con
 * `store_products_publishable_chk`). Si algún día faltara, mejor no pintarla
 * que pintar «S/null»: devuelve null y el llamador la omite.
 */
export function toCore(c: StoreCard): StoreProductCore | null {
  if (!c.title || c.price === null || !c.condition) return null
  return {
    code: c.code,
    slug: c.slug,
    title: c.title,
    price: c.price,
    originalPrice: c.originalPrice,
    isClearance: c.isClearance,
    condition: c.condition,
    conditionScore: c.conditionScore,
    sizeLabel: c.sizeLabel,
    status: c.status,
  }
}

/** Ruta del artículo dentro de la app, o null si aún no tiene slug. */
export function cardHref(c: Pick<StoreCard, 'slug'>): string | null {
  return c.slug ? buildProductPath(c.slug) : null
}

/** «Talla M», «100 ml»… tal como se escribió: la talla/medida es texto libre. */
export function sizeText(label: string | null): string | null {
  return label ? label : null
}
