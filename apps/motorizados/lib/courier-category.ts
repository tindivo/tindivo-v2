/**
 * La categoría de lo que se lleva, para el motorizado.
 *
 * EL CONTRATO NO TIENE CAMPO DE CATEGORÍA: los botones del cliente
 * (`trip-details-sheet`, «¿Qué llevamos?») solo rellenan `itemDescription`
 * con su texto («Comida», «Documentos»…). Se reconoce por ese texto; lo que el
 * cliente escribió a mano cae en «Otro» y se enseña tal cual.
 *
 * Iconos SOLO del subset de `public/fonts/icons.txt`: uno que no esté sale
 * como texto roto en pantalla (CLAUDE.md, invariante 9).
 */

export interface CourierCategory {
  label: string
  icon: string
  /** Lo que escribió el cliente, si dice algo más que la categoría. */
  detail: string | null
}

const KNOWN: { match: RegExp; label: string; icon: string }[] = [
  { match: /^comida\b/i, label: 'Comida', icon: 'fastfood' },
  { match: /^documentos?\b/i, label: 'Documentos', icon: 'receipt_long' },
  { match: /^medicinas?\b/i, label: 'Medicinas', icon: 'add' },
  { match: /^ropa\b/i, label: 'Ropa', icon: 'shopping_bag' },
]

export function courierCategory(itemDescription: string): CourierCategory {
  const text = itemDescription.trim()
  const known = KNOWN.find((k) => k.match.test(text))
  if (!known) return { label: 'Otro', icon: 'inventory_2', detail: text || null }
  const rest = text.replace(known.match, '').replace(/^[\s,.:·-]+/, '')
  return { label: known.label, icon: known.icon, detail: rest || null }
}
