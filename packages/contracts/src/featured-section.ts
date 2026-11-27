/**
 * «Destacados» (CUS-CAT-028): una sección de la carta con platos de cualquier categoría, que elige el restaurante, con el
 * nombre que ponga. La arma el servidor para que Android, iOS y la web no repitan la regla.
 *
 * Entran los platos marcados (`menu_items.is_featured`, 0290) que estén disponibles y tengan foto, en el orden de la
 * carta, hasta `FEATURED_MAX_ITEMS`. La franja horaria de cada plato NO se evalúa aquí: la caché de 15 s de la carta
 * serviría un resultado viejo (ver `menu-availability.ts`); cada cliente apaga el plato con su reloj.
 */
export const FEATURED_MAX_ITEMS = 6
export const FEATURED_DEFAULT_TITLE = 'Destacados'

export interface FeaturedCandidate {
  id: string
  is_featured?: boolean | null
  is_available: boolean
  thumbnail_url?: string | null
  image_url?: string | null
}

export interface FeaturedSection {
  title: string
  item_ids: string[]
}

/** [categories] son las listas de platos de cada categoría, en el orden en que se muestran. */
export function featuredSection(
  categories: readonly (readonly FeaturedCandidate[])[],
  title: string | null | undefined,
): FeaturedSection | null {
  const ids = categories
    .flat()
    .filter((item) => item.is_featured === true && item.is_available && hasPhoto(item))
    .map((item) => item.id)
    .slice(0, FEATURED_MAX_ITEMS)
  if (ids.length === 0) return null
  return { title: title?.trim() || FEATURED_DEFAULT_TITLE, item_ids: ids }
}

function hasPhoto(item: FeaturedCandidate): boolean {
  return Boolean(item.thumbnail_url?.trim() || item.image_url?.trim())
}
