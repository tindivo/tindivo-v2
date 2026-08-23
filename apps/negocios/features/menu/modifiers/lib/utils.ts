import type { LibraryGroup, RuleMode } from '../types'

export function ruleToMode(g: Pick<LibraryGroup, 'is_required' | 'max_selections'>): RuleMode {
  if (g.is_required && g.max_selections === 1) return 'required-one'
  if (g.is_required) return 'required-many'
  if (g.max_selections === 1) return 'optional-one'
  return 'optional-many'
}

export function modeToRule(
  mode: RuleMode,
  prevMax: number | null,
): Pick<LibraryGroup, 'is_required' | 'min_selections' | 'max_selections' | 'selection_type'> {
  const many = prevMax && prevMax > 1 ? prevMax : 3
  switch (mode) {
    case 'required-one':
      return { is_required: true, min_selections: 1, max_selections: 1, selection_type: 'single' }
    case 'required-many':
      return { is_required: true, min_selections: 1, max_selections: many, selection_type: 'multi' }
    case 'optional-one':
      return { is_required: false, min_selections: 0, max_selections: 1, selection_type: 'single' }
    case 'optional-many':
      return {
        is_required: false,
        min_selections: 0,
        max_selections: many,
        selection_type: 'multi',
      }
  }
}

export const RULE_LABELS: Record<RuleMode, string> = {
  'required-one': 'Obligatorio · elegir 1',
  'required-many': 'Obligatorio · elegir varias',
  'optional-one': 'Opcional · elegir 1',
  'optional-many': 'Opcional · elegir varias',
}

/**
 * Un grupo obligatorio sin ninguna opción disponible deja el plato imposible de
 * pedir: el catálogo filtra las opciones agotadas, el cliente ve el grupo vacío
 * y el botón de agregar al carrito nunca se habilita (`use-product-options`).
 * El plato sigue visible en la carta, así que nadie se entera desde el negocio.
 */
export function blocksItems(g: LibraryGroup): boolean {
  return g.is_required && g.options.length > 0 && g.options.every((o) => !o.is_available)
}

/** La opción que se apaga es la última que sostenía un grupo obligatorio. */
export function isLastAvailable(g: LibraryGroup, optionId: string): boolean {
  if (!g.is_required) return false
  const available = g.options.filter((o) => o.is_available)
  return available.length === 1 && available[0]?.id === optionId
}
