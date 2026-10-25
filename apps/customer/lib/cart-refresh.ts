import type { BusinessDetail } from '@/features/catalog/types'
import type { CartState } from '@/lib/cart'

type RefreshableCart = Pick<
  CartState,
  'businessId' | 'lines' | 'validateAgainst' | 'hasInvalidLines'
>

/** Descarga el menú sin caché local y valida solo si la bolsa sigue siendo de ese negocio. */
export async function refreshCartValidation(
  fetchCatalog: (businessId: string) => Promise<{ data: BusinessDetail }>,
  getCart: () => RefreshableCart,
): Promise<'ok' | 'invalid' | 'unknown'> {
  const { businessId, lines } = getCart()
  if (!businessId || lines.length === 0) return 'ok'

  let catalog: BusinessDetail
  try {
    const response = await fetchCatalog(businessId)
    catalog = response.data
  } catch {
    return 'unknown'
  }

  const cart = getCart()
  if (cart.lines.length === 0) return 'ok'
  if (cart.businessId !== businessId || catalog.business.id !== businessId) return 'unknown'

  cart.validateAgainst(catalog)
  return cart.hasInvalidLines() ? 'invalid' : 'ok'
}
