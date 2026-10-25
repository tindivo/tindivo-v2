import type { BusinessDetail } from '@/features/catalog/types'
import type { CartState } from '@/lib/cart'

type RefreshableCart = Pick<
  CartState,
  'businessId' | 'lines' | 'validateAgainst' | 'hasInvalidLines'
>

interface CartSnapshot {
  businessId: string | null
  lines: readonly unknown[]
}

/** El store reemplaza el arreglo de líneas cada vez que cambia la bolsa. */
export function isCartUnchanged(expected: CartSnapshot, current: CartSnapshot): boolean {
  return expected.businessId === current.businessId && expected.lines === current.lines
}

/** Descarga el menú sin caché local y valida solo la bolsa que se va a enviar. */
export async function refreshCartValidation(
  fetchCatalog: (businessId: string) => Promise<{ data: BusinessDetail }>,
  getCart: () => RefreshableCart,
  expected: CartSnapshot,
): Promise<'ok' | 'invalid' | 'unknown' | 'changed'> {
  if (!isCartUnchanged(expected, getCart())) return 'changed'
  const { businessId, lines } = expected
  if (!businessId || lines.length === 0) return 'ok'

  let catalog: BusinessDetail
  try {
    const response = await fetchCatalog(businessId)
    catalog = response.data
  } catch {
    return isCartUnchanged(expected, getCart()) ? 'unknown' : 'changed'
  }

  const cart = getCart()
  if (!isCartUnchanged(expected, cart)) return 'changed'
  if (catalog.business.id !== businessId) return 'unknown'

  cart.validateAgainst(catalog)
  return cart.hasInvalidLines() ? 'invalid' : 'ok'
}
