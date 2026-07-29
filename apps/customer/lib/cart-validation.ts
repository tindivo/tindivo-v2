import type { BusinessDetail, MenuItem, ModOption } from '@/features/catalog/types'

export type CartIssueKind = 'removed' | 'unavailable' | 'price_changed'

export interface CartLineIssue {
  kind: CartIssueKind
  /** Texto breve para mostrar al usuario. */
  message: string
}

export interface InvalidCartLine {
  key: string
  name: string
  quantity: number
  issues: CartLineIssue[]
}

/** Subconjunto de CartLine suficiente para validar; evita ciclo con lib/cart. */
export interface ValidatableCartLine {
  key: string
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  modifiers: { optionId: string; optionName: string; price: number }[]
}

export interface CartValidationResult {
  /** Líneas que aún son válidas para comprar. */
  validLines: ValidatableCartLine[]
  /** Líneas con algún problema (precio cambiado, no disponible, eliminado). */
  invalidLines: InvalidCartLine[]
  /** true si el catálogo no pudo cargarse y no se pudo validar. */
  unchecked: boolean
  /** Momento en que se generó la validación. */
  validatedAt: number
}

export interface FlatMenuItem extends MenuItem {
  categoryId: string
}

function flattenCatalog(catalog: BusinessDetail): Map<string, FlatMenuItem> {
  const map = new Map<string, FlatMenuItem>()
  for (const category of catalog.categories) {
    for (const item of category.items) {
      map.set(item.id, { ...item, categoryId: category.id })
    }
  }
  return map
}

function findOption(catalogItem: MenuItem, optionId: string): ModOption | undefined {
  for (const group of catalogItem.modifier_groups ?? []) {
    const found = group.options.find((o) => o.id === optionId)
    if (found) return found
  }
  return undefined
}

function roundPrice(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compara el carrito contra el catálogo actual del backend.
 * Detecta:
 * - ítem eliminado del menú
 * - ítem marcado como no disponible
 * - cambio de precio base
 * - modificador eliminado o con precio cambiado
 */
export function validateCartAgainstCatalog(
  lines: ValidatableCartLine[],
  catalog: BusinessDetail | null | undefined,
): CartValidationResult {
  if (!catalog) {
    return { validLines: lines, invalidLines: [], unchecked: true, validatedAt: Date.now() }
  }

  const itemsById = flattenCatalog(catalog)
  const validLines: ValidatableCartLine[] = []
  const invalidLines: InvalidCartLine[] = []

  for (const line of lines) {
    const catalogItem = itemsById.get(line.itemId)
    const issues: CartLineIssue[] = []

    if (!catalogItem) {
      issues.push({ kind: 'removed', message: 'Este producto ya no está disponible' })
    } else {
      if (!catalogItem.is_available) {
        issues.push({ kind: 'unavailable', message: 'Producto agotado por ahora' })
      }
      if (catalogItem.base_price !== line.unitPrice && line.modifiers.length === 0) {
        // Precio base cambió y la línea no lleva modificadores.
        const diff = roundPrice(catalogItem.base_price - line.unitPrice)
        issues.push({
          kind: 'price_changed',
          message: `Precio actualizado (${diff >= 0 ? '+' : ''}S/ ${diff.toFixed(2)})`,
        })
      }

      // Validar modificadores y recalcular precio esperado.
      let expectedUnitPrice = catalogItem.base_price
      for (const mod of line.modifiers) {
        const option = findOption(catalogItem, mod.optionId)
        if (!option) {
          issues.push({ kind: 'removed', message: 'Una opción ya no está disponible' })
        } else {
          expectedUnitPrice += option.additional_price
          if (option.additional_price !== mod.price) {
            issues.push({
              kind: 'price_changed',
              message: `Opción "${option.name}" cambió de precio`,
            })
          }
        }
      }

      expectedUnitPrice = roundPrice(expectedUnitPrice)
      if (line.modifiers.length > 0 && expectedUnitPrice !== line.unitPrice) {
        const diff = roundPrice(expectedUnitPrice - line.unitPrice)
        issues.push({
          kind: 'price_changed',
          message: `Precio actualizado (${diff >= 0 ? '+' : ''}S/ ${diff.toFixed(2)})`,
        })
      }
    }

    if (issues.length === 0) {
      validLines.push(line)
    } else {
      invalidLines.push({
        key: line.key,
        name: line.name,
        quantity: line.quantity,
        issues,
      })
    }
  }

  return { validLines, invalidLines, unchecked: false, validatedAt: Date.now() }
}

/** Devuelve true si la validación ya es vieja (más de N ms). */
export function isValidationStale(
  result: CartValidationResult | null,
  ms = 5 * 60 * 1000,
): boolean {
  if (!result) return true
  return Date.now() - result.validatedAt > ms
}
